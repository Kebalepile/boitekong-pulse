import {
  clearElement,
  createElement,
  clearFormErrors,
  setFieldError,
  createFieldError
} from "../utils/dom.js";
import { createNavbar } from "../components/navbar.js";
import { navigate, registerViewCleanup } from "../router.js";
import { showToast } from "../components/toast.js";
import { showUserPreviewSheet } from "../components/userPreviewSheet.js";
import {
  requestPhoneVerificationOtp,
  updateAuthenticatedUserProfile,
  verifyAuthenticatedUserPhoneOtp
} from "../services/authService.js";
import { createAvatarElement } from "../utils/avatar.js";
import {
  compressImageFile,
  formatImageOptimizationSummary
} from "../utils/imageCompression.js";
import { validateAvatarFile, MAX_AVATAR_FILE_BYTES } from "../utils/validators.js";
import { formatCompactCount } from "../utils/numberFormat.js";
import {
  getPostsByUserId,
  loadPostsByUserId,
  subscribeToPostChanges
} from "../services/postService.js";
import {
  getFollowerUsers,
  getFollowingUsers,
  fetchFollowerUsers,
  fetchFollowingUsers
} from "../services/userService.js";
import { setLiveSyncOptions } from "../services/liveSyncService.js";
import { showLoadingOverlay } from "../components/loadingOverlay.js";

const PROFILE_LOAD_PLACEHOLDER_TIMEOUT_MS = 3000;

function waitFor(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function renderProfile(app, currentUser, payload = null) {
  clearElement(app);
  const shell = createElement("section", { className: "feed-shell" });
  const navbar = createNavbar(currentUser, "profile");
  const main = createElement("main", { className: "profile-main profile-page-main" });
  const activeSection = payload?.section === "followers" || payload?.section === "following"
    ? payload.section
    : "home";
  const showEditForm = activeSection === "home" && payload?.editMode === true;

  if (activeSection === "followers" || activeSection === "following") {
    main.classList.add("profile-page-main-people");
  }

  shell.append(navbar, main);
  app.appendChild(shell);
  main.appendChild(
    createProfileLoadingSkeleton({
      activeSection,
      showEditForm
    })
  );

  const profileLoadPromise = Promise.allSettled([
    fetchFollowerUsers(currentUser.id),
    fetchFollowingUsers(currentUser.id),
    loadPostsByUserId(currentUser.id)
  ]);
  const racedProfileLoad = await Promise.race([
    profileLoadPromise.then((results) => ({
      timedOut: false,
      results
    })),
    waitFor(PROFILE_LOAD_PLACEHOLDER_TIMEOUT_MS).then(() => ({
      timedOut: true,
      results: null
    }))
  ]);
  const profileLoadResults = racedProfileLoad.timedOut
    ? [
        { status: "fulfilled", value: getFollowerUsers(currentUser.id) },
        { status: "fulfilled", value: getFollowingUsers(currentUser.id) },
        { status: "fulfilled", value: getPostsByUserId(currentUser.id) }
      ]
    : racedProfileLoad.results;
  const followerUsers =
    profileLoadResults[0]?.status === "fulfilled"
      ? profileLoadResults[0].value
      : getFollowerUsers(currentUser.id);
  const followingUsers =
    profileLoadResults[1]?.status === "fulfilled"
      ? profileLoadResults[1].value
      : getFollowingUsers(currentUser.id);

  if (
    !racedProfileLoad.timedOut &&
    profileLoadResults.some((result) => result.status === "rejected")
  ) {
    showToast(
      "Could not fully refresh your profile. Showing cached details where available.",
      "error"
    );
  }

  const followerCount = followerUsers.length;
  const followingCount = followingUsers.length;
  const avatarState = {
    dataUrl: currentUser.avatarDataUrl || "",
    pending: false,
    requestToken: 0
  };

  const summaryCard = createElement("section", {
    className: "profile-card profile-channel-hero"
  });
  const channelBanner = createElement("div", { className: "profile-channel-banner" });
  const channelHero = createElement("div", { className: "profile-channel-hero-main" });
  const avatarPreviewShell = createElement("div", {
    className: "profile-avatar-preview-shell profile-channel-avatar-shell"
  });
  const avatarPreview = createElement("div", { className: "profile-avatar-preview" });
  const heroCopy = createElement("div", { className: "profile-channel-copy" });
  const summaryTitle = createElement("h2", {
    className: "profile-channel-title",
    text: currentUser.username
  });
  const handleText = createElement("p", {
    className: "profile-channel-handle",
    text: `@${currentUser.username}`
  });
  const summaryText = createElement("p", {
    className: "profile-channel-description",
    text: `${currentUser.location.township} ${currentUser.location.extension} local voice. Share updates, jump into threads, and keep the township loop alive.`
  });
  const metaRow = createElement("p", {
    className: "profile-channel-meta",
    text: ""
  });
  const actionRow = createElement("div", { className: "profile-channel-actions" });
  const editProfileBtn = createElement("button", {
    className: "secondary-btn profile-channel-btn",
    text: "Edit profile",
    type: "button"
  });
  const addPostBtn = createElement("button", {
    className: "secondary-btn profile-channel-btn",
    text: "Add post",
    type: "button"
  });
  const inviteBtn = createElement("button", {
    className: "secondary-btn profile-channel-btn",
    text: "Invite",
    type: "button"
  });
  editProfileBtn.addEventListener("click", () => {
    navigate("profile", { editMode: true });
  });
  addPostBtn.addEventListener("click", () => navigate("create-post"));
  inviteBtn.addEventListener("click", async () => {
    await shareAppInvite(currentUser);
  });
  actionRow.append(editProfileBtn, addPostBtn, inviteBtn);

  const tabs = createElement("div", { className: "profile-channel-tabs" });
  tabs.append(
    createChannelTab("Home", {
      active: activeSection === "home",
      onClick: () => navigate("feed")
    }),
    createChannelTab("Posts", {
      onClick: () =>
        navigate("search", {
          mode: "posts",
          authorUserId: currentUser.id,
          authorUsername: currentUser.username
        })
    }),
    createChannelTab("Followers", {
      active: activeSection === "followers",
      onClick: () =>
        navigate("profile", {
          section: "followers"
        })
    }),
    createChannelTab("Following", {
      active: activeSection === "following",
      onClick: () =>
        navigate("profile", {
          section: "following"
        })
    })
  );

  avatarPreviewShell.appendChild(avatarPreview);
  heroCopy.append(summaryTitle, handleText, metaRow, summaryText, actionRow);
  channelHero.append(avatarPreviewShell, heroCopy);
  summaryCard.append(channelBanner, channelHero, tabs);
  main.replaceChildren();
  let profileEditor = null;

  if (activeSection === "followers" || activeSection === "following") {
    main.append(
      summaryCard,
      createPeoplePanel({
        currentUser,
        section: activeSection,
        users: activeSection === "followers" ? followerUsers : followingUsers
      })
    );
  } else if (showEditForm) {
    profileEditor = createProfileEditForm({
      currentUser,
      avatarState,
      avatarPreview
    });
    main.append(summaryCard, profileEditor.formCard);
  } else {
    main.append(summaryCard);
  }

  const syncMetaRow = () => {
    const nextUserPosts = getPostsByUserId(currentUser.id);
    metaRow.textContent = `${formatCompactCount(nextUserPosts.length)} ${
      nextUserPosts.length === 1 ? "post" : "posts"
    } | ${formatCompactCount(followerCount)} ${
      followerCount === 1 ? "follower" : "followers"
    } | ${formatCompactCount(followingCount)} following | Joined ${formatJoinDate(currentUser.createdAt)}`;
  };

  setLiveSyncOptions({
    includePosts: true
  });
  registerViewCleanup(() => {
    setLiveSyncOptions({
      includePosts: false
    });
  });
  registerViewCleanup(
    subscribeToPostChanges(() => {
      syncMetaRow();
    })
  );

  renderAvatarPreview(avatarPreview, currentUser);
  syncMetaRow();

  if (!profileEditor) {
    return;
  }

  let profileSavePending = false;
  let profileSaveOverlay = null;
  let trackedProfileControlStates = new Map();

  const setProfileSaveBusyState = (nextBusy) => {
    profileSavePending = Boolean(nextBusy);

    if (profileSavePending) {
      trackedProfileControlStates = new Map();
      Array.from(profileEditor.form.querySelectorAll("button, input, textarea, select")).forEach(
        (control) => {
          trackedProfileControlStates.set(control, control.disabled);
          control.disabled = true;
        }
      );
      profileEditor.form.classList.add("profile-form-busy");
      profileEditor.form.setAttribute("aria-busy", "true");
      profileEditor.submitBtn.textContent = "Saving...";
      return;
    }

    trackedProfileControlStates.forEach((wasDisabled, control) => {
      if (control) {
        control.disabled = wasDisabled;
      }
    });
    trackedProfileControlStates = new Map();
    profileEditor.form.classList.remove("profile-form-busy");
    profileEditor.form.removeAttribute("aria-busy");
    profileEditor.submitBtn.textContent = "Save";
  };

  const usernameInput = document.getElementById("profile-username");
  usernameInput?.addEventListener("input", () => {
    renderAvatarPreview(avatarPreview, {
      username: usernameInput.value,
      avatarDataUrl: avatarState.dataUrl
    });
  });

  profileEditor.form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (profileSavePending) {
      return;
    }

    clearFormErrors(profileEditor.form);

    const username = document.getElementById("profile-username").value;
    const phoneNumber = document.getElementById("profile-phone")?.value || "";
    const township = document.getElementById("profile-township").value;
    const extension = document.getElementById("profile-extension").value;
    const currentPassword = document.getElementById("profile-current-password").value;
    const newPassword = document.getElementById("profile-password").value;
    const confirmNewPassword = document.getElementById("profile-confirm-password").value;

    try {
      if (avatarState.pending) {
        const pendingAvatarError = new Error(
          "Please wait for the profile photo to finish optimizing."
        );
        pendingAvatarError.field = "avatar";
        throw pendingAvatarError;
      }

      setProfileSaveBusyState(true);
      profileSaveOverlay = showLoadingOverlay({
        label: "Saving profile..."
      });
      await updateAuthenticatedUserProfile({
        currentUser,
        username,
        phoneNumber,
        township,
        extension,
        avatarDataUrl: avatarState.dataUrl,
        currentPassword,
        newPassword,
        confirmNewPassword
      });

      showToast("Your profile changes are live.", "success", {
        variant: "updated-success",
        durationMs: 1800
      });
      await navigate("profile");
    } catch (error) {
      handleProfileError(error, {
        switchToTab: profileEditor.switchToTab
      });
    } finally {
      profileSaveOverlay?.close();
      profileSaveOverlay = null;
      setProfileSaveBusyState(false);
    }
  });
}

function createProfileLoadingSkeleton({ activeSection = "home", showEditForm = false } = {}) {
  const fragment = document.createDocumentFragment();
  const summaryCard = createElement("section", {
    className: "profile-card profile-channel-hero profile-loading-card"
  });
  const banner = createElement("div", {
    className: "profile-channel-banner profile-loading-banner feed-skeleton-rect"
  });
  const hero = createElement("div", {
    className: "profile-channel-hero-main profile-loading-hero-main"
  });
  const avatarShell = createElement("div", {
    className: "profile-avatar-preview-shell profile-channel-avatar-shell profile-loading-avatar-shell"
  });
  const avatar = createElement("span", {
    className: "feed-skeleton-circle profile-loading-avatar"
  });
  const copy = createElement("div", {
    className: "profile-channel-copy profile-loading-copy"
  });
  const title = createElement("span", {
    className: "feed-skeleton-block profile-loading-title"
  });
  const handle = createElement("span", {
    className: "feed-skeleton-block profile-loading-handle"
  });
  const meta = createElement("span", {
    className: "feed-skeleton-block profile-loading-meta"
  });
  const descriptionWide = createElement("span", {
    className: "feed-skeleton-block profile-loading-description"
  });
  const descriptionShort = createElement("span", {
    className: "feed-skeleton-block profile-loading-description profile-loading-description-short"
  });
  const actions = createElement("div", {
    className: "profile-channel-actions profile-loading-actions"
  });
  const tabs = createElement("div", {
    className: "profile-channel-tabs profile-loading-tabs"
  });

  for (let index = 0; index < 3; index += 1) {
    actions.appendChild(
      createElement("span", {
        className: "feed-skeleton-chip profile-loading-action-chip"
      })
    );
  }

  for (let index = 0; index < 4; index += 1) {
    tabs.appendChild(
      createElement("span", {
        className: "feed-skeleton-chip profile-loading-tab-chip"
      })
    );
  }

  avatarShell.appendChild(avatar);
  copy.append(title, handle, meta, descriptionWide, descriptionShort, actions);
  hero.append(avatarShell, copy);
  summaryCard.append(banner, hero, tabs);
  fragment.appendChild(summaryCard);

  if (showEditForm || activeSection === "followers" || activeSection === "following") {
    const detailCard = createElement("section", {
      className: "profile-card profile-loading-detail-card"
    });
    const detailTitle = createElement("span", {
      className: "feed-skeleton-block profile-loading-detail-title"
    });
    const detailLineOne = createElement("span", {
      className: "feed-skeleton-block profile-loading-detail-line"
    });
    const detailLineTwo = createElement("span", {
      className: "feed-skeleton-block profile-loading-detail-line profile-loading-detail-line-short"
    });

    detailCard.append(detailTitle, detailLineOne, detailLineTwo);
    fragment.appendChild(detailCard);
  }

  return fragment;
}

function createAvatarUploadField({ currentUser, avatarState, avatarPreview, form }) {
  const wrapper = createElement("div", {
    className: "field-group avatar-upload-field"
  });
  const label = createElement("label", {
    className: "form-label",
    text: "Profile Photo"
  });
  const panel = createElement("div", { className: "avatar-upload-panel" });
  const copy = createElement("div", { className: "avatar-upload-copy" });
  const title = createElement("strong", {
    className: "avatar-upload-title",
    text: "Choose a photo"
  });
  const helper = createElement("p", {
    className: "field-helper",
    text: `PNG, JPG, or WEBP. We will optimize it to under ${Math.round(
      MAX_AVATAR_FILE_BYTES / 1024 / 1024
    )} MB before upload.`
  });
  const status = createElement("p", {
    className: "field-helper image-upload-status",
    text: currentUser.avatarDataUrl ? "Current photo ready." : "No photo selected."
  });
  const actions = createElement("div", { className: "avatar-upload-actions" });
  const input = createElement("input", {
    className: "form-input avatar-file-input",
    id: "profile-avatar",
    type: "file",
    attributes: {
      accept: "image/png,image/jpeg,image/webp"
    }
  });
  const removeBtn = createElement("button", {
    className: "secondary-btn avatar-remove-btn",
    text: "Remove photo",
    type: "button"
  });
  const error = createFieldError("profile-avatar");
  const syncStatus = (text = "") => {
    status.textContent = text;
  };

  input.addEventListener("change", async () => {
    clearFormErrors(form);
    let requestToken = 0;

    try {
      const file = input.files?.[0] || null;

      if (!file) {
        return;
      }

      validateAvatarFile(file);
      requestToken = avatarState.requestToken + 1;

      avatarState.requestToken = requestToken;
      avatarState.pending = true;
      syncStatus("Optimizing photo...");
      const optimizedAvatar = await compressImageFile(file, {
        maxBytes: MAX_AVATAR_FILE_BYTES,
        maxWidth: 512,
        maxHeight: 512
      });

      if (avatarState.requestToken !== requestToken) {
        return;
      }

      avatarState.dataUrl = optimizedAvatar.dataUrl;
      avatarState.pending = false;
      syncStatus(formatImageOptimizationSummary(optimizedAvatar, "Profile photo"));
      renderAvatarPreview(avatarPreview, {
        username: document.getElementById("profile-username")?.value || currentUser.username,
        avatarDataUrl: avatarState.dataUrl
      });
    } catch (errorObj) {
      if (requestToken && avatarState.requestToken !== requestToken) {
        return;
      }

      avatarState.pending = false;
      input.value = "";
      syncStatus(avatarState.dataUrl ? "Current photo ready." : "No photo selected.");
      setFieldError("profile-avatar", errorObj.message || "Could not use that image.");
    }
  });

  removeBtn.addEventListener("click", () => {
    avatarState.requestToken += 1;
    avatarState.pending = false;
    input.value = "";
    avatarState.dataUrl = "";
    syncStatus("Photo removed.");
    renderAvatarPreview(avatarPreview, {
      username: document.getElementById("profile-username")?.value || currentUser.username,
      avatarDataUrl: ""
    });
  });

  copy.append(title, helper);
  actions.append(input, removeBtn);
  panel.append(copy, actions, status);
  wrapper.append(label, panel, error);

  return wrapper;
}

function createPhoneVerificationField({
  currentUser,
  form,
  getPendingPhoneNumber
}) {
  const wrapper = createElement("div", {
    className: "field-group profile-phone-verification-field"
  });
  const header = createElement("div", {
    className: "profile-edit-panel-copy profile-phone-verification-copy"
  });
  const title = createElement("h3", {
    className: "profile-edit-panel-title",
    text: "Phone verification"
  });
  const status = createElement("p", {
    className: "profile-edit-panel-text",
    text: ""
  });
  const codeRow = createElement("div", {
    className: "profile-phone-verification-row"
  });
  const codeLabel = createElement("label", {
    className: "form-label",
    text: "Verification code"
  });
  const codeInput = createElement("input", {
    className: "form-input",
    id: "profile-phone-otp",
    type: "text",
    placeholder: "Enter the SMS code",
    required: false,
    autocomplete: "one-time-code",
    attributes: {
      inputmode: "numeric",
      maxlength: "8"
    }
  });
  const actions = createElement("div", {
    className: "form-actions profile-phone-verification-actions"
  });
  const sendBtn = createElement("button", {
    className: "secondary-btn",
    type: "button",
    text: "Send code"
  });
  const verifyBtn = createElement("button", {
    className: "primary-btn",
    type: "button",
    text: "Verify phone"
  });
  const error = createFieldError("profile-phone-otp");

  let otpState = null;
  let sending = false;
  let verifying = false;
  let countdownIntervalId = null;

  const clearCountdown = () => {
    if (countdownIntervalId) {
      window.clearInterval(countdownIntervalId);
      countdownIntervalId = null;
    }
  };

  const formatCountdown = (targetIsoDate) => {
    const remainingMs = new Date(targetIsoDate).getTime() - Date.now();
    const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    if (minutes <= 0) {
      return `${seconds}s`;
    }

    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  };

  const formatDateTime = (isoDate) => {
    const date = new Date(isoDate);

    if (Number.isNaN(date.getTime())) {
      return "soon";
    }

    return new Intl.DateTimeFormat("en-ZA", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  };

  const syncUi = () => {
    const savedPhoneNumber = String(currentUser.phoneNumber || "").trim();
    const pendingPhoneNumber =
      typeof getPendingPhoneNumber === "function"
        ? String(getPendingPhoneNumber() || "").trim()
        : savedPhoneNumber;
    const phoneChanged = pendingPhoneNumber !== savedPhoneNumber;
    const phoneVerified = currentUser.phoneVerified === true && !phoneChanged;
    const hasSavedPhone = Boolean(savedPhoneNumber);
    const cooldownActive = Boolean(
      otpState?.cooldownUntil &&
        new Date(otpState.cooldownUntil).getTime() > Date.now()
    );

    clearCountdown();

    if (phoneChanged) {
      status.textContent = "Save your updated phone number before requesting a verification code.";
    } else if (!hasSavedPhone) {
      status.textContent = "Add a phone number first, then save your profile to verify it.";
    } else if (phoneVerified) {
      status.textContent = `This number is already verified: ${savedPhoneNumber}.`;
    } else if (otpState?.expiresAt) {
      status.textContent = cooldownActive
        ? `Code sent to ${savedPhoneNumber}. It expires ${formatDateTime(otpState.expiresAt)}. You can resend in ${formatCountdown(
            otpState.cooldownUntil
          )}.`
        : `Code sent to ${savedPhoneNumber}. It expires ${formatDateTime(otpState.expiresAt)}.`;
    } else {
      status.textContent = `Send a code to verify ${savedPhoneNumber}.`;
    }

    if (cooldownActive) {
      countdownIntervalId = window.setInterval(() => {
        syncUi();
      }, 1000);
    }

    codeRow.style.display = phoneVerified ? "none" : "";
    actions.style.display = phoneVerified ? "none" : "";
    sendBtn.disabled = sending || verifying || phoneChanged || !hasSavedPhone || cooldownActive;
    verifyBtn.disabled =
      sending ||
      verifying ||
      phoneChanged ||
      !hasSavedPhone ||
      !otpState?.expiresAt ||
      !codeInput.value.trim();

    sendBtn.textContent = sending
      ? "Sending..."
      : cooldownActive
        ? `Resend in ${formatCountdown(otpState.cooldownUntil)}`
        : otpState?.expiresAt
          ? "Resend code"
          : "Send code";
    verifyBtn.textContent = verifying ? "Verifying..." : "Verify phone";
  };

  sendBtn.addEventListener("click", async () => {
    error.textContent = "";
    sending = true;
    syncUi();

    try {
      const response = await requestPhoneVerificationOtp();
      otpState = {
        expiresAt: response.expiresAt || null,
        cooldownUntil: response.cooldownUntil || null
      };
      codeInput.value = "";
      showToast("Verification code sent.", "success");
      syncUi();
      codeInput.focus({ preventScroll: true });
    } catch (errorObj) {
      error.textContent = errorObj.message || "Could not send verification code.";

      if (errorObj?.details?.cooldownUntil) {
        otpState = {
          expiresAt: otpState?.expiresAt || null,
          cooldownUntil: errorObj.details.cooldownUntil
        };
      }
    } finally {
      sending = false;
      syncUi();
    }
  });

  verifyBtn.addEventListener("click", async () => {
    error.textContent = "";
    verifying = true;
    syncUi();

    try {
      const updatedUser = await verifyAuthenticatedUserPhoneOtp({
        code: codeInput.value
      });

      Object.assign(currentUser, updatedUser);
      currentUser.phoneVerified = updatedUser.phoneVerified === true;
      otpState = null;
      codeInput.value = "";
      showToast("Phone number verified.", "success");
    } catch (errorObj) {
      error.textContent = errorObj.message || "Could not verify the code.";
    } finally {
      verifying = false;
      syncUi();
    }
  });

  codeInput.addEventListener("input", () => {
    error.textContent = "";
    syncUi();
  });

  registerViewCleanup(() => {
    clearCountdown();
  });

  header.append(title, status);
  codeLabel.appendChild(codeInput);
  codeRow.appendChild(codeLabel);
  actions.append(sendBtn, verifyBtn);
  wrapper.append(header, codeRow, actions, error);
  syncUi();

  return {
    wrapper,
    syncState: syncUi
  };
}

function renderAvatarPreview(container, userLike) {
  if (!container) {
    return;
  }

  container.replaceChildren(
    createAvatarElement(userLike, {
      size: "xl",
      className: "profile-avatar-display"
    })
  );
}

async function shareAppInvite(currentUser) {
  const username = currentUser?.username ? `@${currentUser.username}` : "me";
  const township = currentUser?.location?.township?.trim?.() || "";
  const extension = currentUser?.location?.extension?.trim?.() || "";
  const locationText = [township, extension].filter(Boolean).join(" ");
  const appUrl = getShareableAppUrl();
  const shareText = [
    `Hi, I'm using Boitekong Pulse as ${username}.`,
    `Join me on the app for local updates, posts, replies, and voice notes${locationText ? ` around ${locationText}` : ""}.`
  ].join(" ");

  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      const shareData = {
        title: "Join me on Boitekong Pulse",
        text: shareText
      };

      if (appUrl) {
        shareData.url = appUrl;
      }

      await navigator.share(shareData);
      return;
    }

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      const clipboardText = appUrl ? `${shareText}\n${appUrl}` : shareText;
      await navigator.clipboard.writeText(clipboardText);
      showToast("Invite copied to clipboard.", "success");
      return;
    }

    throw new Error("Sharing is not available on this device.");
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }

    showToast(error.message || "Could not share invite.", "error");
  }
}

function getShareableAppUrl() {
  if (typeof window === "undefined" || !window.location) {
    return "";
  }

  const { protocol, hostname, origin } = window.location;

  if (!origin || protocol === "file:") {
    return "";
  }

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "";
  }

  return origin;
}

function createChannelTab(label, options = {}) {
  const button = createElement("button", {
    className: `profile-channel-tab${options.active ? " profile-channel-tab-active" : ""}`,
    text: label,
    type: "button"
  });

  if (typeof options.onClick === "function") {
    button.addEventListener("click", options.onClick);
  }

  return button;
}

function createPeoplePanel({ currentUser, section, users = [] }) {
  const panel = createElement("section", {
    className: "profile-card profile-people-panel"
  });
  const title = createElement("h3", {
    className: "profile-people-title",
    text: section === "followers" ? "Followers" : "Following"
  });
  const hint = createElement("p", {
    className: "profile-people-hint",
    text:
      users.length > 0
        ? "Tap a person to open their profile."
        : `No ${section} yet.`
  });
  const scroller = createElement("div", {
    className: "profile-people-scroller"
  });

  if (users.length === 0) {
    panel.append(
      title,
      hint,
      createElement("p", {
        className: "profile-people-empty",
        text:
          section === "followers"
            ? `${currentUser.username} has no followers yet.`
            : `${currentUser.username} is not following anyone yet.`
      })
    );
    return panel;
  }

  users.forEach((user) => {
    const personBtn = createElement("button", {
      className: "profile-people-card",
      type: "button",
      attributes: {
        "aria-label": `Open ${user.username}'s profile`,
        title: user.username
      }
    });
    const avatar = createAvatarElement(user, {
      size: "md",
      className: "profile-people-avatar",
      decorative: true
    });
    const name = createElement("span", {
      className: "profile-people-name",
      text: shortenUsername(user.username)
    });

    personBtn.append(avatar, name);
    personBtn.addEventListener("click", () => {
      showUserPreviewSheet({
        userId: user.id,
        currentUserId: currentUser.id
      });
    });
    scroller.appendChild(personBtn);
  });

  panel.append(title, hint, scroller);
  return panel;
}

function createProfileEditForm({ currentUser, avatarState, avatarPreview }) {
  const formCard = createElement("section", {
    className: "profile-card profile-form-card profile-edit-card"
  });
  const formHeader = createElement("div", {
    className: "section-header profile-edit-header"
  });
  const formEyebrow = createElement("p", {
    className: "section-eyebrow",
    text: "Edit profile"
  });
  const formTitle = createElement("h2", {
    className: "section-title",
    text: "Update your account"
  });
  const formText = createElement("p", {
    className: "section-copy profile-edit-copy",
    text: "Switch between tabs to update personal info, login details, and your location without one long form."
  });
  const tabList = createElement("div", {
    className: "profile-edit-tabs",
    attributes: {
      role: "tablist",
      "aria-label": "Edit profile sections"
    }
  });
  const form = createElement("form", {
    className: "auth-form profile-form profile-edit-form",
    id: "profile-form"
  });

  formHeader.append(formEyebrow, formTitle, formText);

  const personalPanel = createElement("section", {
    className: "profile-edit-panel profile-edit-panel-active",
    attributes: {
      role: "tabpanel",
      id: "profile-tab-panel-personal"
    }
  });
  const personalIntro = createElement("div", { className: "profile-edit-panel-copy" });
  personalIntro.append(
    createElement("h3", {
      className: "profile-edit-panel-title",
      text: "Personal info"
    }),
    createElement("p", {
      className: "profile-edit-panel-text",
      text: "Keep your public details current so people recognize you across posts, comments, and replies."
    })
  );
  const avatarUploadField = createAvatarUploadField({
    currentUser,
    avatarState,
    avatarPreview,
    form
  });
  const usernameField = createField({
    labelText: "Username",
    inputId: "profile-username",
    type: "text",
    placeholder: "Enter username",
    value: currentUser.username,
    autocomplete: "username",
    helperText: "3-30 characters. Can include emoji. Maximum 3 spaces."
  });
  const phoneField = createField({
    labelText: "Phone Number",
    inputId: "profile-phone",
    type: "tel",
    placeholder: "e.g. 071 234 5678",
    value: currentUser.phoneNumber || "",
    autocomplete: "tel",
    required: false,
    helperText: "Optional. Use numbers, spaces, +, or hyphens.",
    attributes: {
      inputmode: "tel"
    }
  });
  const phoneVerificationField = createPhoneVerificationField({
    currentUser,
    form,
    getPendingPhoneNumber: () => phoneField.querySelector("input")?.value || ""
  });
  phoneField
    .querySelector("input")
    ?.addEventListener("input", phoneVerificationField.syncState);
  personalPanel.append(
    personalIntro,
    usernameField,
    phoneField,
    phoneVerificationField.wrapper,
    avatarUploadField
  );

  const credentialsPanel = createElement("section", {
    className: "profile-edit-panel",
    attributes: {
      role: "tabpanel",
      id: "profile-tab-panel-credentials",
      hidden: "hidden"
    }
  });
  const credentialsIntro = createElement("div", {
    className: "profile-edit-panel-copy"
  });
  credentialsIntro.append(
    createElement("h3", {
      className: "profile-edit-panel-title",
      text: "Login credentials"
    }),
    createElement("p", {
      className: "profile-edit-panel-text",
      text: "Only fill in these fields when you want to change your password."
    })
  );
  const currentPasswordField = createField({
    labelText: "Current Password",
    inputId: "profile-current-password",
    type: "password",
    value: "",
    placeholder: "Required only when changing password",
    autocomplete: "current-password",
    required: false,
    helperText: "Enter your current password before setting a new one."
  });
  const newPasswordField = createField({
    labelText: "New Password",
    inputId: "profile-password",
    type: "password",
    value: "",
    placeholder: "Leave blank to keep current password",
    autocomplete: "new-password",
    required: false,
    helperText: "Optional. If used, must meet password rules."
  });
  const confirmNewPasswordField = createField({
    labelText: "Confirm New Password",
    inputId: "profile-confirm-password",
    type: "password",
    value: "",
    placeholder: "Confirm new password",
    autocomplete: "new-password",
    required: false,
    helperText: "Only required when setting a new password."
  });
  credentialsPanel.append(
    credentialsIntro,
    currentPasswordField,
    newPasswordField,
    confirmNewPasswordField
  );

  const locationPanel = createElement("section", {
    className: "profile-edit-panel",
    attributes: {
      role: "tabpanel",
      id: "profile-tab-panel-location",
      hidden: "hidden"
    }
  });
  const locationIntro = createElement("div", { className: "profile-edit-panel-copy" });
  locationIntro.append(
    createElement("h3", {
      className: "profile-edit-panel-title",
      text: "Location"
    }),
    createElement("p", {
      className: "profile-edit-panel-text",
      text: "Set the township and extension you want attached to your posts and community presence."
    })
  );
  const townshipField = createField({
    labelText: "Township",
    inputId: "profile-township",
    type: "text",
    placeholder: "e.g. Boitekong",
    value: currentUser.location.township,
    autocomplete: "address-level2",
    helperText: "Township is text only."
  });
  const extensionField = createField({
    labelText: "Extension",
    inputId: "profile-extension",
    type: "text",
    placeholder: "e.g. Ext 2",
    value: currentUser.location.extension,
    autocomplete: "off",
    helperText: 'Example: "Ext 2"'
  });
  locationPanel.append(locationIntro, townshipField, extensionField);

  const tabs = [
    {
      key: "personal",
      label: "Personal info",
      button: createProfileEditTab("Personal info", {
        key: "personal",
        active: true,
        controlsId: "profile-tab-panel-personal"
      }),
      panel: personalPanel
    },
    {
      key: "location",
      label: "Location",
      button: createProfileEditTab("Location", {
        key: "location",
        controlsId: "profile-tab-panel-location"
      }),
      panel: locationPanel
    },
    {
      key: "credentials",
      label: "Login credentials",
      button: createProfileEditTab("Login credentials", {
        key: "credentials",
        controlsId: "profile-tab-panel-credentials"
      }),
      panel: credentialsPanel
    }
  ];

  const switchToTab = (tabKey) => {
    tabs.forEach((tab) => {
      const isActive = tab.key === tabKey;
      tab.button.classList.toggle("profile-edit-tab-active", isActive);
      tab.button.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.button.tabIndex = isActive ? 0 : -1;
      tab.panel.classList.toggle("profile-edit-panel-active", isActive);
      if (isActive) {
        tab.panel.removeAttribute("hidden");
      } else {
        tab.panel.setAttribute("hidden", "hidden");
      }
    });
  };

  tabs.forEach((tab) => {
    tab.button.addEventListener("click", () => switchToTab(tab.key));
    tabList.appendChild(tab.button);
  });

  const actions = createElement("div", {
    className: "form-actions profile-edit-actions"
  });
  const cancelBtn = createElement("button", {
    className: "secondary-btn",
    text: "Cancel",
    type: "button"
  });
    const submitBtn = createElement("button", {
      className: "primary-btn",
      text: "Save",
      type: "submit"
    });

  cancelBtn.addEventListener("click", () => navigate("profile"));
  actions.append(cancelBtn, submitBtn);

  form.append(tabList, personalPanel, credentialsPanel, locationPanel, actions);
  formCard.append(formHeader, form);

  return {
    formCard,
    form,
    switchToTab,
    submitBtn
  };
}

function createField({
  labelText,
  inputId,
  type,
  placeholder,
  value,
  autocomplete,
  helperText = "",
  required = true,
  attributes = {}
}) {
  const wrapper = createElement("div", { className: "field-group" });
  const label = createElement("label", {
    className: "form-label",
    text: labelText
  });
  const input = createElement("input", {
    className: "form-input",
    id: inputId,
    type,
    placeholder,
    required,
    autocomplete,
    attributes
  });

  input.value = value;

  const helper = createElement("p", {
    className: "field-helper",
    text: helperText
  });
  const error = createFieldError(inputId);

  label.appendChild(input);
  wrapper.append(label, helper, error);

  return wrapper;
}

function createProfileEditTab(label, options = {}) {
  return createElement("button", {
    className: `profile-edit-tab${options.active ? " profile-edit-tab-active" : ""}`,
    text: label,
    type: "button",
    attributes: {
      role: "tab",
      "aria-selected": options.active ? "true" : "false",
      "aria-controls": options.controlsId || "",
      "data-tab-key": options.key || ""
    }
  });
}

function formatJoinDate(isoDate) {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium"
  }).format(date);
}

function shortenUsername(value = "") {
  const username = String(value || "").trim();

  if (username.length <= 12) {
    return username;
  }

  return `${username.slice(0, 9)}...`;
}

function handleProfileError(error, options = {}) {
  const fieldMap = {
    username: "profile-username",
    phoneNumber: "profile-phone",
    township: "profile-township",
    extension: "profile-extension",
    avatar: "profile-avatar",
    avatarUrl: "profile-avatar",
    currentPassword: "profile-current-password",
    password: "profile-password",
    confirmPassword: "profile-confirm-password"
  };
  const tabMap = {
    username: "personal",
    phoneNumber: "personal",
    avatar: "personal",
    avatarUrl: "personal",
    currentPassword: "credentials",
    password: "credentials",
    confirmPassword: "credentials",
    township: "location",
    extension: "location"
  };

  if (error?.field && fieldMap[error.field]) {
    if (typeof options.switchToTab === "function" && tabMap[error.field]) {
      options.switchToTab(tabMap[error.field]);
    }
    setFieldError(fieldMap[error.field], error.message);
    if (error.code === "USERNAME_EXISTS" || error.code === "CURRENT_PASSWORD_INVALID") {
      showToast(error.message, "error");
    }
    return;
  }

  showToast(error?.message || "Failed to update profile.", "error");
}
