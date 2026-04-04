import { clearElement, createElement } from "../utils/dom.js";
import { createNavbar } from "../components/navbar.js";
import { navigate } from "../router.js";
import { getPosts } from "../services/postService.js";
import { findUserById } from "../services/userService.js";
import { createPostCard } from "../components/postCard.js";

export function renderFeed(app, currentUser) {
  clearElement(app);

  const shell = createElement("section", { className: "feed-shell" });
  const navbar = createNavbar(currentUser);

  const feedMain = createElement("main", { className: "feed-main" });
  const feedHeader = createElement("section", { className: "feed-header-card" });

  const feedTitle = createElement("h2", { text: "Community Feed" });
  const feedText = createElement("p", {
    text: "See what people in your area are posting."
  });

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

  const createPostBtn = createElement("button", {
    className: "primary-btn",
    text: "Create Post",
    type: "button"
  });

  createPostBtn.addEventListener("click", () => navigate("create-post"));

  filters.append(townshipInput, extensionInput, clearBtn, createPostBtn);
  feedHeader.append(feedTitle, feedText, filters);

  const feedList = createElement("section", { className: "feed-list" });

  feedMain.append(feedHeader, feedList);
  shell.append(navbar, feedMain);
  app.appendChild(shell);

  const renderPosts = () => {
    clearElement(feedList);

    const townshipQuery = townshipInput.value.trim().toLocaleLowerCase();
    const extensionQuery = extensionInput.value.trim().toLocaleLowerCase();

    let posts = getPosts();

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

    posts.forEach((post) => {
      const author = findUserById(post.userId);
      const postCard = createPostCard(post, author, currentUser.id, renderPosts);
      feedList.appendChild(postCard);
    });
  };

  townshipInput.addEventListener("input", renderPosts);
  extensionInput.addEventListener("input", renderPosts);

  clearBtn.addEventListener("click", () => {
    townshipInput.value = "";
    extensionInput.value = "";
    renderPosts();
  });

  renderPosts();
}