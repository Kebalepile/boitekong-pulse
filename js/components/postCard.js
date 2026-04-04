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
import { validateCommentSubmission } from "../utils/validators.js";
import {
  getVoiceNoteFeatureStatus,
  startVoiceNoteRecording,
  formatVoiceNoteDuration,
  MAX_VOICE_NOTE_DURATION_MS,
  configureVoiceNoteAudio
} from "../utils/voiceNotes.js";
import { createVoiceNoteVisualizer } from "../utils/voiceNoteVisualizer.js";

const POST_PREVIEW_LENGTH = 300;
const voiceNoteFeatureStatus = getVoiceNoteFeatureStatus();
const voiceNoteChoiceText = voiceNoteFeatureStatus.supported
  ? "Choose text or voice note."
  : voiceNoteFeatureStatus.message;

const commentUiState = {
  openPanels: new Set(),
  openCommentForms: new Set(),
  openReplyForms: new Set(),
  openReplyLists: new Set(),
  openEditForms: new Set(),
  sortOrders: new Map()
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
  const sortOrder = commentUiState.sortOrders.get(post.id) || "oldest";
  const commentTree = buildCommentTree(comments, sortOrder);
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
      { value: "oldest", label: "Oldest first" },
      { value: "newest", label: "Newest first" }
    ].forEach(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = sortOrder === value;
      sortSelect.appendChild(option);
    });

    sortSelect.addEventListener("change", () => {
      commentUiState.sortOrders.set(post.id, sortSelect.value);

      if (typeof onReactionChange === "function") {
        onReactionChange();
      }
    });

    sortLabel.appendChild(sortSelect);
    controls.appendChild(sortLabel);
  }

  const panel = createElement("div", { className: "comments-panel" });
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
      composerToggleBtn.textContent = "Add comment";
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

  header.append(heading, controls);
  panel.append(composerActions, topLevelForm, commentsList);
  section.append(header, panel);

  return section;
}

function createCommentNode({ postId, node, currentUserId, onCommentChange, depth }) {
  const thread = createElement("div", { className: "comment-thread" });
  thread.style.setProperty("--comment-depth", String(depth));

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
      commentUiState.openReplyLists.delete(node.id);

      if (typeof onCommentChange === "function") {
        onCommentChange();
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
    onEdit: canEditComment
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

  let voiceNoteStatus = null;
  let voiceNoteTimer = null;
  let voiceNoteAudio = null;
  let voiceNotePrimaryBtn = null;
  let voiceNoteStopBtn = null;
  let voiceNoteClearBtn = null;
  let voiceNoteMeter = null;
  let voiceNoteWaveform = null;
  let voiceNoteProgressLine = null;
  let voiceNoteVisualizer = null;
  let voiceNoteLiveSession = null;

  const updateVoiceNoteComposer = () => {
    if (!voiceNoteStatus) {
      return;
    }

    const isRecording = Boolean(voiceNoteRecorder);
    const hasVoiceNote = Boolean(voiceNoteDraft?.dataUrl);
    const isPreviewPlaying = Boolean(
      voiceNoteAudio && !voiceNoteAudio.paused && !voiceNoteAudio.ended
    );
    const maxDurationLabel = `${formatVoiceNoteDuration(MAX_VOICE_NOTE_DURATION_MS)} minute`;

    voiceNotePrimaryBtn.disabled = submissionMode !== "voice" || isRecording;
    voiceNoteStopBtn.disabled =
      submissionMode !== "voice" || (!isRecording && !isPreviewPlaying);
    voiceNoteClearBtn.disabled =
      submissionMode !== "voice" || (!isRecording && !hasVoiceNote);

    if (submitBtn) {
      submitBtn.disabled = isRecording;
    }

    if (voiceNoteAudio) {
      configureVoiceNoteAudio(voiceNoteAudio, hasVoiceNote ? voiceNoteDraft.dataUrl : "");
    }

    if (voiceNoteMeter) {
      voiceNoteMeter.classList.toggle("voice-note-meter-recording", isRecording);
      voiceNoteMeter.classList.toggle("voice-note-meter-playing", isPreviewPlaying);
    }

    if (voiceNotePrimaryBtn) {
      const primaryConfig = hasVoiceNote
        ? isPreviewPlaying
          ? {
              text: "\u23F8",
              label: "Pause voice note preview"
            }
          : {
              text: "\u25B6",
              label: "Play voice note preview"
            }
        : {
            text: "\u{1F3A4}",
            label: "Record voice note"
          };

      voiceNotePrimaryBtn.textContent = primaryConfig.text;
      voiceNotePrimaryBtn.setAttribute("aria-label", primaryConfig.label);
      voiceNotePrimaryBtn.title = primaryConfig.label;
    }

    if (submissionMode !== "voice") {
      voiceNoteStatus.textContent = "\u{1F3A4} Switch to voice note mode to record.";
      if (voiceNoteTimer) {
        voiceNoteTimer.textContent = `Max ${maxDurationLabel}`;
      }
      return;
    }

    if (isRecording) {
      const elapsedMs = Math.min(Date.now() - recordingStartedAt, MAX_VOICE_NOTE_DURATION_MS);
      voiceNoteStatus.textContent = "\u{1F534} Recording voice note...";
      if (voiceNoteTimer) {
        voiceNoteTimer.textContent = `${formatVoiceNoteDuration(elapsedMs)} / Max ${maxDurationLabel}`;
      }
      return;
    }

    if (hasVoiceNote && isPreviewPlaying) {
      voiceNoteStatus.textContent = "\u{1F50A} Playing preview...";
      if (voiceNoteTimer) {
        voiceNoteTimer.textContent = `${formatVoiceNoteDuration(voiceNoteAudio.currentTime * 1000)} / ${formatVoiceNoteDuration(voiceNoteDraft.durationMs)}`;
      }
      return;
    }

    if (hasVoiceNote) {
      voiceNoteStatus.textContent = "\u{1F50A} Preview your voice note before posting.";
      if (voiceNoteTimer) {
        voiceNoteTimer.textContent = `${formatVoiceNoteDuration(voiceNoteDraft.durationMs)} recorded`;
      }
      return;
    }

    voiceNoteStatus.textContent = "\u{1F3A4} Ready to record a voice note.";
    if (voiceNoteTimer) {
      voiceNoteTimer.textContent = `Max ${maxDurationLabel}`;
    }
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
      submitBtn.textContent = submissionMode === "voice" ? "Post voice note" : submitText;
    }

    updateVoiceNoteComposer();
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
      textarea.focus();
    });

    voiceModeBtn.addEventListener("click", () => {
      clearFormErrors(form);
      updateSubmissionMode("voice");
    });

    modeSwitch.append(textModeBtn, voiceModeBtn);
  }

  if (hasVoiceMode) {
    voiceNoteComposer = createElement("div", {
      className: "voice-note-composer"
    });
    const voiceNoteControls = createElement("div", {
      className: "voice-note-controls"
    });

    voiceNotePrimaryBtn = createElement("button", {
      className: "secondary-btn voice-note-btn voice-note-icon-btn",
      type: "button",
      text: "\u{1F3A4}",
      attributes: {
        "aria-label": "Record voice note",
        title: "Record voice note"
      }
    });

    voiceNoteStopBtn = createElement("button", {
      className: "secondary-btn voice-note-btn voice-note-icon-btn",
      type: "button",
      text: "\u25A0",
      attributes: {
        "aria-label": "Stop voice note",
        title: "Stop voice note"
      }
    });

    voiceNoteClearBtn = createElement("button", {
      className: "secondary-btn voice-note-btn voice-note-icon-btn voice-note-clear-btn",
      type: "button",
      text: "\u{1F5D1}",
      attributes: {
        "aria-label": "Clear voice note",
        title: "Clear voice note"
      }
    });

    voiceNoteStatus = createElement("p", {
      className: "voice-note-status"
    });
    voiceNoteTimer = createElement("p", {
      className: "voice-note-timer"
    });
    voiceNoteMeter = createElement("div", {
      className: "voice-note-meter"
    });
    const voiceNoteIndicator = createElement("span", {
      className: "voice-note-indicator",
      text: "\u{1F399}"
    });
    voiceNoteWaveform = createElement("div", {
      className: "voice-note-waveform"
    });
    voiceNoteProgressLine = createElement("span", {
      className: "voice-note-progress-line"
    });
    voiceNoteWaveform.appendChild(voiceNoteProgressLine);
    voiceNoteVisualizer = createVoiceNoteVisualizer({
      waveformElement: voiceNoteWaveform,
      progressLineElement: voiceNoteProgressLine
    });

    voiceNoteMeter.append(voiceNoteIndicator, voiceNoteWaveform, voiceNoteTimer);

    voiceNoteAudio = document.createElement("audio");
    voiceNoteAudio.className = "voice-note-audio";
    configureVoiceNoteAudio(voiceNoteAudio);
    ["play", "pause", "ended", "timeupdate", "loadedmetadata"].forEach((eventName) => {
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
      syncVoiceNotePreview();
    };

    voiceNotePrimaryBtn.addEventListener("click", async () => {
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

      if (voiceNoteRecorder) {
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

    voiceNoteStopBtn.addEventListener("click", () => {
      if (voiceNoteRecorder) {
        voiceNoteRecorder.stop();
        return;
      }

      if (voiceNoteDraft?.dataUrl) {
        stopVoiceNotePreview();
      }
    });

    voiceNoteClearBtn.addEventListener("click", () => {
      clearVoiceNoteComposer();
    });

    voiceNoteControls.append(voiceNotePrimaryBtn, voiceNoteStopBtn, voiceNoteClearBtn);
    voiceNoteComposer.append(voiceNoteControls, voiceNoteMeter, voiceNoteStatus, voiceNoteAudio);
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

  textModeFields.append(textarea, helper);

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
  form._resetCommentForm = () => {
    submissionMode = "text";
    textarea.value = initialValue;
    clearFormErrors(form);
    clearVoiceNoteComposer();
    updateSubmissionMode("text");
  };

  updateSubmissionMode("text");

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
