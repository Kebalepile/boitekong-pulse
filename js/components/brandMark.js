import { createElement } from "../utils/dom.js";

export function createBrandMark({ compact = false, showTagline = true } = {}) {
  const wrapper = createElement("div", {
    className: `brand-mark${compact ? " brand-mark-compact" : ""}`
  });

  const icon = createElement("div", { className: "brand-mark-icon" });
  const pulse = createElement("span", {
    className: "brand-mark-pulse",
    text: "BP"
  });
  icon.appendChild(pulse);

  const text = createElement("div", { className: "brand-mark-copy" });
  const title = createElement("strong", {
    className: "brand-mark-title",
    text: "Boitekong Now"
  });

  text.appendChild(title);

  if (showTagline) {
    text.appendChild(
      createElement("span", {
        className: "brand-mark-tagline",
        text: "The local feed that stays close to home"
      })
    );
  }

  wrapper.append(icon, text);
  return wrapper;
}
