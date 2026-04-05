import { createElement } from "../utils/dom.js";
import { navigate, handleLogout } from "../router.js";
import { createBrandMark } from "./brandMark.js";
import { createAvatarElement } from "../utils/avatar.js";

export function createNavbar(currentUser, activeRoute = "feed", options = {}) {
  const initialSearchQuery =
    typeof options.initialSearchQuery === "string" ? options.initialSearchQuery : "";
  const initialSearchMode = options.initialSearchMode === "users" ? "users" : "posts";
  const searchModeOnLoad = Boolean(options.searchMode || activeRoute === "search");

  const header = createElement("header", { className: "topbar" });
  const topRow = createElement("div", { className: "topbar-row" });
  const brandGroup = createElement("div", { className: "topbar-brand-group" });
  const utilityActions = createElement("div", { className: "topbar-utility-actions" });

  const menuBtn = createElement("button", {
    className: "secondary-btn topbar-utility-btn",
    type: "button",
    attributes: {
      "aria-label": "Open menu",
      title: "Open menu"
    }
  });
  menuBtn.append(createNavButtonContent("menu", "Menu"));

  const brand = createElement("div", { className: "topbar-brand" });
  brand.append(createBrandMark({ compact: true, showTagline: false }));

  const searchBtn = createElement("button", {
    className: getTopbarButtonClass(activeRoute === "search"),
    type: "button",
    attributes: {
      "aria-label": "Search",
      title: "Search"
    }
  });
  searchBtn.append(createNavButtonContent("search", "Search"));

  const createBtn = createElement("button", {
    className:
      activeRoute === "create-post"
        ? "secondary-btn topbar-create-btn topbar-create-btn-active"
        : "secondary-btn topbar-create-btn",
    type: "button",
    attributes: {
      "aria-label": "Create post",
      title: "Create post"
    }
  });
  createBtn.append(createTopbarCreateContent());
  createBtn.addEventListener("click", () => navigate("create-post"));

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
  notificationsBtn.append(createNavButtonContent("notifications", "Notifications"));

  const profileBtn = createElement("button", {
    className:
      activeRoute === "profile"
        ? "secondary-btn topbar-profile-btn topbar-profile-btn-active"
        : "secondary-btn topbar-profile-btn",
    type: "button",
    attributes: {
      "aria-label": "Account menu",
      title: "Account menu"
    }
  });
  profileBtn.appendChild(
    createAvatarElement(currentUser, {
      size: "sm",
      className: "topbar-profile-avatar",
      decorative: true
    })
  );

  const searchRow = createElement("div", { className: "topbar-search-row" });
  const searchBackBtn = createElement("button", {
    className: "secondary-btn topbar-search-back-btn",
    type: "button",
    attributes: {
      "aria-label": searchModeOnLoad && activeRoute === "search" ? "Back to feed" : "Close search",
      title: searchModeOnLoad && activeRoute === "search" ? "Back to feed" : "Close search"
    }
  });
  searchBackBtn.append(createNavButtonContent("back", "Back"));

  const searchForm = createElement("form", {
    className: "topbar-search-form"
  });
  const searchField = createElement("label", {
    className: "topbar-search-field"
  });
  const searchFieldIcon = createNavIcon("search");
  searchFieldIcon.classList.add("topbar-search-field-icon");

  const searchInput = createElement("input", {
    className: "topbar-search-input",
    type: "search",
    placeholder: "Search",
    autocomplete: "off",
    attributes: {
      "aria-label": "Search posts and users"
    }
  });
  searchInput.value = initialSearchQuery;

  const searchModeControl = createElement("div", {
    className: "topbar-search-mode-control"
  });
  const searchModeBtn = createElement("button", {
    className: "secondary-btn topbar-search-mode-btn",
    type: "button",
    attributes: {
      "aria-label": "Search settings",
      title: "Search settings",
      "aria-haspopup": "menu",
      "aria-expanded": "false"
    }
  });
  const searchModeIcon = createNavIcon("sliders");
  searchModeIcon.classList.add("topbar-search-mode-icon");
  const searchModeText = createElement("span", {
    className: "topbar-search-mode-text",
    text: formatSearchModeLabel(initialSearchMode)
  });
  const searchModeMenu = createElement("div", {
    className: "topbar-search-mode-menu",
    attributes: {
      role: "menu",
      "aria-label": "Search type"
    }
  });

  let searchTarget = initialSearchMode;
  let searchMenuOpen = false;
  let removeSearchMenuListeners = () => {};

  const buildSearchModeOptions = () => {
    searchModeMenu.replaceChildren();

    [
      { value: "posts", label: "Posts" },
      { value: "users", label: "Users" }
    ].forEach(({ value, label }) => {
      const optionBtn = createElement("button", {
        className: `topbar-search-mode-option${searchTarget === value ? " topbar-search-mode-option-active" : ""}`,
        type: "button",
        text: label,
        attributes: {
          role: "menuitemradio",
          "aria-checked": searchTarget === value ? "true" : "false"
        }
      });

      optionBtn.addEventListener("click", () => {
        searchTarget = value;
        searchModeText.textContent = formatSearchModeLabel(searchTarget);
        buildSearchModeOptions();
        closeSearchMenu();
      });

      searchModeMenu.appendChild(optionBtn);
    });
  };

  const closeSearchMenu = () => {
    if (!searchMenuOpen) {
      return;
    }

    searchMenuOpen = false;
    searchModeMenu.style.display = "none";
    searchModeBtn.setAttribute("aria-expanded", "false");
    removeSearchMenuListeners();
    removeSearchMenuListeners = () => {};
  };

  const openSearchMenu = () => {
    if (searchMenuOpen) {
      return;
    }

    buildSearchModeOptions();
    searchMenuOpen = true;
    searchModeMenu.style.display = "grid";
    searchModeBtn.setAttribute("aria-expanded", "true");

    const handlePointerDown = (event) => {
      if (!searchModeControl.contains(event.target)) {
        closeSearchMenu();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeSearchMenu();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    removeSearchMenuListeners = () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  };

  searchModeBtn.append(searchModeIcon, searchModeText);
  searchModeBtn.addEventListener("click", (event) => {
    event.stopPropagation();

    if (searchMenuOpen) {
      closeSearchMenu();
      return;
    }

    openSearchMenu();
  });

  searchModeControl.append(searchModeBtn, searchModeMenu);

  searchField.append(searchFieldIcon, searchInput);
  searchForm.append(searchField, searchModeControl);
  searchRow.append(searchBackBtn, searchForm);

  const drawerController = createTopbarDrawer({
    currentUser,
    onNavigate: (route, payload = null) => navigate(route, payload),
    onLogout: handleLogout
  });
  const accountMenuController = createAccountMenu({
    currentUser,
    onNavigate: (route, payload = null) => navigate(route, payload),
    onLogout: handleLogout
  });

  let searchMode = false;

  const openSearchMode = () => {
    searchMode = true;
    topRow.style.display = "none";
    searchRow.style.display = "flex";

    window.requestAnimationFrame(() => {
      searchInput.focus({ preventScroll: true });
      const caret = searchInput.value.length;
      searchInput.setSelectionRange(caret, caret);
    });
  };

  const closeSearchMode = () => {
    closeSearchMenu();

    if (activeRoute === "search") {
      navigate("feed");
      return;
    }

    searchMode = false;
    searchRow.style.display = "none";
    topRow.style.display = "flex";
    window.requestAnimationFrame(() => {
      searchBtn.focus({ preventScroll: true });
    });
  };

  const submitSearch = () => {
    const query = searchInput.value.trim();

    navigate("search", {
      query,
      mode: searchTarget
    });
  };

  menuBtn.addEventListener("click", drawerController.open);
  profileBtn.addEventListener("click", accountMenuController.open);
  searchBtn.addEventListener("click", openSearchMode);
  searchBackBtn.addEventListener("click", closeSearchMode);
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitSearch();
  });

  brandGroup.append(menuBtn, brand);
  utilityActions.append(searchBtn, createBtn, notificationsBtn, profileBtn);
  topRow.append(brandGroup, utilityActions);
  header.append(topRow, searchRow);

  searchModeMenu.style.display = "none";
  searchRow.style.display = "none";

  if (searchModeOnLoad) {
    openSearchMode();
  }

  return header;
}

function createTopbarDrawer({ currentUser, onNavigate, onLogout }) {
  let root = null;
  let closeTimerId = null;

  const ensureRoot = () => {
    if (root?.isConnected) {
      return root;
    }

    root = createElement("div", { className: "topbar-drawer-root" });
    const overlay = createElement("button", {
      className: "topbar-drawer-overlay",
      type: "button",
      attributes: {
        "aria-label": "Close menu"
      }
    });
    const panel = createElement("aside", {
      className: "topbar-drawer-panel",
      attributes: {
        "aria-label": "Main menu"
      }
    });
    const header = createElement("div", { className: "topbar-drawer-header" });
    header.append(createBrandMark({ compact: true, showTagline: false }));

    const userRow = createElement("button", {
      className: "topbar-drawer-user",
      type: "button"
    });
    const avatar = createAvatarElement(currentUser, {
      size: "md",
      className: "topbar-drawer-avatar",
      decorative: true
    });
    const userCopy = createElement("div", { className: "topbar-drawer-user-copy" });
    const username = createElement("strong", {
      className: "topbar-drawer-username",
      text: currentUser.username
    });
    const location = createElement("span", {
      className: "topbar-drawer-location",
      text: `${currentUser.location.township} ${currentUser.location.extension}`
    });
    userCopy.append(username, location);
    userRow.append(avatar, userCopy);
    userRow.addEventListener("click", () => {
      close();
      onNavigate("feed");
    });

    const navSection = createElement("div", { className: "topbar-drawer-section" });
    navSection.append(
      createDrawerItem({
        iconName: "feed",
        label: "Feed",
        onSelect: () => onNavigate("feed")
      }),
      createDrawerItem({
        iconName: "create-post",
        label: "Create post",
        onSelect: () => onNavigate("create-post")
      })
    );

    const accountSection = createElement("div", { className: "topbar-drawer-section" });
    const accountTitle = createElement("p", {
      className: "topbar-drawer-section-title",
      text: "Account"
    });
    accountSection.append(
      accountTitle,
      createDrawerItem({
        iconName: "logout",
        label: "Logout",
        danger: true,
        onSelect: onLogout
      })
    );

    const infoSection = createElement("div", {
      className: "topbar-drawer-section topbar-drawer-info-section"
    });
    const aboutTitle = createElement("p", {
      className: "topbar-drawer-section-title",
      text: "About"
    });
    const aboutCopy = createElement("p", {
      className: "topbar-drawer-about-copy",
      text: "Boitekong Now is a mobile-first township community feed for local posts, replies, and voice-note conversations."
    });
    const contactTitle = createElement("p", {
      className: "topbar-drawer-section-title",
      text: "Contact us"
    });
    const contactList = createElement("div", {
      className: "topbar-drawer-contact-list"
    });
    const emailRow = createDrawerInfoRow("Email", "kmotshoana@gmail.com", {
      href: "mailto:kmotshoana@gmail.com"
    });
    const githubRow = createDrawerInfoRow("GitHub", "github.com/Kebalepile", {
      href: "https://github.com/Kebalepile"
    });
    const phoneRow = createDrawerInfoRow("Phone", "069 848 8813", {
      href: "tel:0698488813"
    });
    const copyright = createElement("p", {
      className: "topbar-drawer-copyright",
      text: "Copyright 2025 Boitekong Now. All rights reserved."
    });

    contactList.append(emailRow, githubRow, phoneRow);
    infoSection.append(aboutTitle, aboutCopy, contactTitle, contactList, copyright);

    panel.append(header, userRow, navSection, accountSection, infoSection);
    root.append(overlay, panel);

    overlay.addEventListener("click", close);
    panel.addEventListener("click", (event) => event.stopPropagation());
    root.addEventListener("click", (event) => {
      if (event.target === root) {
        close();
      }
    });

    return root;
  };

  const open = () => {
    const drawer = ensureRoot();
    if (!drawer.isConnected) {
      document.body.appendChild(drawer);
      window.requestAnimationFrame(() => {
        drawer.classList.add("topbar-drawer-root-open");
      });
    }
  };

  const close = () => {
    if (!root?.isConnected) {
      return;
    }

    root.classList.remove("topbar-drawer-root-open");
    window.clearTimeout(closeTimerId);
    closeTimerId = window.setTimeout(() => {
      root?.remove();
      closeTimerId = null;
    }, 180);
  };

  return { open, close };
}

function createAccountMenu({ currentUser, onNavigate, onLogout }) {
  let root = null;
  let closeTimerId = null;

  const ensureRoot = () => {
    if (root?.isConnected) {
      return root;
    }

    root = createElement("div", { className: "topbar-account-root" });
    const overlay = createElement("button", {
      className: "topbar-account-overlay",
      type: "button",
      attributes: {
        "aria-label": "Close account menu"
      }
    });
    const panel = createElement("section", {
      className: "topbar-account-panel",
      attributes: {
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "Account menu"
      }
    });
    const summary = createElement("div", { className: "topbar-account-summary" });
    const avatar = createAvatarElement(currentUser, {
      size: "md",
      className: "topbar-account-avatar",
      decorative: true
    });
    const summaryCopy = createElement("div", {
      className: "topbar-account-summary-copy"
    });
    const username = createElement("strong", {
      className: "topbar-account-name",
      text: currentUser.username
    });
    const handle = createElement("span", {
      className: "topbar-account-handle",
      text: `@${currentUser.username}`
    });
    const location = createElement("span", {
      className: "topbar-account-location",
      text: `${currentUser.location.township} ${currentUser.location.extension}`
    });
    const viewProfileBtn = createElement("button", {
      className: "topbar-account-link",
      type: "button",
      text: "View profile"
    });

    viewProfileBtn.addEventListener("click", () => {
      close();
      onNavigate("profile");
    });

    summaryCopy.append(username, handle, location, viewProfileBtn);
    summary.append(avatar, summaryCopy);

    const actions = createElement("div", { className: "topbar-account-actions" });
    actions.append(
      createAccountItem({
        iconName: "logout",
        label: "Sign out",
        danger: true,
        onSelect: onLogout
      })
    );

    panel.append(summary, actions);
    root.append(overlay, panel);

    overlay.addEventListener("click", close);
    panel.addEventListener("click", (event) => event.stopPropagation());

    return root;
  };

  const open = () => {
    const menu = ensureRoot();
    if (!menu.isConnected) {
      document.body.appendChild(menu);
      window.requestAnimationFrame(() => {
        menu.classList.add("topbar-account-root-open");
      });
    }
  };

  const close = () => {
    if (!root?.isConnected) {
      return;
    }

    root.classList.remove("topbar-account-root-open");
    window.clearTimeout(closeTimerId);
    closeTimerId = window.setTimeout(() => {
      root?.remove();
      closeTimerId = null;
    }, 180);
  };

  return { open, close };
}

function createDrawerItem({ iconName, label, onSelect, danger = false }) {
  return createMenuItem({
    iconName,
    label,
    onSelect,
    danger,
    className: "topbar-drawer-item",
    labelClassName: "topbar-drawer-item-label",
    iconClassName: "topbar-drawer-item-icon",
    rootSelector: ".topbar-drawer-root",
    openClassName: "topbar-drawer-root-open"
  });
}

function createAccountItem({ iconName, label, onSelect, danger = false }) {
  return createMenuItem({
    iconName,
    label,
    onSelect,
    danger,
    className: "topbar-account-item",
    labelClassName: "topbar-account-item-label",
    iconClassName: "topbar-account-item-icon",
    rootSelector: ".topbar-account-root",
    openClassName: "topbar-account-root-open"
  });
}

function createMenuItem({
  iconName,
  label,
  onSelect,
  danger = false,
  className,
  labelClassName,
  iconClassName,
  rootSelector,
  openClassName
}) {
  const button = createElement("button", {
    className: `${className}${danger ? ` ${className}-danger` : ""}`,
    type: "button"
  });
  const icon = createNavIcon(iconName);
  icon.classList.add(iconClassName);
  const text = createElement("span", {
    className: labelClassName,
    text: label
  });

  button.append(icon, text);
  button.addEventListener("click", onSelect);
  button.addEventListener("click", () => {
    const root = button.closest(rootSelector);
    root?.classList.remove(openClassName);
    window.setTimeout(() => root?.remove(), 180);
  });

  return button;
}

function createDrawerInfoRow(label, value, options = {}) {
  const row = createElement("div", { className: "topbar-drawer-contact-row" });
  const labelNode = createElement("span", {
    className: "topbar-drawer-contact-label",
    text: label
  });

  let valueNode;

  if (options.href) {
    valueNode = createElement("a", {
      className: "topbar-drawer-contact-link",
      text: value,
      attributes: {
        href: options.href,
        target: "_blank",
        rel: "noreferrer"
      }
    });
  } else {
    valueNode = createElement("span", {
      className: "topbar-drawer-contact-value",
      text: value
    });
  }

  row.append(labelNode, valueNode);
  return row;
}

function formatSearchModeLabel(value) {
  return value === "users" ? "Users" : "Posts";
}

function getTopbarButtonClass(isActive) {
  return isActive
    ? "secondary-btn topbar-utility-btn topbar-utility-btn-active"
    : "secondary-btn topbar-utility-btn";
}

function createTopbarCreateContent() {
  const content = createElement("span", { className: "topbar-create-content" });
  const icon = createNavIcon("create-post");
  icon.classList.add("topbar-create-icon");
  const text = createElement("span", {
    className: "topbar-create-label",
    text: "Create"
  });

  content.append(icon, text);
  return content;
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
    sliders:
      "M4 7h6m4 0h6M10 7a2 2 0 1 0 0 .001M4 12h12m4 0h0M16 12a2 2 0 1 0 0 .001M4 17h3m5 0h8M9 17a2 2 0 1 0 0 .001",
    menu: "M4 7h16M4 12h16M4 17h16",
    back: "M15 18 9 12l6-6",
    notifications: "M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m2 0a2 2 0 0 0 4 0h-4Z",
    profile: "M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 7a6 6 0 0 1 12 0",
    logout: "M14 7l5 5-5 5M19 12H9M9 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3"
  };

  return paths[name] || paths.feed;
}
