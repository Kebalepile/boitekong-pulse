import { createElement } from "./dom.js";

export const FEED_BATCH_SIZE = 5;
export const COMMENT_BATCH_SIZE = 5;
export const REPLY_BATCH_SIZE = 3;
export const SEARCH_BATCH_SIZE = 8;
export const CHAT_BATCH_SIZE = 8;
export const NOTIFICATION_BATCH_SIZE = 8;
export const DISCOVER_USERS_BATCH_SIZE = 8;
export const THREAD_MESSAGE_BATCH_SIZE = 20;

export function createLoadMoreControl({
  label = "See more",
  onClick,
  className = ""
}) {
  const row = createElement("div", {
    className: `list-load-more-row${className ? ` ${className}` : ""}`
  });
  const button = createElement("button", {
    className: "secondary-btn list-load-more-btn",
    type: "button",
    text: label
  });

  button.addEventListener("click", () => {
    if (typeof onClick === "function") {
      onClick();
    }
  });

  row.appendChild(button);
  return row;
}
