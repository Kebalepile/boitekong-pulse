import { clearElement, createElement } from "../utils/dom.js";
import { createNavbar } from "../components/navbar.js";
import { searchUsers, searchPosts } from "../services/searchService.js";
import { createPostCard } from "../components/postCard.js";
import { findUserById } from "../services/userService.js";

export function renderSearch(app, currentUser, payload = null) {
  clearElement(app);

  const initialMode = payload?.mode === "users" ? "users" : "posts";
  const initialQuery = typeof payload?.query === "string" ? payload.query : "";

  const shell = createElement("section", { className: "feed-shell" });
  const navbar = createNavbar(currentUser);

  const main = createElement("main", { className: "feed-main" });

  const searchCard = createElement("section", { className: "feed-header-card" });
  const title = createElement("h2", { text: "Search" });
  const description = createElement("p", {
    text: "Search for users or posts across the local app data."
  });

  const modeRow = createElement("div", { className: "search-mode-row" });

  const usersBtn = createElement("button", {
    className: initialMode === "users" ? "reaction-btn reaction-btn-active" : "reaction-btn",
    text: "Users",
    type: "button"
  });

  const postsBtn = createElement("button", {
    className: initialMode === "posts" ? "reaction-btn reaction-btn-active" : "reaction-btn",
    text: "Posts",
    type: "button"
  });

  const form = createElement("form", {
    className: "search-form",
    id: "search-form"
  });

  const input = createElement("input", {
    className: "form-input",
    id: "search-query",
    type: "search",
    placeholder: "Search users, posts, township, extension...",
    required: true,
    autocomplete: "off"
  });

  input.value = initialQuery;

  const submitBtn = createElement("button", {
    className: "primary-btn",
    text: "Search",
    type: "submit"
  });

  modeRow.append(usersBtn, postsBtn);
  form.append(input, submitBtn);
  searchCard.append(title, description, modeRow, form);

  const results = createElement("section", { className: "feed-list" });

  let mode = initialMode;

  usersBtn.addEventListener("click", () => {
    mode = "users";
    updateModeButtons(usersBtn, postsBtn, mode);
    runSearch();
  });

  postsBtn.addEventListener("click", () => {
    mode = "posts";
    updateModeButtons(usersBtn, postsBtn, mode);
    runSearch();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch();
  });

  main.append(searchCard, results);
  shell.append(navbar, main);
  app.appendChild(shell);

  if (initialQuery.trim()) {
    runSearch();
  } else {
    renderIdleState(results);
  }

  function runSearch() {
    const query = input.value.trim();

    if (!query) {
      renderIdleState(results);
      return;
    }

    if (mode === "users") {
      renderUserResults(results, searchUsers(query));
      return;
    }

    renderPostResults(results, searchPosts(query), currentUser.id, app, currentUser, query);
  }
}

function updateModeButtons(usersBtn, postsBtn, mode) {
  usersBtn.className = mode === "users" ? "reaction-btn reaction-btn-active" : "reaction-btn";
  postsBtn.className = mode === "posts" ? "reaction-btn reaction-btn-active" : "reaction-btn";
}

function renderIdleState(results) {
  clearElement(results);

  const card = createElement("div", { className: "placeholder-card" });
  const title = createElement("h3", { text: "Start searching" });
  const text = createElement("p", {
    text: "Use the search box above to find users or posts."
  });

  card.append(title, text);
  results.appendChild(card);
}

function renderNoResults(results, label) {
  clearElement(results);

  const card = createElement("div", { className: "placeholder-card" });
  const title = createElement("h3", { text: "No results found" });
  const text = createElement("p", {
    text: `No ${label} matched your search.`
  });

  card.append(title, text);
  results.appendChild(card);
}

function renderUserResults(results, users) {
  clearElement(results);

  if (users.length === 0) {
    renderNoResults(results, "users");
    return;
  }

  users.forEach((user) => {
    const card = createElement("article", { className: "profile-card search-user-card" });
    const username = createElement("h3", { text: user.username });
    const location = createElement("p", {
      text: `${user.location.township} ${user.location.extension}`
    });

    card.append(username, location);
    results.appendChild(card);
  });
}

function renderPostResults(results, posts, currentUserId, app, currentUser, query) {
  clearElement(results);

  if (posts.length === 0) {
    renderNoResults(results, "posts");
    return;
  }

  posts.forEach((post) => {
    const author = findUserById(post.userId);
    const card = createPostCard(post, author, currentUserId, () => {
      renderSearch(app, currentUser, { mode: "posts", query });
    });

    results.appendChild(card);
  });
}