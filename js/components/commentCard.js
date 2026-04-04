import { createElement } from "../utils/dom.js";

export function createCommentCard(comment, author, options = {}) {
  const {
    isReply = false,
    repliesCount = 0,
    repliesExpanded = false,
    reactionBar = null,
    onReply = null,
    onToggleReplies = null,
    onEdit = null,
    onDelete = null
  } = options;

  const card = createElement("div", {
    className: `comment-card${isReply ? " comment-card-reply" : ""}`
  });

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

  if (reactionBar) {
    card.appendChild(reactionBar);
  }

  const actionConfigs = [
    { label: "\u21A9 Reply", className: "comment-action-btn", onClick: onReply },
    {
      label: repliesExpanded
        ? `\u25B4 Hide replies (${repliesCount})`
        : `\u25BE Show replies (${repliesCount})`,
      className: "comment-action-btn comment-replies-toggle-btn",
      onClick: repliesCount > 0 ? onToggleReplies : null
    },
    { label: "\u270E Edit", className: "comment-action-btn", onClick: onEdit },
    {
      label: "\u{1F5D1} Delete",
      className: "comment-action-btn comment-action-danger",
      onClick: onDelete
    }
  ].filter((action) => typeof action.onClick === "function");

  if (actionConfigs.length > 0) {
    const actions = createElement("div", { className: "comment-card-actions" });

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
    card.appendChild(
      createElement("span", {
        className: "comment-voice-badge",
        text: "Voice note attached"
      })
    );
  }

  return card;
}

function formatCommentMeta(comment) {
  const baseText = formatTimestamp(comment.createdAt);
  return comment.updatedAt ? `${baseText} | Edited` : baseText;
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
