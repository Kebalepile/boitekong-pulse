import { getAuthenticatedUser, logoutUser } from "./services/authService.js";
import { renderLogin } from "./views/loginView.js";
import { renderRegister } from "./views/registerView.js";
import { renderFeed } from "./views/feedView.js";
import { renderProfile } from "./views/profileView.js";
import { renderCreatePost } from "./views/createPostView.js";
import { renderEditPost } from "./views/editPostView.js";
import { renderSearch } from "./views/searchView.js";
import { renderMessages } from "./views/messagesView.js";

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

  switch (routeName) {
    case "login":
      renderLogin(app);
      return;
    case "register":
      renderRegister(app);
      return;
    case "feed":
      requireAuth(app, renderFeed, payload);
      return;
    case "profile":
      requireAuth(app, renderProfile, payload);
      return;
    case "create-post":
      requireAuth(app, renderCreatePost);
      return;
    case "edit-post":
      requireAuth(app, renderEditPost, payload);
      return;
    case "search":
      requireAuth(app, renderSearch, payload);
      return;
    case "messages":
      requireAuth(app, renderMessages, payload);
      return;
    default:
      renderLogin(app);
  }
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
