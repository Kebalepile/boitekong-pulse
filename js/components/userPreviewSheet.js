import { createElement } from "../utils/dom.js";
import { createAvatarElement } from "../utils/avatar.js";
import {
  findUserById,
  getFollowerCount,
  getFollowingUsers,
  isFollowingUser,
  followUser,
  unfollowUser
} from "../services/userService.js";
import { showToast } from "./toast.js";

const USER_PREVIEW_ROOT_ID = "user-preview-sheet-root";

export function showUserPreviewSheet({ userId, currentUserId }) {
  if (!userId) {
    return;
  }

  const existing = document.getElementById(USER_PREVIEW_ROOT_ID);

  if (existing) {
    existing.remove();
  }

  const root = createElement("div", {
    id: USER_PREVIEW_ROOT_ID,
    className: "user-preview-root"
  });
  const overlay = createElement("div", {
    className: "user-preview-overlay"
  });
  const container = createElement("div", {
    className: "user-preview-container"
  });
  const sheet = createElement("section", {
    className: "user-preview-sheet",
    attributes: {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "User profile preview"
    }
  });

  const closeSheet = () => {
    root.remove();
    document.removeEventListener("keydown", handleKeyDown);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      closeSheet();
    }
  };

  const renderSheet = (targetUserId) => {
    const user = findUserById(targetUserId);

    if (!user) {
      closeSheet();
      showToast("That profile is no longer available.", "error");
      return;
    }

    const isOwnProfile = user.id === currentUserId;
    const followerCount = getFollowerCount(user.id);
    const followingUsers = getFollowingUsers(user.id, { limit: 18 });
    const followingCount = Array.isArray(user.followingUserIds) ? user.followingUserIds.length : 0;
    const followsTarget = isFollowingUser({
      currentUserId,
      targetUserId: user.id
    });

    const handle = createElement("span", {
      className: "user-preview-handle",
      attributes: {
        "aria-hidden": "true"
      }
    });
    const hero = createElement("div", { className: "user-preview-hero" });
    const avatarShell = createElement("div", {
      className: "user-preview-avatar-shell"
    });
    const avatar = createAvatarElement(user, {
      size: "xl",
      className: "user-preview-avatar",
      decorative: true
    });
    const identity = createElement("div", { className: "user-preview-identity" });
    const username = createElement("h3", {
      className: "user-preview-username",
      text: user.username
    });
    const joined = createElement("p", {
      className: "user-preview-joined",
      text: `Joined ${formatJoinDate(user.createdAt)}`
    });
    const location = createElement("p", {
      className: "user-preview-location",
      text: `${user.location.township} ${user.location.extension}`
    });
    const stats = createElement("div", { className: "user-preview-stats" });
    const followersStat = createStatChip(
      String(followerCount),
      followerCount === 1 ? "Follower" : "Followers"
    );
    const followingStat = createStatChip(
      String(followingCount),
      "Following"
    );
    const actions = createElement("div", { className: "user-preview-actions" });
    const followBtn = createElement("button", {
      className: isOwnProfile
        ? "secondary-btn user-preview-follow-btn user-preview-follow-btn-disabled"
        : followsTarget
          ? "secondary-btn user-preview-follow-btn"
          : "primary-btn user-preview-follow-btn",
      type: "button",
      text: isOwnProfile ? "You" : followsTarget ? "Following" : "Follow",
      attributes: isOwnProfile
        ? {
            disabled: "true",
            "aria-disabled": "true"
          }
        : {}
    });
    const dmBtn = createElement("button", {
      className: "secondary-btn user-preview-dm-btn",
      type: "button",
      attributes: {
        "aria-label": `Message ${user.username}`,
        title: "Direct message"
      }
    });
    const followingSection = createElement("div", {
      className: "user-preview-following-section"
    });
    const followingTitle = createElement("div", {
      className: "user-preview-following-header"
    });
    const followingHeading = createElement("h4", {
      className: "user-preview-following-title",
      text: "Following"
    });
    const followingHint = createElement("p", {
      className: "user-preview-following-hint",
      text:
        followingUsers.length > 0
          ? "Tap a person to open their profile."
          : "No follows yet."
    });

    avatarShell.appendChild(avatar);
    identity.append(username, joined, location);
    stats.append(followersStat, followingStat);
    hero.append(avatarShell, identity);

    dmBtn.appendChild(createDmIcon());
    dmBtn.addEventListener("click", () => {
      showToast("Direct messages are coming soon.", "success");
    });

    if (!isOwnProfile) {
      followBtn.addEventListener("click", () => {
        try {
          if (followsTarget) {
            unfollowUser({
              currentUserId,
              targetUserId: user.id
            });
          } else {
            followUser({
              currentUserId,
              targetUserId: user.id
            });
          }

          renderSheet(user.id);
        } catch (error) {
          showToast(error.message || "Could not update follow state.", "error");
        }
      });
    }

    actions.append(followBtn, dmBtn);
    followingTitle.append(followingHeading, followingHint);
    followingSection.appendChild(followingTitle);

    if (followingUsers.length > 0) {
      const followingScroller = createElement("div", {
        className: "user-preview-following-scroller"
      });

      followingUsers.forEach((followedUser) => {
        const personBtn = createElement("button", {
          className: "user-preview-following-card",
          type: "button",
          attributes: {
            "aria-label": `Open ${followedUser.username}'s profile`,
            title: followedUser.username
          }
        });
        const personAvatar = createAvatarElement(followedUser, {
          size: "md",
          className: "user-preview-following-avatar",
          decorative: true
        });
        const personName = createElement("span", {
          className: "user-preview-following-name",
          text: shortenUsername(followedUser.username)
        });

        personBtn.append(personAvatar, personName);
        personBtn.addEventListener("click", () => {
          renderSheet(followedUser.id);
        });
        followingScroller.appendChild(personBtn);
      });

      followingSection.appendChild(followingScroller);
    } else {
      followingSection.appendChild(
        createElement("p", {
          className: "user-preview-empty",
          text: `${user.username} is not following anyone yet.`
        })
      );
    }

    sheet.replaceChildren(handle, hero, stats, actions, followingSection);
  };

  overlay.addEventListener("click", closeSheet);
  container.addEventListener("click", (event) => {
    if (event.target === container) {
      closeSheet();
    }
  });
  sheet.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  document.addEventListener("keydown", handleKeyDown);

  container.appendChild(sheet);
  root.append(overlay, container);
  document.body.appendChild(root);

  renderSheet(userId);
}

function createStatChip(value, label) {
  const chip = createElement("div", { className: "user-preview-stat" });
  const statValue = createElement("strong", {
    className: "user-preview-stat-value",
    text: value
  });
  const statLabel = createElement("span", {
    className: "user-preview-stat-label",
    text: label
  });

  chip.append(statValue, statLabel);
  return chip;
}

function createDmIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("user-preview-dm-icon");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-width", "1.9");
  path.setAttribute(
    "d",
    "M4 6.5h16a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 17.5H8.8L4 21v-4.5A1.5 1.5 0 0 1 2.5 15V8A1.5 1.5 0 0 1 4 6.5Z"
  );
  svg.appendChild(path);

  return svg;
}

function formatJoinDate(isoDate) {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return "recently";
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
