import { clearFormErrors, createElement, createFieldError, setFieldError } from "../utils/dom.js";
import { compressImageFile } from "../utils/imageCompression.js";
import { MAX_POST_IMAGE_BYTES, validatePostImageFile } from "../utils/validators.js";
import { protectImageElement, protectMediaShell } from "../utils/protectedMedia.js";

export function createPostImageField({
  form,
  inputId,
  titleText = "Attach a photo",
  initialImage = ""
} = {}) {
  const state = {
    dataUrl: typeof initialImage === "string" ? initialImage.trim() : "",
    pending: false,
    failedPreviewSrc: "",
    requestToken: 0
  };

  const wrapper = createElement("div", {
    className: "field-group post-image-upload-field post-image-upload-field-compact"
  });
  const input = createElement("input", {
    className: "form-input post-image-file-input-hidden",
    id: inputId,
    type: "file",
    attributes: {
      accept: "image/png,image/jpeg,image/webp"
    }
  });
  const control = createElement("div", {
    className: "post-image-compact-row"
  });
  const triggerBtn = createElement("button", {
    className: "secondary-btn post-image-picker-btn",
    type: "button",
    attributes: {
      "aria-label": titleText,
      title: titleText
    }
  });
  const removeBtn = createElement("button", {
    className: "secondary-btn post-image-compact-remove-btn",
    text: "Remove",
    type: "button"
  });
  const previewShell = createElement("div", {
    className: "post-image-wrapper image-upload-preview-shell post-image-preview-shell-compact"
  });
  protectMediaShell(previewShell);
  const previewImage = document.createElement("img");
  const error = createFieldError(inputId);

  triggerBtn.appendChild(createPostImagePickerIcon());

  previewImage.className = "post-image image-upload-preview-image";
  previewImage.alt = "";
  previewImage.setAttribute("aria-hidden", "true");
  previewImage.loading = "lazy";
  previewImage.decoding = "async";
  previewImage.referrerPolicy = "no-referrer";
  protectImageElement(previewImage);
  previewShell.appendChild(previewImage);

  const syncPreview = () => {
    const triggerText = state.dataUrl ? "Change image" : titleText;

    triggerBtn.setAttribute("aria-label", triggerText);
    triggerBtn.setAttribute("title", triggerText);

    if (!state.dataUrl) {
      state.failedPreviewSrc = "";
      previewImage.hidden = true;
      previewImage.removeAttribute("src");
      previewImage.removeAttribute("data-preview-src");
      previewShell.hidden = true;
      removeBtn.disabled = state.pending;
      removeBtn.hidden = true;
      return;
    }

    if (state.failedPreviewSrc === state.dataUrl) {
      previewImage.hidden = true;
      previewImage.removeAttribute("src");
      previewImage.removeAttribute("data-preview-src");
      previewShell.hidden = true;
      removeBtn.disabled = state.pending;
      removeBtn.hidden = false;
      return;
    }

    previewImage.setAttribute("data-preview-src", state.dataUrl);
    previewImage.hidden = false;
    previewImage.src = state.dataUrl;
    previewShell.hidden = false;
    removeBtn.disabled = state.pending;
    removeBtn.hidden = false;
  };

  const syncPendingState = () => {
    triggerBtn.disabled = state.pending;
    triggerBtn.setAttribute("aria-busy", state.pending ? "true" : "false");
    triggerBtn.classList.toggle("post-image-picker-btn-loading", state.pending);
    triggerBtn.setAttribute(
      "aria-label",
      state.pending ? "Optimizing image..." : state.dataUrl ? "Change image" : titleText
    );
    triggerBtn.setAttribute(
      "title",
      state.pending ? "Optimizing image..." : state.dataUrl ? "Change image" : titleText
    );
  };

  const clear = () => {
    state.requestToken += 1;
    state.pending = false;
    state.dataUrl = "";
    state.failedPreviewSrc = "";
    input.value = "";
    syncPendingState();
    syncPreview();
  };

  previewImage.addEventListener("load", () => {
    if (previewImage.getAttribute("data-preview-src") !== state.dataUrl) {
      return;
    }

    state.failedPreviewSrc = "";
  });

  previewImage.addEventListener("error", () => {
    const activePreviewSrc = previewImage.getAttribute("data-preview-src");

    if (!state.dataUrl || activePreviewSrc !== state.dataUrl) {
      return;
    }

    state.failedPreviewSrc = state.dataUrl;
    previewImage.hidden = true;
    previewImage.removeAttribute("src");
    previewImage.removeAttribute("data-preview-src");
    previewShell.hidden = true;
    removeBtn.disabled = state.pending;
    removeBtn.hidden = false;
    setFieldError(
      inputId,
      state.dataUrl.startsWith("data:")
        ? "Could not preview that image. Try another one."
        : "Could not load the current image. Choose another image or remove it."
    );
  });

  triggerBtn.addEventListener("click", () => {
    input.click();
  });

  input.addEventListener("change", async () => {
    clearFormErrors(form);
    let requestToken = 0;

    try {
      const file = input.files?.[0] || null;

      if (!file) {
        return;
      }

      validatePostImageFile(file);
      requestToken = state.requestToken + 1;

      state.requestToken = requestToken;
      state.pending = true;
      syncPendingState();

      const optimizedImage = await compressImageFile(file, {
        maxBytes: MAX_POST_IMAGE_BYTES,
        maxWidth: 1600,
        maxHeight: 1600
      });

      if (state.requestToken !== requestToken) {
        return;
      }

      state.failedPreviewSrc = "";
      state.dataUrl = optimizedImage.dataUrl;
      state.pending = false;
      syncPendingState();
      syncPreview();
    } catch (errorObj) {
      if (requestToken && state.requestToken !== requestToken) {
        return;
      }

      state.pending = false;
      input.value = "";
      syncPendingState();
      syncPreview();
      setFieldError(inputId, errorObj.message || "Could not use that image.");
    }
  });

  removeBtn.addEventListener("click", () => {
    clear();
  });

  control.append(triggerBtn, removeBtn);
  wrapper.append(input, previewShell, error);

  syncPendingState();
  syncPreview();

  return {
    wrapper,
    control,
    clear,
    getValue: () => state.dataUrl,
    hasPreviewError: () => Boolean(state.failedPreviewSrc),
    isProcessing: () => state.pending
  };
}

function createPostImagePickerIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("post-image-picker-icon");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-width", "1.9");
  path.setAttribute(
    "d",
    "M5.5 6h13A1.5 1.5 0 0 1 20 7.5v9A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5v-9A1.5 1.5 0 0 1 5.5 6Zm2.75 2.75h.01M6.75 15.75l3.05-3.05a1 1 0 0 1 1.41 0l1.74 1.74a1 1 0 0 0 1.41 0l2.64-2.64"
  );

  svg.appendChild(path);
  return svg;
}
