import { createElement } from "../utils/dom.js";

export function showActionSheet({ title = "Options", actions = [] }) {
  const existing = document.getElementById("action-sheet-root");

  if (existing) {
    existing.remove();
  }

  const root = createElement("div", {
    id: "action-sheet-root",
    className: "action-sheet-root"
  });
  const overlay = createElement("div", {
    className: "action-sheet-overlay"
  });
  const container = createElement("div", {
    className: "action-sheet-container"
  });
  const sheet = createElement("div", {
    className: "action-sheet-card",
    attributes: {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": title
    }
  });
  const handle = createElement("span", {
    className: "action-sheet-handle",
    attributes: {
      "aria-hidden": "true"
    }
  });
  const heading = createElement("h3", {
    className: "action-sheet-title",
    text: title
  });
  const list = createElement("div", {
    className: "action-sheet-actions"
  });

  const closeSheet = () => {
    root.remove();
    document.removeEventListener("keydown", handleKeyDown);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      closeSheet();
    }
  };

  overlay.addEventListener("click", closeSheet);
  container.addEventListener("click", (event) => {
    if (event.target === container) {
      closeSheet();
    }
  });
  sheet.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  document.addEventListener("keydown", handleKeyDown);

  actions
    .filter((action) => action && typeof action.onSelect === "function")
    .forEach(({ label, onSelect, danger = false }) => {
      const button = createElement("button", {
        className: `action-sheet-btn${danger ? " action-sheet-btn-danger" : ""}`,
        type: "button",
        text: label
      });

      button.addEventListener("click", async () => {
        closeSheet();
        await onSelect();
      });

      list.appendChild(button);
    });

  sheet.append(handle, heading, list);
  container.appendChild(sheet);
  root.append(overlay, container);
  document.body.appendChild(root);
}
