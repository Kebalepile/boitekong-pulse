import { createElement, setFieldError, clearFormErrors, createFieldError } from "../utils/dom.js";
import {
  setPostReaction,
  getUserReaction,
  setCommentReaction,
  getCommentUserReaction,
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

const POST_PREVIEW_LENGTH = 300;

const commentUiState = {
  openPanels: new Set(),
  openCommentForms: new Set(),
  openReplyForms: new Set(),
  openReplyLists: new Set(),
  openEditForms: new Set()
};

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
    text: formatPostMeta(post)
  });

  authorBlock.append(authorName, meta);
  header.appendChild(authorBlock);

  if (post.userId === currentUserId) {
    header.appendChild(createPostOwnerActions(post, currentUserId, onReactionChange));
  }

  const content = createPostContent(post);

  card.append(header, content);

  if (post.image) {
    card.appendChild(createPostImage(post.image));
  }

  const footer = createElement("div", { className: "post-card-footer" });
  const footerText = createElement("span", {
    className: "post-footer-text",
    text: `Posted by ${author?.username || "Unknown User"}`
  });

  footer.appendChild(footerText);

  card.append(
    footer,
    createReactionBar({
      reactions: post.reactions,
      activeReaction: getUserReaction(post, currentUserId),
      onReact: (reactionType) => {
        setPostReaction({
          postId: post.id,
          userId: currentUserId,
          reactionType
        });

        if (typeof onReactionChange === "function") {
          onReactionChange();
        }
      }
    }),
    createCommentsSection(post, currentUserId, onReactionChange)
  );

  return card;
}

function createPostOwnerActions(post, currentUserId, onReactionChange) {
  const ownerActions = createElement("div", { className: "owner-actions" });

  const editBtn = createElement("button", {
    className: "owner-action-btn",
    type: "button",
    text: "\u270E Edit"
  });

  const deleteBtn = createElement("button", {
    className: "owner-action-btn owner-action-danger",
    type: "button",
    text: "\u{1F5D1} Delete"
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
  return ownerActions;
}

function createPostImage(imageUrl) {
  const imageWrapper = createElement("div", { className: "post-image-wrapper" });
  const image = document.createElement("img");

  image.className = "post-image";
  image.src = imageUrl;
  image.alt = "Post image";
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";

  image.addEventListener("error", () => {
    imageWrapper.remove();
  });

  imageWrapper.appendChild(image);
  return imageWrapper;
}

function createReactionBar({ reactions, activeReaction, onReact, compact = false }) {
  const wrapper = createElement("div", {
    className: `reaction-bar${compact ? " reaction-bar-compact" : ""}`
  });
  const buttons = [
    { type: "like", emoji: "\u{1F44D}", label: "Like", count: reactions?.like?.length || 0 },
    { type: "meh", emoji: "\u{1F610}", label: "Meh", count: reactions?.meh?.length || 0 },
    { type: "dislike", emoji: "\u{1F44E}", label: "Dislike", count: reactions?.dislike?.length || 0 }
  ];

  buttons.forEach(({ type, emoji, label, count }) => {
    const button = createElement("button", {
      className: `reaction-btn${activeReaction === type ? " reaction-btn-active" : ""}`,
      type: "button",
      text: `${emoji} ${label} (${count})`
    });

    button.addEventListener("click", () => {
      if (typeof onReact === "function") {
        onReact(type);
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
  const panelIsOpen = commentUiState.openPanels.has(post.id);
  const commentFormIsOpen = commentUiState.openCommentForms.has(post.id);

  const header = createElement("div", { className: "comments-header" });
  const heading = createElement("h4", {
    className: "comments-title",
    text: "Conversation"
  });

  const toggleBtn = createElement("button", {
    className: `comment-toggle-btn${panelIsOpen ? " comment-toggle-btn-active" : ""}`,
    type: "button",
    text: getCommentsToggleLabel(panelIsOpen, comments.length)
  });

  const panel = createElement("div", { className: "comments-panel" });
  setToggleDisplay(panel, panelIsOpen);

  const composerActions = createElement("div", { className: "comments-composer-actions" });
  const composerToggleBtn = createElement("button", {
    className: "secondary-btn comments-composer-btn",
    type: "button",
    text: commentFormIsOpen ? "Hide comment box" : "Comment"
  });

  let topLevelForm;
  topLevelForm = createCommentForm({
    inputId: `comment-input-${post.id}`,
    placeholder: "Write a comment...",
    helperText: "Join the conversation on this post.",
    submitText: "Post comment",
    cancelText: "Cancel",
    onCancel: () => {
      commentUiState.openCommentForms.delete(post.id);
      resetCommentForm(topLevelForm);
      setToggleDisplay(topLevelForm, false);
      composerToggleBtn.textContent = "Comment";
    },
    onSubmit: (safeContent) =>
      addCommentToPost({
        postId: post.id,
        userId: currentUserId,
        parentId: null,
        content: safeContent,
        voiceNote: null
      }),
    onSuccess: () => {
      commentUiState.openPanels.add(post.id);
      commentUiState.openCommentForms.delete(post.id);

      if (typeof onReactionChange === "function") {
        onReactionChange();
      }
    }
  });
  setToggleDisplay(topLevelForm, commentFormIsOpen);
  composerActions.appendChild(composerToggleBtn);

  const commentsList = createElement("div", { className: "comments-list" });

  if (commentTree.length === 0) {
    commentsList.appendChild(
      createElement("p", {
        className: "comments-empty",
        text: "No comments yet. Start the conversation."
      })
    );
  } else {
    commentTree.forEach((commentNode) => {
      commentsList.appendChild(
        createCommentNode({
          postId: post.id,
          node: commentNode,
          currentUserId,
          onCommentChange: onReactionChange,
          depth: 0
        })
      );
    });
  }

  toggleBtn.addEventListener("click", () => {
    const nextOpen = panel.style.display === "none";

    setToggleDisplay(panel, nextOpen);
    toggleBtn.classList.toggle("comment-toggle-btn-active", nextOpen);
    toggleBtn.textContent = getCommentsToggleLabel(nextOpen, comments.length);

    if (nextOpen) {
      commentUiState.openPanels.add(post.id);
    } else {
      commentUiState.openPanels.delete(post.id);
      commentUiState.openCommentForms.delete(post.id);
      resetCommentForm(topLevelForm);
      setToggleDisplay(topLevelForm, false);
      composerToggleBtn.textContent = "Comment";
    }
  });

  composerToggleBtn.addEventListener("click", () => {
    const nextOpen = topLevelForm.style.display === "none";

    setToggleDisplay(topLevelForm, nextOpen);
    composerToggleBtn.textContent = nextOpen ? "Hide comment box" : "Comment";

    if (nextOpen) {
      commentUiState.openCommentForms.add(post.id);
      focusCommentForm(topLevelForm);
    } else {
      commentUiState.openCommentForms.delete(post.id);
      resetCommentForm(topLevelForm);
    }
  });

  header.append(heading, toggleBtn);
  panel.append(composerActions, topLevelForm, commentsList);
  section.append(header, panel);

  return section;
}

function createCommentNode({ postId, node, currentUserId, onCommentChange, depth }) {
  const thread = createElement("div", { className: "comment-thread" });
  thread.style.setProperty("--comment-depth", String(depth));

  const author = findUserById(node.userId);
  const isOwner = node.userId === currentUserId;
  const replyFormIsOpen = commentUiState.openReplyForms.has(node.id);
  const repliesListIsOpen = commentUiState.openReplyLists.has(node.id);
  const editFormIsOpen = commentUiState.openEditForms.has(node.id);

  let replyForm;
  replyForm = createCommentForm({
    inputId: `reply-input-${node.id}`,
    placeholder: `Reply to ${author?.username || "this comment"}...`,
    helperText: "Your reply will be saved under this comment.",
    submitText: "Post reply",
    compact: true,
    cancelText: "Cancel",
    onCancel: () => {
      commentUiState.openReplyForms.delete(node.id);
      resetCommentForm(replyForm);
      setToggleDisplay(replyForm, false);
    },
    onSubmit: (safeContent) =>
      addCommentToPost({
        postId,
        userId: currentUserId,
        parentId: node.id,
        content: safeContent,
        voiceNote: null
      }),
    onSuccess: () => {
      commentUiState.openReplyForms.delete(node.id);
      commentUiState.openReplyLists.delete(node.id);

      if (typeof onCommentChange === "function") {
        onCommentChange();
      }
    }
  });
  setToggleDisplay(replyForm, replyFormIsOpen);

  const editForm = createCommentForm({
    inputId: `edit-comment-input-${node.id}`,
    placeholder: "Update your comment...",
    helperText: "Save when you are happy with your wording.",
    submitText: "Save",
    compact: true,
    initialValue: node.content,
    cancelText: "Cancel",
    onCancel: () => {
      commentUiState.openEditForms.delete(node.id);
      setToggleDisplay(editForm, false);
    },
    onSubmit: (safeContent) =>
      updateCommentInPost({
        postId,
        commentId: node.id,
        userId: currentUserId,
        content: safeContent
      }),
    onSuccess: () => {
      commentUiState.openEditForms.delete(node.id);

      if (typeof onCommentChange === "function") {
        onCommentChange();
      }
    }
  });
  setToggleDisplay(editForm, editFormIsOpen);

  const repliesList = createElement("div", { className: "comment-children" });
  setToggleDisplay(repliesList, repliesListIsOpen);

  if (node.children.length > 0) {
    node.children.forEach((childNode) => {
      repliesList.appendChild(
        createCommentNode({
          postId,
          node: childNode,
          currentUserId,
          onCommentChange,
          depth: depth + 1
        })
      );
    });
  }

  const reactionBar = createReactionBar({
    reactions: node.reactions,
    activeReaction: getCommentUserReaction(node, currentUserId),
    compact: true,
    onReact: (reactionType) => {
      setCommentReaction({
        postId,
        commentId: node.id,
        userId: currentUserId,
        reactionType
      });

      if (typeof onCommentChange === "function") {
        onCommentChange();
      }
    }
  });

  const commentCard = createCommentCard(node, author, {
    isReply: depth > 0,
    repliesCount: node.children.length,
    repliesExpanded: repliesListIsOpen,
    reactionBar,
    onReply: () => {
      commentUiState.openEditForms.delete(node.id);
      setToggleDisplay(editForm, false);

      const nextOpen = replyForm.style.display === "none";
      setToggleDisplay(replyForm, nextOpen);

      if (nextOpen) {
        commentUiState.openReplyForms.add(node.id);
        focusCommentForm(replyForm);
      } else {
        commentUiState.openReplyForms.delete(node.id);
        resetCommentForm(replyForm);
      }
    },
    onToggleReplies:
      node.children.length > 0
        ? () => {
            const nextOpen = repliesList.style.display === "none";
            setToggleDisplay(repliesList, nextOpen);

            if (nextOpen) {
              commentUiState.openReplyLists.add(node.id);
            } else {
              commentUiState.openReplyLists.delete(node.id);
            }
          }
        : null,
    onEdit: isOwner
      ? () => {
          commentUiState.openReplyForms.delete(node.id);
          setToggleDisplay(replyForm, false);

          const nextOpen = editForm.style.display === "none";
          setToggleDisplay(editForm, nextOpen);

          if (nextOpen) {
            commentUiState.openEditForms.add(node.id);
          } else {
            commentUiState.openEditForms.delete(node.id);
          }
        }
      : null,
    onDelete: isOwner
      ? () => {
          const descendantCount = countDescendants(node);

          showConfirmDialog({
            title: "Delete comment?",
            message:
              descendantCount > 0
                ? "This comment and all nested replies will be permanently removed."
                : "This comment will be permanently removed.",
            confirmText: "Delete",
            cancelText: "Cancel",
            danger: true,
            onConfirm: () => {
              try {
                deleteCommentFromPost({
                  postId,
                  commentId: node.id,
                  userId: currentUserId
                });
                clearCommentUiState(node);

                if (typeof onCommentChange === "function") {
                  onCommentChange();
                }
              } catch (error) {
                console.error(error);
              }
            }
          });
        }
      : null
  });

  thread.append(commentCard, editForm, replyForm);

  if (node.children.length > 0) {
    thread.appendChild(repliesList);
  }

  return thread;
}

function createCommentForm({
  inputId,
  placeholder,
  helperText,
  submitText,
  onSubmit,
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
  textarea.maxLength = 1000;
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
      if (typeof onSubmit !== "function") {
        throw new Error("Comment form submit handler is missing.");
      }

      const safeContent = validatePostContent(textarea.value);
      onSubmit(safeContent);

      if (typeof onSuccess === "function") {
        onSuccess();
      }
    } catch (error) {
      setFieldError(inputId, error.message || "Failed to save comment.");
    }
  });

  return form;
}

function clearCommentUiState(node) {
  commentUiState.openReplyForms.delete(node.id);
  commentUiState.openReplyLists.delete(node.id);
  commentUiState.openEditForms.delete(node.id);

  node.children.forEach((childNode) => {
    clearCommentUiState(childNode);
  });
}

function setToggleDisplay(element, isVisible) {
  element.style.display = isVisible ? "" : "none";
}

function resetCommentForm(form, initialValue = "") {
  const textarea = form?.querySelector("textarea");

  if (textarea) {
    textarea.value = initialValue;
  }

  if (form) {
    clearFormErrors(form);
  }
}

function focusCommentForm(form) {
  form?.querySelector("textarea")?.focus();
}

function createPostContent(post) {
  const wrapper = createElement("div", { className: "post-content-block" });
  const content = createElement("p", { className: "post-content" });
  const fullText = post.content || "";
  const isLongPost = fullText.length > POST_PREVIEW_LENGTH;
  let expanded = false;

  const renderContent = () => {
    if (!isLongPost || expanded) {
      content.textContent = fullText;
      return;
    }

    content.textContent = `${fullText.slice(0, POST_PREVIEW_LENGTH).trimEnd()}...`;
  };

  renderContent();
  wrapper.appendChild(content);

  if (!isLongPost) {
    return wrapper;
  }

  const toggleBtn = createElement("button", {
    className: "link-btn post-content-toggle-btn",
    type: "button",
    text: "Read more"
  });

  toggleBtn.addEventListener("click", () => {
    expanded = !expanded;
    renderContent();
    toggleBtn.textContent = expanded ? "Show less" : "Read more";
  });

  wrapper.appendChild(toggleBtn);
  return wrapper;
}

function getCommentsToggleLabel(isOpen, count) {
  return isOpen
    ? `\u{1F4AC} Hide comments (${count})`
    : `\u{1F4AC} Comments (${count})`;
}

function countDescendants(node) {
  return node.children.reduce((total, childNode) => {
    return total + 1 + countDescendants(childNode);
  }, 0);
}

function formatPostMeta(post) {
  const baseMeta = `${post.location.township} ${post.location.extension} | ${formatTimestamp(post.createdAt)}`;
  return post.updatedAt ? `${baseMeta} | Edited` : baseMeta;
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
