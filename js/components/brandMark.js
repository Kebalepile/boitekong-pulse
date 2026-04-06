import { createElement } from "../utils/dom.js";

const brandIconUrl = new URL("../../assets/app-icon.png", import.meta.url).href;

export function createBrandMark({ compact = false, showTagline = true } = {}) {
  const wrapper = createElement("div", {
    className: `brand-mark${compact ? " brand-mark-compact" : ""}`
  });

  const icon = createElement("div", { className: "brand-mark-icon" });
  const image = document.createElement("img");
  image.className = "brand-mark-image";
  image.src = brandIconUrl;
  image.alt = "";
  image.decoding = "async";
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
