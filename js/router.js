import {
  getAuthenticatedUser,
  logoutUser,
  resolveAuthenticatedUser
} from "./services/authService.js";
import { renderLogin } from "./views/loginView.js";
import { renderRegister } from "./views/registerView.js";
import { renderFeed } from "./views/feedView.js";
import { renderProfile } from "./views/profileView.js";
import { renderCreatePost } from "./views/createPostView.js";
import { renderEditPost } from "./views/editPostView.js";
import { renderSearch } from "./views/searchView.js";
import { renderMessages } from "./views/messagesView.js";
import { ensureConversationsLoaded } from "./services/messageService.js";
import { loadNotifications } from "./services/notificationService.js";
import { loadReports } from "./services/reportService.js";
import { startLiveSync, stopLiveSync } from "./services/liveSyncService.js";

let viewCleanupFns = [];

function getAppRoot() {
  return document.getElementById("app");
}

function cleanupCurrentView() {
  const pendingCleanupFns = viewCleanupFns;
  viewCleanupFns = [];

  pendingCleanupFns.forEach((cleanup) => {
    try {
      cleanup();
    } catch {
      // Ignore cleanup errors so route transitions still complete.
    }
  });
}

export function registerViewCleanup(cleanup) {
  if (typeof cleanup !== "function") {
    return () => {};
  }

  let active = true;
  const wrappedCleanup = () => {
    if (!active) {
      return;
    }

    active = false;

    try {
      cleanup();
    } catch {
      // Ignore cleanup errors triggered manually.
    }
  };

  viewCleanupFns.push(wrappedCleanup);

  return () => {
    viewCleanupFns = viewCleanupFns.filter((entry) => entry !== wrappedCleanup);
    wrappedCleanup();
  };
}

async function requireAuth(app, renderFn, payload) {
  const currentUser = getAuthenticatedUser() || (await resolveAuthenticatedUser());

  if (!currentUser) {
    stopLiveSync();
    renderLogin(app);
    return;
  }

  startLiveSync(currentUser.id);

  try {
    await Promise.all([
      ensureConversationsLoaded(currentUser.id),
      loadReports({
        currentUserId: currentUser.id,
        force: true
      }),
      loadNotifications({
        currentUserId: currentUser.id,
        force: true
      })
    ]);
  } catch {
    // Keep rendering the current screen even if preload fails.
  }

  await renderFn(app, currentUser, payload);
}

export async function navigate(routeName, payload = null) {
  const app = getAppRoot();
  if (!app) return;
  cleanupCurrentView();

  switch (routeName) {
    case "login":
      stopLiveSync();
      renderLogin(app);
      return;
    case "register":
      stopLiveSync();
      renderRegister(app);
      return;
    case "feed":
      await requireAuth(app, renderFeed, payload);
      return;
    case "profile":
      await requireAuth(app, renderProfile, payload);
      return;
    case "create-post":
      await requireAuth(app, renderCreatePost);
      return;
    case "edit-post":
      await requireAuth(app, renderEditPost, payload);
      return;
    case "search":
      await requireAuth(app, renderSearch, payload);
      return;
    case "messages":
      await requireAuth(app, renderMessages, payload);
      return;
    default:
      stopLiveSync();
      renderLogin(app);
  }
}

export async function initRouter() {
  const currentUser = getAuthenticatedUser() || (await resolveAuthenticatedUser());

  if (currentUser) {
    await navigate("feed");
    return;
  }

  await navigate("login");
}

export function handleLogout() {
  logoutUser();
  void navigate("login");
}
