import {
  clearElement,
  createElement,
  clearFormErrors,
  setFieldError,
  createFieldError
} from "../utils/dom.js";
import { createNavbar } from "../components/navbar.js";
import { navigate } from "../router.js";
import { showToast } from "../components/toast.js";
import { updateAuthenticatedUserProfile } from "../services/authService.js";
import { createAvatarElement, readFileAsDataUrl } from "../utils/avatar.js";
import { validateAvatarFile, MAX_AVATAR_FILE_BYTES } from "../utils/validators.js";

export function renderProfile(app, currentUser) {
  clearElement(app);

  const shell = createElement("section", { className: "feed-shell" });
  const navbar = createNavbar(currentUser, "profile");
  const main = createElement("main", { className: "profile-main profile-page-main" });
  const avatarState = {
    dataUrl: currentUser.avatarDataUrl || ""
  };

  const summaryCard = createElement("section", {
    className: "profile-card profile-hero-card"
  });
  const avatarPanel = createElement("div", { className: "profile-avatar-panel" });
  const avatarPreviewShell = createElement("div", {
    className: "profile-avatar-preview-shell"
  });
  const avatarPreview = createElement("div", { className: "profile-avatar-preview" });
  const avatarHint = createElement("p", {
    className: "profile-avatar-hint",
    text: "Your avatar appears on posts, comments, and replies."
  });

  avatarPreviewShell.appendChild(avatarPreview);
  avatarPanel.append(avatarPreviewShell, avatarHint);

  const heroCopy = createElement("div", { className: "profile-hero-copy" });
  const heroEyebrow = createElement("p", {
    className: "section-eyebrow",
    text: "Your identity"
  });
  const summaryTitle = createElement("h2", {
    className: "section-title",
    text: "Profile"
  });
  const summaryText = createElement("p", {
    className: "section-copy",
    text: "Keep your local presence recognizable so neighbors know who is speaking in the feed."
  });
  const statsGrid = createElement("div", { className: "profile-summary-grid" });

  statsGrid.append(
    createInfoChip("Username", currentUser.username),
    createInfoChip("Township", currentUser.location.township),
    createInfoChip("Extension", currentUser.location.extension),
    createInfoChip("Member since", formatJoinDate(currentUser.createdAt))
  );

  heroCopy.append(heroEyebrow, summaryTitle, summaryText, statsGrid);
  summaryCard.append(avatarPanel, heroCopy);

  const formCard = createElement("section", {
    className: "profile-card profile-form-card"
  });
  const formHeader = createElement("div", { className: "section-header" });
  const formEyebrow = createElement("p", {
    className: "section-eyebrow",
    text: "Edit profile"
  });
  const formTitle = createElement("h2", {
    className: "section-title",
    text: "Update your account"
  });
  const formText = createElement("p", {
    className: "section-copy",
    text: "Profile photo is optional. If you upload one, keep it under 1 MB."
  });

  formHeader.append(formEyebrow, formTitle, formText);

  const form = createElement("form", {
    className: "auth-form profile-form",
    id: "profile-form"
  });

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

  const actions = createElement("div", { className: "form-actions" });
  const backBtn = createElement("button", {
    className: "secondary-btn",
    text: "Back to Feed",
    type: "button"
  });
  const submitBtn = createElement("button", {
    className: "primary-btn",
    text: "Save Profile",
    type: "submit"
  });

  backBtn.addEventListener("click", () => navigate("feed"));
  actions.append(backBtn, submitBtn);

  form.append(
    avatarUploadField,
    usernameField,
    townshipField,
    extensionField,
    currentPasswordField,
    newPasswordField,
    confirmNewPasswordField,
    actions
  );

  formCard.append(formHeader, form);
  main.append(summaryCard, formCard);
  shell.append(navbar, main);
  app.appendChild(shell);

  const usernameInput = document.getElementById("profile-username");
  usernameInput?.addEventListener("input", () => {
    renderAvatarPreview(avatarPreview, {
      username: usernameInput.value,
      avatarDataUrl: avatarState.dataUrl
    });
  });

  renderAvatarPreview(avatarPreview, currentUser);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(form);

    const username = document.getElementById("profile-username").value;
    const township = document.getElementById("profile-township").value;
    const extension = document.getElementById("profile-extension").value;
    const currentPassword = document.getElementById("profile-current-password").value;
    const newPassword = document.getElementById("profile-password").value;
    const confirmNewPassword = document.getElementById("profile-confirm-password").value;

    try {
      await updateAuthenticatedUserProfile({
        currentUser,
        username,
        township,
        extension,
        avatarDataUrl: avatarState.dataUrl,
        currentPassword,
        newPassword,
        confirmNewPassword
      });

      showToast("Profile updated successfully.", "success");
      navigate("profile");
    } catch (error) {
      handleProfileError(error);
    }
  });
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
    text: `PNG, JPG, or WEBP. Max ${Math.round(MAX_AVATAR_FILE_BYTES / 1024 / 1024)} MB.`
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

  input.addEventListener("change", async () => {
    clearFormErrors(form);

    try {
      const file = input.files?.[0] || null;

      if (!file) {
        return;
      }

      validateAvatarFile(file);
      avatarState.dataUrl = await readFileAsDataUrl(file);
      renderAvatarPreview(avatarPreview, {
        username: document.getElementById("profile-username")?.value || currentUser.username,
        avatarDataUrl: avatarState.dataUrl
      });
    } catch (errorObj) {
      input.value = "";
      setFieldError("profile-avatar", errorObj.message || "Could not use that image.");
    }
  });

  removeBtn.addEventListener("click", () => {
    input.value = "";
    avatarState.dataUrl = "";
    renderAvatarPreview(avatarPreview, {
      username: document.getElementById("profile-username")?.value || currentUser.username,
      avatarDataUrl: ""
    });
  });

  copy.append(title, helper);
  actions.append(input, removeBtn);
  panel.append(copy, actions);
  wrapper.append(label, panel, error);

  return wrapper;
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

function createInfoChip(label, value) {
  const chip = createElement("div", { className: "profile-info-chip" });
  const chipLabel = createElement("span", {
    className: "profile-info-chip-label",
    text: label
  });
  const chipValue = createElement("strong", {
    className: "profile-info-chip-value",
    text: value
  });

  chip.append(chipLabel, chipValue);
  return chip;
}

function createField({
  labelText,
  inputId,
  type,
  placeholder,
  value,
  autocomplete,
  helperText = "",
  required = true
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
    autocomplete
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

function formatJoinDate(isoDate) {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium"
  }).format(date);
}

function handleProfileError(error) {
  const fieldMap = {
    username: "profile-username",
    township: "profile-township",
    extension: "profile-extension",
    avatar: "profile-avatar",
    currentPassword: "profile-current-password",
    password: "profile-password",
    confirmPassword: "profile-confirm-password"
  };

  if (error?.field && fieldMap[error.field]) {
    setFieldError(fieldMap[error.field], error.message);
    if (error.code === "USERNAME_EXISTS" || error.code === "CURRENT_PASSWORD_INVALID") {
      showToast(error.message, "error");
    }
    return;
  }

  showToast(error?.message || "Failed to update profile.", "error");
}
