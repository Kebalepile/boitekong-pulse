import { createElement } from "../utils/dom.js";
import { navigate, handleLogout } from "../router.js";

export function createNavbar(currentUser) {
  const header = createElement("header", { className: "topbar" });

  const left = createElement("div");
  const title = createElement("h1", {
    className: "page-title",
    text: "Boitekong Plus"
  });

  const subtitle = createElement("p", {
    className: "page-subtitle",
    text: `${currentUser.username} · ${currentUser.location.township} ${currentUser.location.extension}`
  });

  left.append(title, subtitle);

  const actions = createElement("div", { className: "topbar-actions" });

  const feedBtn = createElement("button", {
    className: "secondary-btn",
    text: "Feed",
    type: "button"
  });

  const createPostBtn = createElement("button", {
    className: "secondary-btn",
    text: "Create Post",
    type: "button"
  });

  const profileBtn = createElement("button", {
    className: "secondary-btn",
    text: "Profile",
    type: "button"
  });

  const logoutBtn = createElement("button", {
    className: "secondary-btn",
    text: "Logout",
    type: "button"
  });

  feedBtn.addEventListener("click", () => navigate("feed"));
  createPostBtn.addEventListener("click", () => navigate("create-post"));
  profileBtn.addEventListener("click", () => navigate("profile"));
  logoutBtn.addEventListener("click", handleLogout);

  actions.append(feedBtn, createPostBtn, profileBtn, logoutBtn);
  header.append(left, actions);

  return header;
}