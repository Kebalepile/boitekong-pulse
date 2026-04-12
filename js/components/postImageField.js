import {
  clearFormErrors,
  createElement,
  createFieldError,
  setFieldError
} from "../utils/dom.js";
import {
  compressImageFile,
  formatImageOptimizationSummary
} from "../utils/imageCompression.js";
import { MAX_POST_IMAGE_BYTES, validatePostImageFile } from "../utils/validators.js";

export function createPostImageField({
  form,
  inputId,
  labelText = "Photo",
  titleText = "Attach a photo",
  helperText = `PNG, JPG, or WEBP. We will optimize it to under ${
    Math.round(MAX_POST_IMAGE_BYTES / 1024 / 1024)
  } MB before upload.`,
  initialImage = ""
} = {}) {
  const state = {
    dataUrl: typeof initialImage === "string" ? initialImage.trim() : "",
    pending: false,
    requestToken: 0
  };
  const wrapper = createElement("div", {
    className: "field-group post-image-upload-field"
  });
  const label = createElement("label", {
    className: "form-label",
    text: labelText
  });
  const panel = createElement("div", {
    className: "image-upload-panel post-image-upload-panel"
  });
  const copy = createElement("div", {
    className: "image-upload-copy post-image-upload-copy"
  });
  const title = createElement("strong", {
    className: "image-upload-title post-image-upload-title",
    text: titleText
  });
  const helper = createElement("p", {
    className: "field-helper",
    text: helperText
  });
  const status = createElement("p", {
    className: "field-helper image-upload-status",
    text: state.dataUrl ? "Current image ready." : "No image selected."
  });
  const actions = createElement("div", {
    className: "image-upload-actions post-image-upload-actions"
  });
  const input = createElement("input", {
    className: "form-input image-file-input post-image-file-input",
    id: inputId,
    type: "file",
    attributes: {
      accept: "image/png,image/jpeg,image/webp"
    }
  });
  const removeBtn = createElement("button", {
    className: "secondary-btn image-upload-remove-btn post-image-remove-btn",
    text: "Remove image",
    type: "button"
  });
  const previewShell = createElement("div", {
    className: "post-image-wrapper image-upload-preview-shell"
  });
  const previewImage = document.createElement("img");
  const error = createFieldError(inputId);

  previewImage.className = "post-image image-upload-preview-image";
  previewImage.alt = "Post image preview";
  previewImage.loading = "lazy";
  previewImage.referrerPolicy = "no-referrer";
  previewShell.appendChild(previewImage);

  const syncStatus = (text = "") => {
    status.textContent = text;
  };

  const syncPreview = () => {
    if (!state.dataUrl) {
      previewImage.removeAttribute("src");
      previewShell.hidden = true;
      removeBtn.disabled = true;
      return;
    }

    previewImage.src = state.dataUrl;
    previewShell.hidden = false;
    removeBtn.disabled = false;
  };

  const clear = ({ statusText = "Image removed." } = {}) => {
    state.requestToken += 1;
    state.pending = false;
    state.dataUrl = "";
    input.value = "";
    syncStatus(statusText);
    syncPreview();
  };

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
      syncStatus("Optimizing image...");
      const optimizedImage = await compressImageFile(file, {
        maxBytes: MAX_POST_IMAGE_BYTES,
        maxWidth: 1600,
        maxHeight: 1600
      });

      if (state.requestToken !== requestToken) {
        return;
      }

      state.dataUrl = optimizedImage.dataUrl;
      state.pending = false;
      syncStatus(formatImageOptimizationSummary(optimizedImage, "Post image"));
      syncPreview();
    } catch (errorObj) {
      if (requestToken && state.requestToken !== requestToken) {
        return;
      }

      state.pending = false;
      input.value = "";
      syncStatus(state.dataUrl ? "Current image ready." : "No image selected.");
      setFieldError(inputId, errorObj.message || "Could not use that image.");
    }
  });

  removeBtn.addEventListener("click", () => {
    clear();
  });

  copy.append(title, helper);
  actions.append(input, removeBtn);
  panel.append(copy, actions, status, previewShell);
  wrapper.append(label, panel, error);

  syncPreview();

  return {
    wrapper,
    clear,
    getValue: () => state.dataUrl,
    isProcessing: () => state.pending
  };
}
