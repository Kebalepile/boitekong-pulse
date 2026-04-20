import { createElement } from "../utils/dom.js";
import { protectImageElement, protectMediaShell } from "../utils/protectedMedia.js";

const brandIconUrl = new URL("../../assets/brand-emblem.svg", import.meta.url).href;

export function createBrandMark({ compact = false, showTagline = true } = {}) {
  const wrapper = createElement("div", {
    className: `brand-mark${compact ? " brand-mark-compact" : ""}`
  });

  const icon = createElement("div", { className: "brand-mark-icon" });
  protectMediaShell(icon);
  const image = document.createElement("img");
  image.className = "brand-mark-image";
  image.src = brandIconUrl;
  image.alt = "";
  image.decoding = "async";
  protectImageElement(image);
  icon.appendChild(image);

  const text = createElement("div", { className: "brand-mark-copy" });
  const title = createElement("strong", {
    className: "brand-mark-title",
    text: "Boitekong Pulse"
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
