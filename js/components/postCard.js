import { createElement, setFieldError, clearFormErrors, createFieldError } from "../utils/dom.js";
import {
  setPostReaction,
  getUserReaction,
  deletePost,
  addCommentToPost,
  getCommentsForPost,
  updateCommentInPost,
  deleteCommentFromPost
} from "../services/postService.js";
import { navigate } from "../router.js";
import { showToast } from "./toast.js";
import { showConfirmDialog } from "./confirmDialog.js";
import { createCommentCard } from "./commentCard.js";
import { findUserById } from "../services/userService.js";
import { buildCommentTree } from "../utils/commentTree.js";
import { validatePostContent } from "../utils/validators.js";

const openCommentPanelPostIds = new Set();

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
  const commentsSection = createCommentsSection(post, currentUserId, onReactionChange);

  card.append(footer, reactions, commentsSection);

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

function createCommentsSection(post, currentUserId, onReactionChange) {
  const section = createElement("section", { className: "comments-section" });
  const comments = getCommentsForPost(post.id);
  const commentTree = buildCommentTree(comments);
  const isPanelOpen = openCommentPanelPostIds.has(post.id);
  const header = createElement("div", { className: "comments-header" });

  const heading = createElement("h4", {
    className: "comments-title",
    text: "Conversation"
  });

  const toggleBtn = createElement("button", {
    className: `comment-toggle-btn${isPanelOpen ? " comment-toggle-btn-active" : ""}`,
    type: "button",
    text: isPanelOpen ? `Hide comments (${comments.length})` : `Comments (${comments.length})`
  });

  const panel = createElement("div", { className: "comments-panel" });
  panel.hidden = !isPanelOpen;

  const form = createCommentForm({
    inputId: `comment-input-${post.id}`,
    placeholder: "Write a comment...",
    helperText: "Join the conversation on this post.",
    submitText: "Comment",
    successMessage: "Comment added.",
    onSubmitText: (content) =>
      addCommentToPost({
        postId: post.id,
        userId: currentUserId,
        parentId: null,
        content,
        voiceNote: null
      }),
    onSuccess: () => {
      openCommentPanelPostIds.add(post.id);

      if (typeof onReactionChange === "function") {
        onReactionChange();
      }
    }
  });

  const commentsList = createElement("div", { className: "comments-list" });

  if (commentTree.length === 0) {
    const empty = createElement("p", {
      className: "comments-empty",
      text: "No comments yet. Start the conversation."
    });
    commentsList.appendChild(empty);
  } else {
    commentTree.forEach((commentNode) => {
      commentsList.appendChild(
        createCommentThread({
          postId: post.id,
          commentNode,
          currentUserId,
          onCommentChange: onReactionChange,
          depth: 0
        })
      );
    });
  }

  toggleBtn.addEventListener("click", () => {
    const nextOpen = panel.hidden;
    panel.hidden = !nextOpen;
    toggleBtn.classList.toggle("comment-toggle-btn-active", nextOpen);
    toggleBtn.textContent = nextOpen
      ? `Hide comments (${comments.length})`
      : `Comments (${comments.length})`;

    if (nextOpen) {
      openCommentPanelPostIds.add(post.id);
      form.querySelector("textarea")?.focus();
    } else {
      openCommentPanelPostIds.delete(post.id);
    }
  });

  header.append(heading, toggleBtn);
  panel.append(form, commentsList);
  section.append(header, panel);
  return section;
}

function createCommentThread({ postId, commentNode, currentUserId, onCommentChange, depth }) {
  const thread = createElement("div", { className: "comment-thread" });
  thread.style.setProperty("--comment-depth", String(depth));

  const commentAuthor = findUserById(commentNode.userId);
  const isOwner = commentNode.userId === currentUserId;

  const replyForm = createCommentForm({
    inputId: `reply-input-${commentNode.id}`,
    placeholder: `Reply to ${commentAuthor?.username || "this comment"}...`,
    helperText: "Replies stay attached to this comment.",
    submitText: "Reply",
    successMessage: "Reply added.",
    compact: true,
    onSubmitText: (content) =>
      addCommentToPost({
        postId,
        userId: currentUserId,
        parentId: commentNode.id,
        content,
        voiceNote: null
      }),
    onSuccess: () => {
      replyForm.hidden = true;

      if (typeof onCommentChange === "function") {
        onCommentChange();
      }
    }
  });

  replyForm.hidden = true;

  const editForm = createCommentForm({
    inputId: `edit-comment-input-${commentNode.id}`,
    placeholder: "Update your comment...",
    helperText: "Save when you are happy with your wording.",
    submitText: "Save",
    successMessage: "Comment updated.",
    compact: true,
    initialValue: commentNode.content,
    cancelText: "Cancel",
    onCancel: () => {
      editForm.hidden = true;
    },
    onSubmitText: (content) =>
      updateCommentInPost({
        postId,
        commentId: commentNode.id,
        userId: currentUserId,
        content
      }),
    onSuccess: () => {
      editForm.hidden = true;

      if (typeof onCommentChange === "function") {
        onCommentChange();
      }
    }
  });

  editForm.hidden = true;

  const commentCard = createCommentCard(commentNode, commentAuthor, {
    isReply: depth > 0,
    replyCount: commentNode.children.length,
    onReplyClick: () => {
      editForm.hidden = true;
      replyForm.hidden = !replyForm.hidden;

      if (!replyForm.hidden) {
        replyForm.querySelector("textarea")?.focus();
      }
    },
    onEditClick: isOwner
      ? () => {
          replyForm.hidden = true;
          editForm.hidden = !editForm.hidden;

          if (!editForm.hidden) {
            editForm.querySelector("textarea")?.focus();
          }
        }
      : null,
    onDeleteClick: isOwner
      ? () => {
          const replyCount = countDescendants(commentNode);

          showConfirmDialog({
            title: "Delete comment?",
            message:
              replyCount > 0
                ? "This comment and its replies will be permanently removed."
                : "This comment will be permanently removed.",
            confirmText: "Delete",
            cancelText: "Cancel",
            danger: true,
            onConfirm: () => {
              try {
                deleteCommentFromPost({
                  postId,
                  commentId: commentNode.id,
                  userId: currentUserId
                });

                showToast("Comment deleted.", "success");

                if (typeof onCommentChange === "function") {
                  onCommentChange();
                }
              } catch (error) {
                showToast(error.message || "Failed to delete comment.", "error");
              }
            }
          });
        }
      : null
  });

  thread.append(commentCard, editForm, replyForm);

  if (commentNode.children.length > 0) {
    const replies = createElement("div", { className: "comment-children" });

    commentNode.children.forEach((replyNode) => {
      replies.appendChild(
        createCommentThread({
          postId,
          commentNode: replyNode,
          currentUserId,
          onCommentChange,
          depth: depth + 1
        })
      );
    });

    thread.appendChild(replies);
  }

  return thread;
}

function createCommentForm({
  inputId,
  placeholder,
  helperText,
  submitText,
  successMessage,
  onSubmitText,
  onSuccess,
  compact = false,
  initialValue = "",
  cancelText = "",
  onCancel = null
}) {
  const form = createElement("form", {
    className: `comment-form${compact ? " comment-form-reply" : ""}`
  });

  const inputWrapper = createElement("div", { className: "field-group" });
  const textarea = document.createElement("textarea");

  textarea.className = `form-input comment-textarea${compact ? " comment-textarea-reply" : ""}`;
  textarea.placeholder = placeholder;
  textarea.required = true;
  textarea.maxLength = 500;
  textarea.id = inputId;
  textarea.value = initialValue;

  const helper = createElement("p", {
    className: "field-helper",
    text: helperText
  });

  const error = createFieldError(inputId);
  const actions = createElement("div", { className: "comment-form-actions" });

  if (cancelText && typeof onCancel === "function") {
    const cancelBtn = createElement("button", {
      className: "secondary-btn comment-cancel-btn",
      type: "button",
      text: cancelText
    });

    cancelBtn.addEventListener("click", onCancel);
    actions.appendChild(cancelBtn);
  }

  const submitBtn = createElement("button", {
    className: "primary-btn",
    type: "submit",
    text: submitText
  });

  actions.appendChild(submitBtn);
  inputWrapper.append(textarea, helper, error);
  form.append(inputWrapper, actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormErrors(form);

    try {
      if (typeof onSubmitText !== "function") {
        throw new Error("Comment form submit handler is missing.");
      }

      const safeContent = validatePostContent(textarea.value);
      onSubmitText(safeContent);
      textarea.value = "";
      showToast(successMessage, "success");

      if (typeof onSuccess === "function") {
        onSuccess();
      }
    } catch (errorObj) {
      setFieldError(inputId, errorObj.message || `Failed to add ${submitText.toLowerCase()}.`);
    }
  });

  return form;
}

function countDescendants(commentNode) {
  return commentNode.children.reduce(
    (total, childNode) => total + 1 + countDescendants(childNode),
    0
  );
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
