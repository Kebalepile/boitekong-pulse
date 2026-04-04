import { createElement } from "../utils/dom.js";

export function createCommentCard(comment, author, options = {}) {
  const {
    isReply = false,
    replyCount = 0,
    onReplyClick = null,
    onEditClick = null,
    onDeleteClick = null
  } = options;
  const card = createElement("div", { className: "comment-card" });

  if (isReply) {
    card.classList.add("comment-card-reply");
  }

  const header = createElement("div", { className: "comment-card-header" });

  const authorName = createElement("strong", {
    className: "comment-author",
    text: author?.username || "Unknown User"
  });

  const meta = createElement("span", {
    className: "comment-meta",
    text: formatCommentMeta(comment)
  });

  header.append(authorName, meta);

  const content = createElement("p", {
    className: "comment-content",
    text: comment.content
  });

  card.append(header, content);

  const actionConfigs = [
    { label: "Reply", className: "comment-action-btn", onClick: onReplyClick },
    { label: "Edit", className: "comment-action-btn", onClick: onEditClick },
    {
      label: "Delete",
      className: "comment-action-btn comment-action-danger",
      onClick: onDeleteClick
    }
  ].filter((action) => typeof action.onClick === "function");

  if (actionConfigs.length > 0) {
    const actions = createElement("div", { className: "comment-card-actions" });
    const replyCountLabel = createElement("span", {
      className: "comment-reply-count",
      text: `Replies (${replyCount})`
    });

    actions.appendChild(replyCountLabel);

    actionConfigs.forEach(({ label, className, onClick }) => {
      const actionBtn = createElement("button", {
        className,
        type: "button",
        text: label
      });

      actionBtn.addEventListener("click", onClick);
      actions.appendChild(actionBtn);
    });

    card.appendChild(actions);
  }

  if (comment.voiceNote) {
    const voiceBadge = createElement("span", {
      className: "comment-voice-badge",
      text: "Voice note attached"
    });

    card.appendChild(voiceBadge);
  }

  return card;
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

function formatCommentMeta(comment) {
  const baseText = formatTimestamp(comment.createdAt);

  if (comment.updatedAt) {
    return `${baseText} · Edited`;
  }

  return baseText;
}
