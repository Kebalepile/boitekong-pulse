import { clearElement, createElement } from "../utils/dom.js";
import { createNavbar } from "../components/navbar.js";
import { showUserPreviewSheet } from "../components/userPreviewSheet.js";
import { searchUsers, searchPosts } from "../services/searchService.js";
import {
  filterVisiblePostsForUser,
  getVisiblePostsByUserId
} from "../services/postService.js";
import { createPostCard } from "../components/postCard.js";
import { findUserById } from "../services/userService.js";
import { createAvatarElement } from "../utils/avatar.js";
import { SEARCH_BATCH_SIZE, createLoadMoreControl } from "../utils/listBatching.js";

export function renderSearch(app, currentUser, payload = null) {
  clearElement(app);

  const initialMode = payload?.mode === "users" ? "users" : "posts";
  const initialQuery = typeof payload?.query === "string" ? payload.query : "";
  const authorUserId = typeof payload?.authorUserId === "string" ? payload.authorUserId : "";
  const authorUsername =
    typeof payload?.authorUsername === "string" ? payload.authorUsername : "";
  const authorPostsView = Boolean(authorUserId && initialMode === "posts");

  const shell = createElement("section", { className: "feed-shell" });
  const navbar = createNavbar(currentUser, "search", {
    initialSearchQuery: initialQuery,
    initialSearchMode: initialMode,
    searchMode: true
  });

  const main = createElement("main", { className: "feed-main search-main" });

  const searchCard = createElement("section", {
    className: "feed-header-card search-hero-card"
  });
  const eyebrow = createElement("p", {
    className: "section-eyebrow",
    text: "Explore"
  });
  const title = createElement("h2", {
    className: "section-title",
    text: authorPostsView ? "Posts" : "Search people and local posts"
  });
  const description = createElement("p", {
    className: "section-copy",
    text: authorPostsView
      ? `Showing posts from @${authorUsername || "this user"}.`
      : initialQuery.trim()
      ? `Showing ${initialMode === "users" ? "people" : "posts"} for "${initialQuery}".`
      : "Find neighbors, trending updates, and township conversations without leaving the feed."
  });
  searchCard.append(eyebrow, title, description);

  const results = createElement("section", { className: "feed-list search-results-list" });
  let visibleUserCount = SEARCH_BATCH_SIZE;
  let visiblePostCount = SEARCH_BATCH_SIZE;

  main.append(searchCard, results);
  shell.append(navbar, main);
  app.appendChild(shell);

  if (authorPostsView || initialQuery.trim()) {
    runSearch();
  } else {
    renderIdleState(results);
  }

  function runSearch() {
    if (authorPostsView) {
      renderPostResults(results, getVisiblePostsByUserId(authorUserId, currentUser.id), {
        currentUserId: currentUser.id,
        app,
        currentUser,
        searchPayload: {
          mode: "posts",
          authorUserId,
          authorUsername
        },
        visibleCount: visiblePostCount,
        onLoadMore: () => {
          visiblePostCount += SEARCH_BATCH_SIZE;
          runSearch();
        }
      });
      return;
    }

    const query = initialQuery.trim();

    if (!query) {
      renderIdleState(results);
      return;
    }

    if (initialMode === "users") {
      renderUserResults(results, searchUsers(query), {
        currentUserId: currentUser.id,
        visibleCount: visibleUserCount,
        onLoadMore: () => {
          visibleUserCount += SEARCH_BATCH_SIZE;
          runSearch();
        }
      });
      return;
    }

    renderPostResults(results, filterVisiblePostsForUser(searchPosts(query), currentUser.id), {
      currentUserId: currentUser.id,
      app,
      currentUser,
      searchPayload: {
        mode: "posts",
        query
      },
      visibleCount: visiblePostCount,
      onLoadMore: () => {
        visiblePostCount += SEARCH_BATCH_SIZE;
        runSearch();
      }
    });
  }
}

function renderIdleState(results) {
  clearElement(results);
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

function renderUserResults(results, users, { currentUserId, visibleCount, onLoadMore }) {
  clearElement(results);

  if (users.length === 0) {
    renderNoResults(results, "users");
    return;
  }

  const visibleUsers = users.slice(0, visibleCount);

  visibleUsers.forEach((user) => {
    const card = createElement("button", {
      className: "profile-card search-user-card",
      type: "button",
      attributes: {
        "aria-label": `Open ${user.username}'s profile preview`,
        title: user.username
      }
    });
    const avatar = createAvatarElement(user, {
      size: "md",
      className: "search-user-avatar",
      decorative: true
    });
    const body = createElement("div", { className: "search-user-copy" });
    const username = createElement("h3", { text: user.username });
    const location = createElement("p", {
      text: `${user.location.township} ${user.location.extension}`
    });
    const hint = createElement("span", {
      className: "search-user-hint",
      text: "Community member"
    });

    body.append(username, location, hint);
    card.append(avatar, body);
    card.addEventListener("click", () => {
      showUserPreviewSheet({
        userId: user.id,
        currentUserId
      });
    });
    results.appendChild(card);
  });

  if (users.length > visibleUsers.length) {
    results.appendChild(
      createLoadMoreControl({
        label: "See more users",
        onClick: onLoadMore
      })
    );
  }
}

function renderPostResults(
  results,
  posts,
  { currentUserId, app, currentUser, searchPayload, visibleCount, onLoadMore }
) {
  clearElement(results);

  if (posts.length === 0) {
    if (searchPayload?.authorUserId) {
      const card = createElement("div", { className: "placeholder-card" });
      card.append(
        createElement("h3", { text: "No posts yet" }),
        createElement("p", {
          text: `@${searchPayload.authorUsername || "This user"} has not posted yet.`
        })
      );
      results.appendChild(card);
      return;
    }

    renderNoResults(results, "posts");
    return;
  }

  const visiblePosts = posts.slice(0, visibleCount);

  visiblePosts.forEach((post) => {
    const author = findUserById(post.userId);
    const card = createPostCard(post, author, currentUserId, () => {
      renderSearch(app, currentUser, searchPayload);
    });

    results.appendChild(card);
  });

  if (posts.length > visiblePosts.length) {
    results.appendChild(
      createLoadMoreControl({
        label: "See more posts",
        onClick: onLoadMore
      })
    );
  }
}
