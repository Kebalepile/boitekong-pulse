import { clearElement, createElement } from "../utils/dom.js";
import { createNavbar } from "../components/navbar.js";
import { navigate, registerViewCleanup } from "../router.js";
import {
  getVisiblePosts,
  loadFeedPosts,
  loadPostById,
  subscribeToPostChanges
} from "../services/postService.js";
import { findUserById } from "../services/userService.js";
import { createPostCard, openCommentsSheetForPost } from "../components/postCard.js";
import { FEED_BATCH_SIZE, createLoadMoreControl } from "../utils/listBatching.js";
import { setLiveSyncOptions } from "../services/liveSyncService.js";
import { showToast } from "../components/toast.js";

export async function renderFeed(app, currentUser, payload = null) {
  clearElement(app);
  const initialLoadTasks = [loadFeedPosts()];

  if (typeof payload?.postId === "string" && payload.postId.trim()) {
    initialLoadTasks.push(loadPostById(payload.postId));
  }

  const initialLoadResults = await Promise.allSettled(initialLoadTasks);
  const failedInitialLoads = initialLoadResults.filter((result) => result.status === "rejected");

  if (failedInitialLoads.length > 0) {
    showToast(
      "Could not fully refresh the feed. Showing available cached posts.",
      "error"
    );
  }

  let visiblePostsCount = FEED_BATCH_SIZE;
  let lastFilterKey = "";
  let pendingCommentsTarget =
    typeof payload?.postId === "string"
      ? {
          postId: payload.postId,
          focusCommentId: typeof payload?.focusCommentId === "string" ? payload.focusCommentId : null
        }
      : null;

  const shell = createElement("section", { className: "feed-shell" });
  const navbar = createNavbar(currentUser, "feed");

  const feedMain = createElement("main", { className: "feed-main" });
  const feedHeader = createElement("section", {
    className: "feed-header-card feed-hero-card"
  });

  const feedTitle = createElement("h2", {
    className: "section-title",
    text: "Community feed"
  });
  const feedText = createElement("p", {
    className: "section-copy",
    text: "See what people in your area are saying right now, then jump into the thread with comments, replies, and voice notes."
  });
  const statScroller = createElement("div", { className: "feed-stat-scroller" });
  const statRow = createElement("div", { className: "feed-stat-row" });
  statScroller.appendChild(statRow);

  const filters = createElement("div", { className: "filter-row" });

  const townshipInput = createElement("input", {
    className: "form-input filter-input",
    id: "feed-filter-township",
    type: "text",
    placeholder: "Filter by township",
    autocomplete: "off"
  });

  const extensionInput = createElement("input", {
    className: "form-input filter-input",
    id: "feed-filter-extension",
    type: "text",
    placeholder: "Filter by extension",
    autocomplete: "off"
  });

  const clearBtn = createElement("button", {
    className: "secondary-btn",
    text: "Clear Filters",
    type: "button"
  });

  filters.append(townshipInput, extensionInput, clearBtn);
  feedHeader.append(feedTitle, feedText, statScroller, filters);

  const feedList = createElement("section", { className: "feed-list" });

  feedMain.append(feedHeader, feedList);
  shell.append(navbar, feedMain);
  app.appendChild(shell);

  const renderPosts = () => {
    clearElement(feedList);

    const townshipQuery = townshipInput.value.trim().toLocaleLowerCase();
    const extensionQuery = extensionInput.value.trim().toLocaleLowerCase();

    let posts = getVisiblePosts(currentUser.id);

    if (townshipQuery) {
      posts = posts.filter((post) =>
        post.location.township.toLocaleLowerCase().includes(townshipQuery)
      );
    }

    if (extensionQuery) {
      posts = posts.filter((post) =>
        post.location.extension.toLocaleLowerCase().includes(extensionQuery)
      );
    }

    const uniqueAuthors = new Set(posts.map((post) => post.userId)).size;
    clearElement(statRow);
    statRow.append(
      createStatPill("Posts", String(posts.length)),
      createStatPill("Neighbors", String(uniqueAuthors)),
      createStatPill(
        "Your B-Point",
        `${currentUser.location.township} ${currentUser.location.extension}`
      )
    );

    const filterKey = `${townshipQuery}::${extensionQuery}`;

    if (filterKey !== lastFilterKey) {
      lastFilterKey = filterKey;
      visiblePostsCount = FEED_BATCH_SIZE;
    }

    if (posts.length === 0) {
      const emptyCard = createElement("div", { className: "placeholder-card" });
      const emptyTitle = createElement("h3", {
        text: townshipQuery || extensionQuery ? "No filtered posts found" : "No posts yet"
      });
      const emptyText = createElement("p", {
        text:
          townshipQuery || extensionQuery
            ? "Try adjusting or clearing your filters."
            : "Be the first to post something in your community."
      });

      const emptyAction = createElement("button", {
        className: "primary-btn",
        text: townshipQuery || extensionQuery ? "Create Post Instead" : "Create First Post",
        type: "button"
      });

      emptyAction.addEventListener("click", () => navigate("create-post"));

      emptyCard.append(emptyTitle, emptyText, emptyAction);
      feedList.appendChild(emptyCard);
      return;
    }

    const visiblePosts = posts.slice(0, visiblePostsCount);

    visiblePosts.forEach((post) => {
      const author = post.author || findUserById(post.userId);
      const postCard = createPostCard(post, author, currentUser.id, renderPosts);
      feedList.appendChild(postCard);
    });

    if (posts.length > visiblePosts.length) {
      feedList.appendChild(
        createLoadMoreControl({
          label: "See more posts",
          onClick: () => {
            visiblePostsCount += FEED_BATCH_SIZE;
            renderPosts();
          }
        })
      );
    }

    if (pendingCommentsTarget) {
      const { postId, focusCommentId } = pendingCommentsTarget;
      pendingCommentsTarget = null;

      window.requestAnimationFrame(() => {
        openCommentsSheetForPost({
          postId,
          currentUserId: currentUser.id,
          onPostChange: renderPosts,
          focusCommentId
        });
      });
    }
  };

  townshipInput.addEventListener("input", renderPosts);
  extensionInput.addEventListener("input", renderPosts);

  clearBtn.addEventListener("click", () => {
    townshipInput.value = "";
    extensionInput.value = "";
    renderPosts();
  });

  setLiveSyncOptions({
    includePosts: true
  });
  registerViewCleanup(() => {
    setLiveSyncOptions({
      includePosts: false
    });
  });
  registerViewCleanup(
    subscribeToPostChanges(() => {
      renderPosts();
    })
  );

  renderPosts();
}

function createStatPill(label, value) {
  const pill = createElement("div", {
    className: `feed-stat-pill${label === "Your B-Point" ? " feed-stat-pill-wide" : ""}`
  });
  const pillLabel = createElement("span", {
    className: "feed-stat-label",
    text: label
  });
  const pillValue = createElement("strong", {
    className: "feed-stat-value",
    text: value
  });

  pill.append(pillLabel, pillValue);
  return pill;
}
