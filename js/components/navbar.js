import { createElement } from "../utils/dom.js";
import { navigate, handleLogout } from "../router.js";
import { createBrandMark } from "./brandMark.js";

export function createNavbar(currentUser, activeRoute = "feed") {
  const header = createElement("header", { className: "topbar" });

  const topRow = createElement("div", { className: "topbar-row" });
  const brand = createElement("div", { className: "topbar-brand" });
  const eyebrow = createElement("p", {
    className: "topbar-eyebrow",
    text: "Boitekong community network"
  });
  const status = createElement("p", {
    className: "topbar-status",
    text: `${currentUser.location.township} ${currentUser.location.extension} is live right now`
  });

  brand.append(createBrandMark({ compact: true, showTagline: false }), eyebrow, status);

  const utilityActions = createElement("div", { className: "topbar-utility-actions" });
  const notificationsBtn = createElement("button", {
    className: "secondary-btn topbar-utility-btn topbar-utility-btn-disabled",
    type: "button",
    attributes: {
      disabled: "true",
      "aria-disabled": "true",
      "aria-label": "Notifications coming soon",
      title: "Notifications coming soon"
    }
  });
  notificationsBtn.append(createNavButtonContent("notifications", "Alerts"));

  const searchBtn = createElement("button", {
    className: getTopbarButtonClass(activeRoute === "search"),
    type: "button",
    attributes: {
      "aria-label": "Search",
      title: "Search"
    }
  });
  searchBtn.append(createNavButtonContent("search", "Search"));
  searchBtn.addEventListener("click", () => navigate("search"));

  const actions = createElement("nav", {
    className: "topbar-actions",
    attributes: {
      "aria-label": "Primary navigation"
    }
  });

  const navItems = [
    { route: "feed", label: "Feed" },
    { route: "create-post", label: "Add Post" },
    { route: "profile", label: "Profile" }
  ];

  navItems.forEach(({ route, label }) => {
    const button = createElement("button", {
      className: getNavButtonClass(activeRoute === route),
      type: "button"
    });

    button.append(createNavButtonContent(route, label));
    button.addEventListener("click", () => navigate(route));
    actions.appendChild(button);
  });

  const bottomLogoutBtn = createElement("button", {
    className: "secondary-btn nav-action-btn",
    type: "button",
    attributes: {
      "aria-label": "Logout",
      title: "Logout"
    }
  });

  bottomLogoutBtn.append(createNavButtonContent("logout", "Logout"));
  bottomLogoutBtn.addEventListener("click", handleLogout);
  actions.appendChild(bottomLogoutBtn);

  utilityActions.append(notificationsBtn, searchBtn);
  topRow.append(brand, utilityActions);

  header.append(topRow, actions);
  return header;
}

function getNavButtonClass(isActive) {
  return isActive
    ? "secondary-btn nav-action-btn nav-action-btn-active"
    : "secondary-btn nav-action-btn";
}

function getTopbarButtonClass(isActive) {
  return isActive
    ? "secondary-btn topbar-utility-btn topbar-utility-btn-active"
    : "secondary-btn topbar-utility-btn";
}

function createNavButtonContent(iconName, label) {
  const content = createElement("span", { className: "nav-action-content" });
  const icon = createNavIcon(iconName);
  const text = createElement("span", {
    className: "nav-action-label",
    text: label
  });

  content.append(icon, text);
  return content;
}

function createNavIcon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("nav-action-icon");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-width", "1.9");
  path.setAttribute("d", getNavIconPath(name));

  svg.appendChild(path);
  return svg;
}

function getNavIconPath(name) {
  const paths = {
    feed: "M4 6.5h16M4 12h12M4 17.5h9",
    "create-post": "M12 5v14M5 12h14",
    search: "m20 20-4-4m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
    notifications: "M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m2 0a2 2 0 0 0 4 0h-4Z",
    profile: "M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 7a6 6 0 0 1 12 0",
    logout: "M14 7l5 5-5 5M19 12H9M9 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3"
  };

  return paths[name] || paths.feed;
}
