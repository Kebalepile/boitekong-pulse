import { createElement, setFieldError, clearFormErrors, createFieldError } from "../utils/dom.js";
import {
  setPostReaction,
  getUserReaction,
  setCommentReaction,
  getCommentUserReaction,
  deletePost,
  addCommentToPost,
  getPostById,
  getCommentsForPost,
  updateCommentInPost,
  deleteCommentFromPost
} from "../services/postService.js";
import { navigate } from "../router.js";
import { showToast } from "./toast.js";
import { showConfirmDialog } from "./confirmDialog.js";
import { showActionSheet } from "./actionSheet.js";
import { showUserPreviewSheet } from "./userPreviewSheet.js";
import { createCommentCard } from "./commentCard.js";
import { findUserById } from "../services/userService.js";
import { buildCommentTree } from "../utils/commentTree.js";
import { validateCommentSubmission } from "../utils/validators.js";
import {
  getVoiceNoteFeatureStatus,
  startVoiceNoteRecording,
  formatVoiceNoteDuration,
  MAX_VOICE_NOTE_DURATION_MS,
  configureVoiceNoteAudio,
  getNextVoiceNotePlaybackRate,
  formatVoiceNotePlaybackRate
} from "../utils/voiceNotes.js";
import {
  createVoiceNoteVisualizer,
  attachVoiceNoteScrubber
} from "../utils/voiceNoteVisualizer.js";
import { setVoiceNoteControlIcon } from "../utils/voiceNoteIcons.js";
import { createAvatarElement } from "../utils/avatar.js";

const POST_PREVIEW_LENGTH = 300;
const voiceNoteFeatureStatus = getVoiceNoteFeatureStatus();
const voiceNoteChoiceText = voiceNoteFeatureStatus.supported ? "" : voiceNoteFeatureStatus.message;

const commentUiState = {
  openPanels: new Set(),
  openCommentForms: new Set(),
  openReplyForms: new Set(),
  openReplyLists: new Set(),
  openEditForms: new Set(),
  sortOrders: new Map(),
  panelEntries: new Map()
};

export function createPostCard(post, author, currentUserId, onReactionChange) {
  let card = createElement("article", { className: "post-card" });
  card.dataset.postId = post.id;

  const refreshCurrentPostCard = ({ focusCommentId = null } = {}) => {
    const latestPost = getPostById(post.id);

    if (!latestPost) {
      if (typeof onReactionChange === "function") {
        onReactionChange();
      }
      return;
    }

    const latestAuthor = findUserById(latestPost.userId) || author;
    const nextCard = createPostCard(latestPost, latestAuthor, currentUserId, onReactionChange);

    card.replaceWith(nextCard);
    card = nextCard;

    if (focusCommentId) {
      window.requestAnimationFrame(() => {
        focusCommentById(latestPost.id, focusCommentId);
      });
    }
  };

  const header = createElement("div", { className: "post-card-header" });
  const authorInfo = createElement("div", { className: "post-author-row" });
  const authorAvatarElement = createAvatarElement(author, {
    size: "md",
    className: "post-author-avatar",
    decorative: true
  });
  const authorBlock = createElement("div", { className: "post-author-block" });
  const authorNameElement = createElement("span", {
    className: "post-author",
    text: author?.username || "Unknown User"
  });

  const meta = createElement("p", {
    className: "post-meta",
    text: formatPostMeta(post)
  });
  const contextRow = createElement("div", { className: "post-context-row" });
  const storedComments = Array.isArray(post.comments) ? post.comments : [];
  const voiceNoteCount = storedComments.filter((comment) => comment.voiceNote?.dataUrl).length;

  const openAuthorProfile =
    author?.id
      ? () => {
          showUserPreviewSheet({
            userId: author.id,
            currentUserId
          });
        }
      : null;
  const authorAvatar =
    typeof openAuthorProfile === "function"
      ? createProfileTriggerButton({
          className: "user-preview-trigger user-preview-trigger-avatar",
          label: `Open ${author?.username || "user"} profile`,
          onClick: openAuthorProfile,
          child: authorAvatarElement
        })
      : authorAvatarElement;
  const authorName =
    typeof openAuthorProfile === "function"
      ? createProfileTriggerButton({
          className: "user-preview-trigger user-preview-trigger-text post-author-btn",
          label: `Open ${author?.username || "user"} profile`,
          onClick: openAuthorProfile,
          child: authorNameElement
        })
      : authorNameElement;

  authorBlock.append(authorName, meta);
  authorInfo.append(authorAvatar, authorBlock);
  header.appendChild(authorInfo);

  header.appendChild(createPostMenuButton(post, author, currentUserId, onReactionChange));

  if (storedComments.length > 0) {
    contextRow.appendChild(
      createPostContextPill(
        "post-context-pill-activity",
        `${storedComments.length} ${storedComments.length === 1 ? "comment" : "comments"}`
      )
    );
  }

  if (voiceNoteCount > 0) {
    contextRow.appendChild(
      createPostContextPill(
        "post-context-pill-voice",
        `${voiceNoteCount} voice ${voiceNoteCount === 1 ? "note" : "notes"}`
      )
    );
  }

  const content = createPostContent(post);

  card.append(header);

  if (contextRow.childElementCount > 0) {
    card.appendChild(contextRow);
  }

  card.appendChild(content);

  if (post.image) {
    card.appendChild(createPostImage(post.image));
  }

  const footer = createElement("div", { className: "post-card-footer" });
  const footerText = createElement("span", {
    className: "post-footer-text",
    text: `Posted by ${author?.username || "Unknown User"}`
  });

  footer.appendChild(footerText);

  let postReactionBar = null;

  const handlePostReaction = (reactionType) => {
    const updatedPost = setPostReaction({
      postId: post.id,
      userId: currentUserId,
      reactionType
    });

    post.reactions = updatedPost.reactions;

    const nextReactionBar = buildPostReactionBar();
    postReactionBar.replaceWith(nextReactionBar);
    postReactionBar = nextReactionBar;
  };

  function buildPostReactionBar() {
    return createReactionBar({
      reactions: post.reactions,
      activeReaction: getUserReaction(post, currentUserId),
      iconOnlyReactions: ["like", "dislike"],
      onReact: handlePostReaction
    });
  }

  postReactionBar = buildPostReactionBar();

  card.append(
    footer,
    postReactionBar,
    createCommentsSection(post, currentUserId, refreshCurrentPostCard)
  );

  return card;
}

function createPostMenuButton(post, author, currentUserId, onReactionChange) {
  const isOwner = post.userId === currentUserId;
  const menuBtn = createElement("button", {
    className: "post-menu-btn",
    type: "button",
    attributes: {
      "aria-label": "Post options",
      title: "Post options"
    }
  });

  menuBtn.appendChild(createMoreIcon());
  menuBtn.addEventListener("click", () => {
    showActionSheet({
      title: "Post",
      actions: [
        {
          label: "Share",
          onSelect: () => sharePostEntry(post, author)
        },
        {
          label: "Report",
          onSelect: () => {
            showToast("Report flow coming soon.", "success");
          }
        },
        ...(isOwner
          ? [
              {
                label: "Edit",
                onSelect: () => {
                  navigate("edit-post", { postId: post.id });
                }
              },
              {
                label: "Delete",
                danger: true,
                onSelect: () => {
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
                }
              }
            ]
          : [])
      ]
    });
  });

  return menuBtn;
}

function createMoreIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("post-menu-icon");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute(
    "d",
    "M12 7a1.75 1.75 0 1 0 0-3.5A1.75 1.75 0 0 0 12 7Zm0 7a1.75 1.75 0 1 0 0-3.5A1.75 1.75 0 0 0 12 14Zm0 7a1.75 1.75 0 1 0 0-3.5A1.75 1.75 0 0 0 12 21Z"
  );
  svg.appendChild(path);

  return svg;
}

async function sharePostEntry(post, author) {
  const authorName = author?.username || "Unknown User";
  const shareText = `${authorName}: ${post.content}`;

  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({
        title: "Post",
        text: shareText
      });
      return;
    }

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareText);
      showToast("Post copied to clipboard.", "success");
      return;
    }

    throw new Error("Sharing is not available on this device.");
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }

    showToast(error.message || "Could not share post.", "error");
  }
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

function createPostContextPill(className, text) {
  return createElement("span", {
    className: `post-context-pill ${className}`,
    text
  });
}

function createReactionBar({
  reactions,
  activeReaction,
  onReact,
  compact = false,
  iconOnly = false,
  iconOnlyReactions = [],
  allowedReactions = ["like", "dislike"]
}) {
  const wrapper = createElement("div", {
    className: `reaction-bar${compact ? " reaction-bar-compact" : ""}`
  });
  const buttons = [
    { type: "like", emoji: "\u{1F44D}", label: "Like", count: reactions?.like?.length || 0 },
    { type: "dislike", emoji: "\u{1F44E}", label: "Dislike", count: reactions?.dislike?.length || 0 }
  ].filter(({ type }) => allowedReactions.includes(type));

  buttons.forEach(({ type, emoji, label, count }) => {
    const useIconOnly = iconOnly || iconOnlyReactions.includes(type);
    const button = createElement("button", {
      className: `reaction-btn reaction-btn-${type}${activeReaction === type ? " reaction-btn-active" : ""}${useIconOnly ? " reaction-btn-icon-only" : ""}`,
      type: "button",
      attributes: {
        "aria-label": label,
        title: label
      }
    });

    if (useIconOnly) {
      button.appendChild(createReactionIcon(type));

      if (count > 0) {
        button.appendChild(
          createElement("span", {
            className: "reaction-btn-count",
            text: String(count)
          })
        );
      }
    } else {
      button.textContent = `${emoji} ${label} (${count})`;
    }

    button.addEventListener("click", () => {
      if (typeof onReact === "function") {
        onReact(type);
      }
    });

    wrapper.appendChild(button);
  });

  return wrapper;
}

function createReactionIcon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("reaction-icon");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute("d", getReactionIconPath(name));
  svg.appendChild(path);

  return svg;
}

function createProfileTriggerButton({ className, label, onClick, child }) {
  const button = createElement("button", {
    className,
    type: "button",
    attributes: {
      "aria-label": label,
      title: label
    }
  });

  button.appendChild(child);
  button.addEventListener("click", onClick);
  return button;
}

function getReactionIconPath(name) {
  const iconPaths = {
    like:
      "M2 21h4V9H2v12Zm20-11.9c0-1.16-.95-2.1-2.12-2.1h-6.7l1.01-4.86.03-.32a1.7 1.7 0 0 0-.5-1.2L12.6 0 5.98 6.58A2 2 0 0 0 5.4 8v11c0 1.1.9 2 2 2h9.55c.82 0 1.56-.5 1.87-1.26l3.03-7.05c.1-.24.15-.49.15-.75V9.1Z",
    dislike:
      "M22 3h-4v12h4V3ZM2 14.9C2 16.06 2.95 17 4.12 17h6.7l-1.01 4.86-.03.32c0 .45.18.88.5 1.2L11.4 24l6.62-6.58c.38-.37.58-.88.58-1.42V5c0-1.1-.9-2-2-2H7.05c-.82 0-1.56.5-1.87 1.26L2.15 11.3c-.1.24-.15.49-.15.75v2.85Z"
  };

  return iconPaths[name] || iconPaths.like;
}

function createCommentsSection(post, currentUserId, onPostChange) {
  const section = createElement("section", { className: "comments-section" });
  const comments = getCommentsForPost(post.id);
  const sortOrder = commentUiState.sortOrders.get(post.id) || "newest";
  const commentTree = buildCommentTree(comments, sortOrder);
  const panelIsOpen = commentUiState.openPanels.has(post.id);
  const commentFormIsOpen = commentUiState.openCommentForms.has(post.id);

  const header = createElement("div", { className: "comments-header" });

  const toggleBtn = createElement("button", {
    className: `comment-toggle-btn${panelIsOpen ? " comment-toggle-btn-active" : ""}`,
    type: "button",
    text: getCommentsToggleLabel(panelIsOpen, comments.length)
  });

  const controls = createElement("div", { className: "comments-header-controls" });
  controls.appendChild(toggleBtn);

  if (comments.length > 0) {
    const sortLabel = createElement("label", {
      className: "comments-sort-label",
      text: "Sort"
    });
    const sortSelect = createElement("select", {
      className: "form-input comments-sort-select",
      attributes: {
        "aria-label": `Sort comments for post ${post.id}`
      }
    });

    [
      { value: "newest", label: "Newest first" },
      { value: "oldest", label: "Oldest first" }
    ].forEach(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = sortOrder === value;
      sortSelect.appendChild(option);
    });

    sortSelect.addEventListener("change", () => {
      commentUiState.sortOrders.set(post.id, sortSelect.value);

      if (typeof onPostChange === "function") {
        onPostChange();
      }
    });

    sortLabel.appendChild(sortSelect);
    controls.appendChild(sortLabel);
  }

  const panel = createElement("div", {
    className: "comments-panel",
    attributes: {
      tabindex: "-1",
      "aria-label": "Comments panel"
    }
  });
  panel.classList.toggle("comments-panel-empty", commentTree.length === 0);
  setToggleDisplay(panel, panelIsOpen);

  const composerActions = createElement("div", { className: "comments-composer-actions" });
  const composerToggleBtn = createElement("button", {
    className: "secondary-btn comments-composer-btn",
    type: "button",
    text: commentFormIsOpen ? "Hide comment box" : "Add comment"
  });

  let topLevelForm;
  topLevelForm = createCommentForm({
    inputId: `comment-input-${post.id}`,
    placeholder: "Write a comment...",
    helperText: "Join the conversation on this post.",
    noteText: voiceNoteChoiceText,
    submitText: "Post comment",
    allowVoiceNote: true,
    cancelText: "Cancel",
    onCancel: () => {
      commentUiState.openCommentForms.delete(post.id);
      resetCommentForm(topLevelForm);
      setToggleDisplay(topLevelForm, false);
      composerToggleBtn.textContent = "Add comment";
    },
    onSubmit: ({ content, voiceNote }) =>
      addCommentToPost({
        postId: post.id,
        userId: currentUserId,
        parentId: null,
        content,
        voiceNote
      }),
    onSuccess: () => {
      commentUiState.openPanels.add(post.id);
      commentUiState.openCommentForms.delete(post.id);

      if (typeof onPostChange === "function") {
        onPostChange();
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
          onCommentChange: onPostChange,
          depth: 0
        })
      );
    });
  }

  toggleBtn.addEventListener("click", () => {
    const nextOpen = panel.style.display === "none";

    if (nextOpen) {
      closeOtherCommentsPanels(post.id);
      setToggleDisplay(panel, true);
      toggleBtn.classList.add("comment-toggle-btn-active");
      toggleBtn.textContent = getCommentsToggleLabel(true, comments.length);
      commentUiState.openPanels.clear();
      commentUiState.openPanels.add(post.id);
      focusCommentsPanel(panel);
    } else {
      closeCommentsPanel(post.id);
    }
  });

  composerToggleBtn.addEventListener("click", () => {
    const nextOpen = topLevelForm.style.display === "none";

    setToggleDisplay(topLevelForm, nextOpen);
    composerToggleBtn.textContent = nextOpen ? "Hide comment box" : "Add comment";

    if (nextOpen) {
      commentUiState.openCommentForms.add(post.id);
      focusCommentForm(topLevelForm);
    } else {
      commentUiState.openCommentForms.delete(post.id);
      resetCommentForm(topLevelForm);
    }
  });

  commentUiState.panelEntries.set(post.id, {
    panel,
    toggleBtn,
    topLevelForm,
    composerToggleBtn,
    getCommentsCount: () => getCommentsForPost(post.id).length
  });

  header.appendChild(controls);
  panel.append(composerActions, topLevelForm, commentsList);
  section.append(header, panel);

  return section;
}

function createCommentNode({
  postId,
  node,
  currentUserId,
  onCommentChange,
  depth,
  parentAuthorName = ""
}) {
  const threadLevelClass =
    depth === 0
      ? " comment-thread-root"
      : depth === 1
        ? " comment-thread-reply-lane"
        : " comment-thread-flat-reply";
  const thread = createElement("div", {
    className: `comment-thread${threadLevelClass}`
  });
  thread.style.setProperty("--comment-depth", String(depth > 0 ? 1 : 0));
  thread.dataset.commentId = node.id;

  const author = findUserById(node.userId);
  const isOwner = node.userId === currentUserId;
  const isVoiceNoteOnly = Boolean(node.voiceNote?.dataUrl);
  const canEditComment = isOwner && !isVoiceNoteOnly;
  const replyFormIsOpen = commentUiState.openReplyForms.has(node.id);
  const repliesListIsOpen = commentUiState.openReplyLists.has(node.id);
  const editFormIsOpen = commentUiState.openEditForms.has(node.id);

  let replyForm;
  replyForm = createCommentForm({
    inputId: `reply-input-${node.id}`,
    placeholder: `Reply to ${author?.username || "this comment"}...`,
    helperText: "Your reply will be saved under this comment.",
    noteText: voiceNoteChoiceText,
    submitText: "Post reply",
    compact: true,
    allowVoiceNote: true,
    cancelText: "Cancel",
    onCancel: () => {
      commentUiState.openReplyForms.delete(node.id);
      resetCommentForm(replyForm);
      setToggleDisplay(replyForm, false);
    },
    onSubmit: ({ content, voiceNote }) =>
      addCommentToPost({
        postId,
        userId: currentUserId,
        parentId: node.id,
        content,
        voiceNote
      }),
    onSuccess: () => {
      commentUiState.openReplyForms.delete(node.id);
      commentUiState.openReplyLists.add(node.id);

      if (typeof onCommentChange === "function") {
        const latestComments = getCommentsForPost(postId);
        const latestReply = findLatestReplyForParent(latestComments, node.id, currentUserId);
        onCommentChange({
          focusCommentId: latestReply?.id || null
        });
      }
    }
  });
  setToggleDisplay(replyForm, replyFormIsOpen);

  let editForm = null;

  if (canEditComment) {
    editForm = createCommentForm({
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
      onSubmit: ({ content }) =>
        updateCommentInPost({
          postId,
          commentId: node.id,
          userId: currentUserId,
          content
        }),
      onSuccess: () => {
        commentUiState.openEditForms.delete(node.id);

        if (typeof onCommentChange === "function") {
          onCommentChange();
        }
      }
    });
    setToggleDisplay(editForm, editFormIsOpen);
  }

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
          depth: depth + 1,
          parentAuthorName: author?.username || ""
        })
      );
    });
  }

  let reactionBar = null;

  const handleCommentReaction = (reactionType) => {
    const updatedComment = setCommentReaction({
      postId,
      commentId: node.id,
      userId: currentUserId,
      reactionType
    });

    node.reactions = updatedComment.reactions;

    const nextReactionBar = buildCommentReactionBar();
    reactionBar.replaceWith(nextReactionBar);
    reactionBar = nextReactionBar;
  };

  function buildCommentReactionBar() {
    return createReactionBar({
      reactions: node.reactions,
      activeReaction: getCommentUserReaction(node, currentUserId),
      compact: true,
      iconOnly: true,
      allowedReactions: ["like", "dislike"],
      onReact: handleCommentReaction
    });
  }

  reactionBar = buildCommentReactionBar();

  const commentCard = createCommentCard(node, author, {
    isReply: depth > 0,
    replyingTo: depth > 0 ? parentAuthorName : "",
    repliesCount: node.children.length,
    repliesExpanded: repliesListIsOpen,
    reactionBar,
    onOpenProfile:
      author?.id
        ? () => {
            showUserPreviewSheet({
              userId: author.id,
              currentUserId
            });
          }
        : null,
    onReply: () => {
      commentUiState.openEditForms.delete(node.id);
      if (editForm) {
        setToggleDisplay(editForm, false);
      }

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
    onOpenMenu: () =>
      openCommentActionSheet({
        comment: node,
        author,
        isOwner,
        canEditComment,
        onEdit:
          canEditComment && editForm
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
      })
  });

  thread.append(commentCard);

  if (editForm) {
    thread.appendChild(editForm);
  }

  thread.appendChild(replyForm);

  if (node.children.length > 0) {
    thread.appendChild(repliesList);
  }

  return thread;
}

function createCommentForm({
  inputId,
  placeholder,
  helperText,
  noteText = "",
  submitText,
  onSubmit,
  onSuccess,
  compact = false,
  allowVoiceNote = false,
  initialValue = "",
  cancelText = "",
  onCancel = null
}) {
  const form = createElement("form", {
    className: `comment-form${compact ? " comment-form-reply" : ""}`
  });

  const inputWrapper = createElement("div", { className: "field-group" });
  const hasVoiceMode = allowVoiceNote && voiceNoteFeatureStatus.supported;
  let submissionMode = "text";
  let submitBtn = null;
  const textarea = document.createElement("textarea");
  textarea.className = `form-input comment-textarea${compact ? " comment-textarea-reply" : ""}`;
  textarea.placeholder = placeholder;
  textarea.required = true;
  textarea.maxLength = 1000;
  textarea.id = inputId;
  textarea.value = initialValue;
  const textModeFields = createElement("div", { className: "comment-input-mode-panel" });
  const textMetaRow = createElement("div", { className: "comment-form-meta-row" });
  const charCounter = createElement("span", {
    className: "char-counter",
    text: `0 / ${textarea.maxLength}`
  });

  const helper = createElement("p", {
    className: "field-helper",
    text: helperText
  });
  const note = noteText
    ? createElement("p", {
        className: "comment-form-note",
        text: noteText
      })
    : null;

  const error = createFieldError(inputId);
  const actions = createElement("div", { className: "comment-form-actions" });
  let modeSwitch = null;
  let textModeBtn = null;
  let voiceModeBtn = null;
  let voiceNoteComposer = null;
  let voiceNoteDraft = null;
  let voiceNoteRecorder = null;
  let recordingTimerId = null;
  let recordingStartedAt = 0;

  const clearRecordingTimer = () => {
    if (recordingTimerId) {
      window.clearInterval(recordingTimerId);
      recordingTimerId = null;
    }
  };

  let voiceNoteShell = null;
  let voiceNoteTimer = null;
  let voiceNoteAudio = null;
  let voiceNotePrimaryBtn = null;
  let voiceNoteSpeedBtn = null;
  let voiceNoteMeter = null;
  let voiceNoteWaveform = null;
  let voiceNoteProgressLine = null;
  let voiceNoteStateDot = null;
  let voiceNoteVisualizer = null;
  let voiceNoteLiveSession = null;
  let resumeVoicePreviewAfterSeek = false;
  let voiceNotePlaybackRate = 1;
  let previewProgressAnimationFrameId = null;

  const updateVoiceNoteComposer = () => {
    if (!voiceNoteTimer || !voiceNotePrimaryBtn || !voiceNoteMeter) {
      return;
    }

    const isRecording = Boolean(voiceNoteRecorder);
    const hasVoiceNote = Boolean(voiceNoteDraft?.dataUrl);
    const isPreviewPlaying = Boolean(
      voiceNoteAudio && !voiceNoteAudio.paused && !voiceNoteAudio.ended
    );
    const maxDurationLabel = formatVoiceNoteDuration(MAX_VOICE_NOTE_DURATION_MS);

    voiceNotePrimaryBtn.disabled = submissionMode !== "voice";

    if (submitBtn) {
      submitBtn.disabled = isRecording;
    }

    if (voiceNoteAudio) {
      configureVoiceNoteAudio(voiceNoteAudio, hasVoiceNote ? voiceNoteDraft.dataUrl : "");
      voiceNoteAudio.playbackRate = voiceNotePlaybackRate;
    }

    if (voiceNoteMeter) {
      voiceNoteMeter.classList.toggle("voice-note-bubble-recording", isRecording);
      voiceNoteMeter.classList.toggle("voice-note-bubble-playing", isPreviewPlaying);
    }

    if (voiceNoteStateDot) {
      voiceNoteStateDot.classList.toggle("voice-note-state-dot-active", isRecording);
      setToggleDisplay(voiceNoteStateDot, isRecording);
    }

    if (voiceNoteSpeedBtn) {
      voiceNoteSpeedBtn.textContent = formatVoiceNotePlaybackRate(voiceNotePlaybackRate);
      voiceNoteSpeedBtn.disabled = submissionMode !== "voice" || isRecording || !hasVoiceNote;
      setToggleDisplay(voiceNoteSpeedBtn, submissionMode === "voice" && hasVoiceNote);
    }

    voiceNotePrimaryBtn.classList.toggle("voice-note-main-btn-recording", isRecording);
    voiceNotePrimaryBtn.classList.toggle(
      "voice-note-main-btn-playback",
      hasVoiceNote && !isRecording
    );
    voiceNotePrimaryBtn.classList.toggle(
      "voice-note-main-btn-ready",
      !hasVoiceNote && !isRecording
    );

    const primaryConfig = isRecording
      ? {
          icon: "stop",
          label: "Stop recording voice note"
        }
      : hasVoiceNote
        ? isPreviewPlaying
          ? {
              icon: "pause",
              label: "Pause voice note preview"
            }
          : {
              icon: "play",
              label: "Play voice note preview"
            }
        : {
            icon: "mic",
            label: "Record voice note"
          };

    setVoiceNoteControlIcon(voiceNotePrimaryBtn, primaryConfig.icon);
    voiceNotePrimaryBtn.setAttribute("aria-label", primaryConfig.label);
    voiceNotePrimaryBtn.title = primaryConfig.label;

    if (submissionMode !== "voice") {
      voiceNoteTimer.textContent = `0:00 / ${maxDurationLabel}`;
      return;
    }

    if (isRecording) {
      const elapsedMs = Math.min(Date.now() - recordingStartedAt, MAX_VOICE_NOTE_DURATION_MS);
      voiceNoteTimer.textContent = `${formatVoiceNoteDuration(elapsedMs)} / ${maxDurationLabel}`;
      return;
    }

    if (hasVoiceNote) {
      const currentPreviewMs = Math.max(0, (voiceNoteAudio?.currentTime || 0) * 1000);
      voiceNoteTimer.textContent =
        `${formatVoiceNoteDuration(currentPreviewMs)} / ${formatVoiceNoteDuration(voiceNoteDraft.durationMs)}`;
      return;
    }

    voiceNoteTimer.textContent = `0:00 / ${maxDurationLabel}`;
  };

  const resetVoiceNotePlaybackRate = () => {
    voiceNotePlaybackRate = 1;

    if (voiceNoteAudio) {
      voiceNoteAudio.playbackRate = voiceNotePlaybackRate;
    }

    if (voiceNoteSpeedBtn) {
      voiceNoteSpeedBtn.textContent = formatVoiceNotePlaybackRate(voiceNotePlaybackRate);
    }
  };

  const stopPreviewProgressAnimation = () => {
    if (previewProgressAnimationFrameId) {
      window.cancelAnimationFrame(previewProgressAnimationFrameId);
      previewProgressAnimationFrameId = null;
    }
  };

  const startPreviewProgressAnimation = () => {
    if (previewProgressAnimationFrameId) {
      return;
    }

    const tick = () => {
      syncVoiceNotePreview();

      if (voiceNoteAudio && !voiceNoteAudio.paused && !voiceNoteAudio.ended) {
        previewProgressAnimationFrameId = window.requestAnimationFrame(tick);
        return;
      }

      previewProgressAnimationFrameId = null;
    };

    previewProgressAnimationFrameId = window.requestAnimationFrame(tick);
  };

  const syncVoiceNotePreview = () => {
    if (!voiceNoteVisualizer) {
      return;
    }

    const progressRatio =
      voiceNoteDraft?.durationMs && voiceNoteAudio
        ? Math.min(
            (voiceNoteAudio.currentTime * 1000) / voiceNoteDraft.durationMs,
            1
          )
        : 0;

    voiceNoteVisualizer.renderStoredWaveform({
      waveform: voiceNoteDraft?.waveform,
      progressRatio
    });
    updateVoiceNoteComposer();
  };

  const stopVoiceNotePreview = () => {
    if (!voiceNoteAudio) {
      return;
    }

    stopPreviewProgressAnimation();
    voiceNoteAudio.pause();
    voiceNoteAudio.currentTime = 0;
    syncVoiceNotePreview();
  };

  const clearVoiceNoteComposer = () => {
    clearRecordingTimer();

    if (voiceNoteRecorder) {
      voiceNoteRecorder.cancel();
      voiceNoteRecorder = null;
    }

    if (voiceNoteLiveSession) {
      voiceNoteLiveSession.cancel();
      voiceNoteLiveSession = null;
    }

    stopVoiceNotePreview();

    voiceNoteDraft = null;
    resetVoiceNotePlaybackRate();

    if (voiceNoteVisualizer) {
      voiceNoteVisualizer.renderStoredWaveform({
        waveform: [],
        progressRatio: 0
      });
    }

    updateVoiceNoteComposer();
  };

  const updateSubmissionMode = (nextMode) => {
    submissionMode = nextMode;

    if (modeSwitch) {
      textModeBtn.className =
        submissionMode === "text"
          ? "secondary-btn comment-mode-btn comment-mode-btn-active"
          : "secondary-btn comment-mode-btn";
      voiceModeBtn.className =
        submissionMode === "voice"
          ? "secondary-btn comment-mode-btn comment-mode-btn-active"
          : "secondary-btn comment-mode-btn";
    }

    const isTextMode = submissionMode === "text";

    if (isTextMode) {
      clearVoiceNoteComposer();
    }

    setToggleDisplay(textModeFields, isTextMode);
    textarea.disabled = !isTextMode;
    textarea.required = isTextMode;

    if (voiceNoteComposer) {
      setToggleDisplay(voiceNoteComposer, !isTextMode);
    }

    if (submitBtn) {
      submitBtn.textContent = submissionMode === "voice" ? "Post" : submitText;
    }

    updateVoiceNoteComposer();
  };

  const syncCharacterCounter = () => {
    const currentLength = textarea.value.length;
    charCounter.textContent = `${currentLength} / ${textarea.maxLength}`;
    charCounter.className =
      currentLength >= textarea.maxLength
        ? "char-counter char-counter-limit"
        : "char-counter";
  };

  if (hasVoiceMode) {
    modeSwitch = createElement("div", { className: "comment-mode-switch" });
    textModeBtn = createElement("button", {
      className: "secondary-btn comment-mode-btn",
      type: "button",
      text: "Text"
    });
    voiceModeBtn = createElement("button", {
      className: "secondary-btn comment-mode-btn",
      type: "button",
      text: "Voice note"
    });

    textModeBtn.addEventListener("click", () => {
      clearFormErrors(form);
      updateSubmissionMode("text");
      focusActiveCommentTarget();
    });

    voiceModeBtn.addEventListener("click", () => {
      clearFormErrors(form);
      updateSubmissionMode("voice");
      focusActiveCommentTarget();
    });

    modeSwitch.append(textModeBtn, voiceModeBtn);
  }

  if (hasVoiceMode) {
    voiceNoteComposer = createElement("div", {
      className: "voice-note-composer"
    });
    voiceNoteShell = createElement("div", {
      className: "voice-note-shell"
    });

    voiceNotePrimaryBtn = createElement("button", {
      className: "voice-note-btn voice-note-icon-btn voice-note-main-btn",
      type: "button",
      text: "\u{1F3A4}",
      attributes: {
        "aria-label": "Record voice note",
        title: "Record voice note"
      }
    });

    voiceNoteTimer = createElement("p", {
      className: "voice-note-timer"
    });
    voiceNoteSpeedBtn = createElement("button", {
      className: "voice-note-speed-btn",
      type: "button",
      text: formatVoiceNotePlaybackRate(voiceNotePlaybackRate),
      attributes: {
        "aria-label": "Change voice note playback speed",
        title: "Change voice note playback speed"
      }
    });
    voiceNoteMeter = createElement("div", {
      className: "voice-note-bubble voice-note-bubble-draft voice-note-meter voice-note-meter-seekable"
    });
    voiceNoteWaveform = createElement("div", {
      className: "voice-note-waveform"
    });
    voiceNoteProgressLine = createElement("span", {
      className: "voice-note-progress-line"
    });
    const voiceNoteMeta = createElement("div", {
      className: "voice-note-meta"
    });
    voiceNoteStateDot = createElement("span", {
      className: "voice-note-state-dot",
      attributes: {
        "aria-hidden": "true"
      }
    });
    voiceNoteWaveform.appendChild(voiceNoteProgressLine);
    voiceNoteVisualizer = createVoiceNoteVisualizer({
      waveformElement: voiceNoteWaveform,
      progressLineElement: voiceNoteProgressLine
    });

    voiceNoteMeta.append(voiceNoteStateDot, voiceNoteTimer, voiceNoteSpeedBtn);
    voiceNoteMeter.append(voiceNotePrimaryBtn, voiceNoteWaveform, voiceNoteMeta);
    voiceNoteShell.append(voiceNoteMeter);

    voiceNoteAudio = document.createElement("audio");
    voiceNoteAudio.className = "voice-note-audio";
    configureVoiceNoteAudio(voiceNoteAudio);
    voiceNoteAudio.addEventListener("play", () => {
      startPreviewProgressAnimation();
      syncVoiceNotePreview();
    });
    ["pause", "ended"].forEach((eventName) => {
      voiceNoteAudio.addEventListener(eventName, () => {
        stopPreviewProgressAnimation();
        syncVoiceNotePreview();
      });
    });
    ["timeupdate", "loadedmetadata"].forEach((eventName) => {
      voiceNoteAudio.addEventListener(eventName, syncVoiceNotePreview);
    });

    const finalizeVoiceRecording = (nextVoiceNote) => {
      clearRecordingTimer();

      if (voiceNoteLiveSession) {
        const waveform = voiceNoteLiveSession.stop();
        voiceNoteLiveSession = null;
        voiceNoteDraft = nextVoiceNote
          ? {
              ...nextVoiceNote,
              waveform
            }
          : null;
      } else {
        voiceNoteDraft = nextVoiceNote;
      }

      voiceNoteRecorder = null;
      stopVoiceNotePreview();
      resetVoiceNotePlaybackRate();
      syncVoiceNotePreview();
    };

    voiceNotePrimaryBtn.addEventListener("click", async () => {
      if (voiceNoteRecorder) {
        voiceNoteRecorder.stop();
        return;
      }

      if (voiceNoteDraft?.dataUrl) {
        try {
          if (voiceNoteAudio.paused || voiceNoteAudio.ended) {
            if (voiceNoteAudio.ended) {
              voiceNoteAudio.currentTime = 0;
            }

            await voiceNoteAudio.play();
          } else {
            voiceNoteAudio.pause();
          }
        } catch (error) {
          setFieldError(inputId, error.message || "Could not play voice note preview.");
        }

        syncVoiceNotePreview();
        return;
      }

      clearFormErrors(form);

      try {
        voiceNoteDraft = null;
        voiceNoteRecorder = await startVoiceNoteRecording();
        voiceNoteLiveSession = await voiceNoteVisualizer.startRecording({
          stream: voiceNoteRecorder.stream,
          maxDurationMs: MAX_VOICE_NOTE_DURATION_MS
        });
        recordingStartedAt = Date.now();
        clearRecordingTimer();
        recordingTimerId = window.setInterval(updateVoiceNoteComposer, 250);
        voiceNoteRecorder.result
          .then((nextVoiceNote) => {
            if (voiceNoteRecorder) {
              finalizeVoiceRecording(nextVoiceNote);
            }
          })
          .catch((error) => {
            if (voiceNoteRecorder) {
              clearRecordingTimer();
              if (voiceNoteLiveSession) {
                voiceNoteLiveSession.cancel();
                voiceNoteLiveSession = null;
              }
              voiceNoteDraft = null;
              voiceNoteRecorder = null;
              setFieldError(inputId, error.message || "Voice note recording failed.");
              syncVoiceNotePreview();
            }
          });
        updateVoiceNoteComposer();
      } catch (error) {
        voiceNoteRecorder = null;
        if (voiceNoteLiveSession) {
          voiceNoteLiveSession.cancel();
          voiceNoteLiveSession = null;
        }
        setFieldError(inputId, error.message || "Could not start voice recording.");
      }
    });

    attachVoiceNoteScrubber({
      scrubElement: voiceNoteMeter,
      isEnabled: () => submissionMode === "voice" && Boolean(voiceNoteDraft?.durationMs),
      getDurationMs: () => voiceNoteDraft?.durationMs || 0,
      onSeekStart: () => {
        resumeVoicePreviewAfterSeek =
          Boolean(voiceNoteAudio) && !voiceNoteAudio.paused && !voiceNoteAudio.ended;

        if (voiceNoteAudio) {
          voiceNoteAudio.pause();
        }
      },
      onSeek: ({ timeMs }) => {
        if (!voiceNoteAudio) {
          return;
        }

        voiceNoteAudio.currentTime = timeMs / 1000;
        syncVoiceNotePreview();
      },
      onSeekEnd: async () => {
        if (resumeVoicePreviewAfterSeek && voiceNoteAudio) {
          try {
            await voiceNoteAudio.play();
          } catch (error) {
            setFieldError(
              inputId,
              error.message || "Could not continue voice note preview."
            );
          }
        }

        resumeVoicePreviewAfterSeek = false;
        syncVoiceNotePreview();
      }
    });

    voiceNoteSpeedBtn.addEventListener("click", () => {
      voiceNotePlaybackRate = getNextVoiceNotePlaybackRate(voiceNotePlaybackRate);

      if (voiceNoteAudio) {
        voiceNoteAudio.playbackRate = voiceNotePlaybackRate;
      }

      updateVoiceNoteComposer();
    });

    voiceNoteComposer.append(voiceNoteShell, voiceNoteAudio);
  }

  if (cancelText && typeof onCancel === "function") {
    const cancelBtn = createElement("button", {
      className: "secondary-btn comment-cancel-btn",
      type: "button",
      text: cancelText
    });

    cancelBtn.addEventListener("click", onCancel);
    actions.appendChild(cancelBtn);
  }

  submitBtn = createElement("button", {
    className: "primary-btn",
    type: "submit",
    text: submitText
  });
  actions.appendChild(submitBtn);

  textarea.addEventListener("input", syncCharacterCounter);
  textMetaRow.appendChild(charCounter);
  textModeFields.append(textMetaRow, textarea, helper);

  if (modeSwitch) {
    inputWrapper.appendChild(modeSwitch);
  }

  inputWrapper.appendChild(textModeFields);

  if (voiceNoteComposer) {
    inputWrapper.appendChild(voiceNoteComposer);
  }

  if (note) {
    inputWrapper.appendChild(note);
  }

  inputWrapper.appendChild(error);
  form.append(inputWrapper, actions);
  form._focusCommentTarget = focusActiveCommentTarget;
  form._resetCommentForm = () => {
    submissionMode = "text";
    textarea.value = initialValue;
    clearFormErrors(form);
    clearVoiceNoteComposer();
    updateSubmissionMode("text");
    syncCharacterCounter();
  };

  updateSubmissionMode("text");
  syncCharacterCounter();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormErrors(form);

    try {
      if (typeof onSubmit !== "function") {
        throw new Error("Comment form submit handler is missing.");
      }

      if (voiceNoteRecorder) {
        throw new Error("Stop the voice note recording before posting.");
      }

      const safeComment = validateCommentSubmission({
        content: textarea.value,
        voiceNote: voiceNoteDraft,
        mode: hasVoiceMode ? submissionMode : "text"
      });
      onSubmit(safeComment);

      if (typeof onSuccess === "function") {
        onSuccess();
      }
    } catch (error) {
      setFieldError(inputId, error.message || "Failed to save comment.");
    }
  });

  return form;

  function focusActiveCommentTarget() {
    window.requestAnimationFrame(() => {
      if (submissionMode === "voice" && voiceNotePrimaryBtn && !voiceNotePrimaryBtn.disabled) {
        voiceNotePrimaryBtn.focus({ preventScroll: true });
        return;
      }

      if (!textarea.disabled) {
        textarea.focus({ preventScroll: true });
        const caretPosition = textarea.value.length;
        textarea.setSelectionRange(caretPosition, caretPosition);
        return;
      }

      if (voiceModeBtn) {
        voiceModeBtn.focus({ preventScroll: true });
      }
    });
  }
}

function clearCommentUiState(node) {
  commentUiState.openReplyForms.delete(node.id);
  commentUiState.openReplyLists.delete(node.id);
  commentUiState.openEditForms.delete(node.id);

  node.children.forEach((childNode) => {
    clearCommentUiState(childNode);
  });
}

function openCommentActionSheet({
  comment,
  author,
  isOwner,
  canEditComment,
  onEdit,
  onDelete
}) {
  showActionSheet({
    title: "Comment",
    actions: [
      {
        label: "Share",
        onSelect: () => shareCommentEntry(comment, author)
      },
      {
        label: "Report",
        onSelect: () => {
          showToast("Report flow coming soon.", "success");
        }
      },
      ...(isOwner && canEditComment && typeof onEdit === "function"
        ? [
            {
              label: "Edit",
              onSelect: onEdit
            }
          ]
        : []),
      ...(isOwner && typeof onDelete === "function"
        ? [
            {
              label: "Delete",
              danger: true,
              onSelect: onDelete
            }
          ]
        : [])
    ]
  });
}

async function shareCommentEntry(comment, author) {
  const authorName = author?.username || "Unknown User";
  const shareText = comment?.content
    ? `${authorName}: ${comment.content}`
    : `${authorName} shared a voice note on Boitekong Now.`;

  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({
        title: "Comment",
        text: shareText
      });
      return;
    }

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareText);
      showToast("Comment copied to clipboard.", "success");
      return;
    }

    throw new Error("Sharing is not available on this device.");
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }

    showToast(error.message || "Could not share comment.", "error");
  }
}

function setToggleDisplay(element, isVisible) {
  element.style.display = isVisible ? "" : "none";
}

function resetCommentForm(form, initialValue = "") {
  if (typeof form?._resetCommentForm === "function") {
    form._resetCommentForm();
    return;
  }

  const textarea = form?.querySelector("textarea");

  if (textarea) {
    textarea.value = initialValue;
  }

  if (form) {
    clearFormErrors(form);
  }
}

function focusCommentForm(form) {
  if (!form) {
    return;
  }

  form.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });

  if (typeof form._focusCommentTarget === "function") {
    form._focusCommentTarget();
    return;
  }

  const textarea = form.querySelector("textarea");

  window.requestAnimationFrame(() => {
    textarea?.focus({ preventScroll: true });
  });
}

function focusCommentsPanel(panel) {
  if (!panel) {
    return;
  }

  panel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  window.requestAnimationFrame(() => {
    panel.focus({ preventScroll: true });
  });
}

function focusCommentById(postId, commentId) {
  if (!postId || !commentId) {
    return;
  }

  window.requestAnimationFrame(() => {
    const postCard = findPostCardById(postId);
    const commentTarget = postCard?.querySelector(`[data-comment-id="${commentId}"]`);

    if (!commentTarget) {
      return;
    }

    commentTarget.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  });
}

function closeOtherCommentsPanels(currentPostId) {
  for (const [postId, entry] of commentUiState.panelEntries.entries()) {
    if (!entry?.panel?.isConnected) {
      commentUiState.panelEntries.delete(postId);
      continue;
    }

    if (postId === currentPostId) {
      continue;
    }

    closeCommentsPanel(postId);
  }
}

function closeCommentsPanel(postId) {
  const entry = commentUiState.panelEntries.get(postId);

  commentUiState.openPanels.delete(postId);
  commentUiState.openCommentForms.delete(postId);

  if (!entry || !entry.panel?.isConnected) {
    commentUiState.panelEntries.delete(postId);
    return;
  }

  setToggleDisplay(entry.panel, false);
  entry.toggleBtn.classList.remove("comment-toggle-btn-active");
  entry.toggleBtn.textContent = getCommentsToggleLabel(
    false,
    typeof entry.getCommentsCount === "function" ? entry.getCommentsCount() : 0
  );

  if (entry.topLevelForm) {
    resetCommentForm(entry.topLevelForm);
    setToggleDisplay(entry.topLevelForm, false);
  }

  if (entry.composerToggleBtn) {
    entry.composerToggleBtn.textContent = "Add comment";
  }
}

function findLatestReplyForParent(comments, parentId, userId) {
  return comments
    .filter((comment) => comment.parentId === parentId && comment.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

function findPostCardById(postId) {
  return Array.from(document.querySelectorAll(".post-card")).find(
    (postCard) => postCard.dataset.postId === postId
  );
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
