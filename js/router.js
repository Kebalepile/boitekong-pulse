import { getAuthenticatedUser, logoutUser } from "./services/authService.js";
import { renderLogin } from "./views/loginView.js";
import { renderRegister } from "./views/registerView.js";
import { renderFeed } from "./views/feedView.js";
import { renderProfile } from "./views/profileView.js";
import { renderCreatePost } from "./views/createPostView.js";
import { renderEditPost } from "./views/editPostView.js";
import { renderSearch } from "./views/searchView.js";

function getAppRoot() {
  return document.getElementById("app");
}

function requireAuth(app, renderFn, payload) {
  const currentUser = getAuthenticatedUser();

  if (!currentUser) {
    renderLogin(app);
    return;
  }

  renderFn(app, currentUser, payload);
}

export function navigate(routeName, payload = null) {
  const app = getAppRoot();
  if (!app) return;

  if (routeName === "register") {
    renderRegister(app);
    return;
  }

  if (routeName === "feed") {
    requireAuth(app, renderFeed);
    return;
  }

  if (routeName === "profile") {
    requireAuth(app, renderProfile, payload);
    return;
  }

  if (routeName === "create-post") {
    requireAuth(app, renderCreatePost);
    return;
  }

  if (routeName === "edit-post") {
    requireAuth(app, renderEditPost, payload);
    return;
  }

  if (routeName === "search") {
    requireAuth(app, renderSearch, payload);
    return;
  }

  renderLogin(app);
}

export function initRouter() {
  const currentUser = getAuthenticatedUser();

  if (currentUser) {
    navigate("feed");
    return;
  }

  navigate("login");
}

export function handleLogout() {
  logoutUser();
  navigate("login");
}
