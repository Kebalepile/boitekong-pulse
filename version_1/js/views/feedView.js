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

  const createPostBtn = createElement("button", {
    className: "primary-btn",
    text: "Create Post",
    type: "button"
  });

  createPostBtn.addEventListener("click", () => navigate("create-post"));

  feedHeader.append(feedTitle, feedText, createPostBtn);

  const feedList = createElement("section", { className: "feed-list" });
  const posts = getPosts();

  if (posts.length === 0) {
    const emptyCard = createElement("div", { className: "placeholder-card" });
    const emptyTitle = createElement("h3", { text: "No posts yet" });
    const emptyText = createElement("p", {
      text: "Be the first to post something in your community."
    });

    const emptyAction = createElement("button", {
      className: "primary-btn",
      text: "Create First Post",
      type: "button"
    });

    emptyAction.addEventListener("click", () => navigate("create-post"));

    emptyCard.append(emptyTitle, emptyText, emptyAction);
    feedList.appendChild(emptyCard);
  } else {
    posts.forEach((post) => {
      const author = findUserById(post.userId);
      const postCard = createPostCard(post, author, currentUser.id, () => {
        renderFeed(app, currentUser);
      });

      feedList.appendChild(postCard);
    });
  }

  feedMain.append(feedHeader, feedList);
  shell.append(navbar, feedMain);
  app.appendChild(shell);
}