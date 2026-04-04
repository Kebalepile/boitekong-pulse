import { createElement } from "../utils/dom.js";
import { setPostReaction, getUserReaction } from "../services/postService.js";

export function createPostCard(post, author, currentUserId, onReactionChange) {
  const card = createElement("article", { className: "post-card" });

  const header = createElement("div", { className: "post-card-header" });
  const authorBlock = createElement("div", { className: "post-author-block" });

  const authorName = createElement("h3", {
    className: "post-author",
    text: author?.username || "Unknown User"
  });

  const meta = createElement("p", {
    className: "post-meta",
    text: `${post.location.township} ${post.location.extension} · ${formatTimestamp(post.createdAt)}`
  });

  authorBlock.append(authorName, meta);
  header.appendChild(authorBlock);

  const content = createElement("p", {
    className: "post-content",
    text: post.content
  });

  card.append(header, content);

  if (post.image) {
    const imageWrapper = createElement("div", { className: "post-image-wrapper" });
    const image = document.createElement("img");
    image.className = "post-image";
    image.src = post.image;
    image.alt = "Post image";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";

    image.addEventListener("error", () => {
      imageWrapper.remove();
    });

    imageWrapper.appendChild(image);
    card.appendChild(imageWrapper);
  }

  const footer = createElement("div", { className: "post-card-footer" });
  const footerText = createElement("span", {
    className: "post-footer-text",
    text: `Posted by ${author?.username || "Unknown User"}`
  });

  footer.appendChild(footerText);

  const reactions = createReactionBar(post, currentUserId, onReactionChange);

  card.append(footer, reactions);

  return card;
}

function createReactionBar(post, currentUserId, onReactionChange) {
  const wrapper = createElement("div", { className: "reaction-bar" });
  const activeReaction = getUserReaction(post, currentUserId);

  const buttons = [
    { type: "like", label: "👍 Like", count: post.reactions?.like?.length || 0 },
    { type: "meh", label: "😐 Meh", count: post.reactions?.meh?.length || 0 },
    { type: "dislike", label: "👎 Dislike", count: post.reactions?.dislike?.length || 0 }
  ];

  buttons.forEach(({ type, label, count }) => {
    const button = createElement("button", {
      className: `reaction-btn${activeReaction === type ? " reaction-btn-active" : ""}`,
      type: "button",
      text: `${label} (${count})`
    });

    button.addEventListener("click", () => {
      setPostReaction({
        postId: post.id,
        userId: currentUserId,
        reactionType: type
      });

      if (typeof onReactionChange === "function") {
        onReactionChange();
      }
    });

    wrapper.appendChild(button);
  });

  return wrapper;
}

function formatTimestamp(isoDate) {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}