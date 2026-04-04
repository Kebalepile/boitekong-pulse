import { createElement } from "../utils/dom.js";
import { setPostReaction, getUserReaction, deletePost } from "../services/postService.js";
import { navigate } from "../router.js";
import { showToast } from "./toast.js";
import { showConfirmDialog } from "./confirmDialog.js";

export function createPostCard(post, author, currentUserId, onReactionChange) {
  const card = createElement("article", { className: "post-card" });

  const header = createElement("div", { className: "post-card-header" });
  const authorBlock = createElement("div", { className: "post-author-block" });

  const authorName = createElement("h3", {
    className: "post-author",
    text: author?.username || "Unknown User"
  });

  const metaText = post.updatedAt
    ? `${post.location.township} ${post.location.extension} · ${formatTimestamp(post.createdAt)} · Edited`
    : `${post.location.township} ${post.location.extension} · ${formatTimestamp(post.createdAt)}`;

  const meta = createElement("p", {
    className: "post-meta",
    text: metaText
  });

  authorBlock.append(authorName, meta);
  header.appendChild(authorBlock);

  if (post.userId === currentUserId) {
    const ownerActions = createElement("div", { className: "owner-actions" });

    const editBtn = createElement("button", {
      className: "owner-action-btn",
      type: "button",
      text: "Edit"
    });

    const deleteBtn = createElement("button", {
      className: "owner-action-btn owner-action-danger",
      type: "button",
      text: "Delete"
    });

    editBtn.addEventListener("click", () => {
      navigate("edit-post", { postId: post.id });
    });

    deleteBtn.addEventListener("click", () => {
      showConfirmDialog({
        title: "Delete post?",
        message: "This post will be permanently removed.",
        confirmText: "Delete",
        cancelText: "Cancel",
        danger: true,
        onConfirm: () => {
          try {
            deletePost({
              postId: post.id,
              userId: currentUserId
            });

            showToast("Post deleted.", "success");

            if (typeof onReactionChange === "function") {
              onReactionChange();
            }
          } catch (error) {
            showToast(error.message || "Failed to delete post.", "error");
          }
        }
      });
    });

    ownerActions.append(editBtn, deleteBtn);
    header.appendChild(ownerActions);
  }

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