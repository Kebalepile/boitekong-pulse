import {
  clearElement,
  createElement,
  clearFormErrors,
  setFieldError,
  createFieldError
} from "../utils/dom.js";
import { createNavbar } from "../components/navbar.js";
import { getPostById, updatePost } from "../services/postService.js";
import { showToast } from "../components/toast.js";
import { navigate } from "../router.js";

const MAX_POST_LENGTH = 1000;

export function renderEditPost(app, currentUser, payload) {
  clearElement(app);

  const postId = payload?.postId;
  const post = postId ? getPostById(postId) : null;

  if (!post) {
    showToast("Post not found.", "error");
    navigate("feed");
    return;
  }

  if (post.userId !== currentUser.id) {
    showToast("You can only edit your own post.", "error");
    navigate("feed");
    return;
  }

  const shell = createElement("section", { className: "feed-shell" });
  const navbar = createNavbar(currentUser);

  const main = createElement("main", { className: "profile-main" });

  const infoCard = createElement("section", { className: "profile-card" });
  const infoTitle = createElement("h2", { text: "Edit Post" });
  const infoText = createElement("p", {
    text: "Update your content and B-Point. Created time stays the same."
  });

  infoCard.append(infoTitle, infoText);

  const formCard = createElement("section", { className: "profile-card" });
  const formTitle = createElement("h2", { text: "Update Post" });

  const form = createElement("form", {
    className: "auth-form",
    id: "edit-post-form"
  });

  const contentField = createTextAreaField({
    labelText: "Post Content",
    inputId: "edit-post-content",
    placeholder: "Update your post",
    value: post.content
  });

  const imageField = createField({
    labelText: "Image URL (optional)",
    inputId: "edit-post-image",
    type: "url",
    placeholder: "https://example.com/image.jpg",
    value: post.image || "",
    autocomplete: "off",
    required: false,
    helperText: "Optional for now."
  });

  const townshipField = createField({
    labelText: "Township",
    inputId: "edit-post-township",
    type: "text",
    placeholder: "e.g. Boitekong",
    value: post.location.township,
    autocomplete: "address-level2",
    helperText: "This is your B-Point township."
  });

  const extensionField = createField({
    labelText: "Extension",
    inputId: "edit-post-extension",
    type: "text",
    placeholder: "e.g. Ext 2",
    value: post.location.extension,
    autocomplete: "off",
    helperText: 'Example: "Ext 2"'
  });

  const actions = createElement("div", { className: "form-actions" });

  const cancelBtn = createElement("button", {
    className: "secondary-btn",
    text: "Cancel",
    type: "button"
  });

  const submitBtn = createElement("button", {
    className: "primary-btn",
    text: "Save Changes",
    type: "submit"
  });

  cancelBtn.addEventListener("click", () => navigate("feed"));

  actions.append(cancelBtn, submitBtn);
  form.append(contentField, imageField, townshipField, extensionField, actions);

  formCard.append(formTitle, form);
  main.append(infoCard, formCard);
  shell.append(navbar, main);
  app.appendChild(shell);

  attachCharacterCounter("edit-post-content", "edit-post-content-counter");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormErrors(form);

    const content = document.getElementById("edit-post-content").value;
    const image = document.getElementById("edit-post-image").value;
    const township = document.getElementById("edit-post-township").value;
    const extension = document.getElementById("edit-post-extension").value;

    try {
      updatePost({
        postId: post.id,
        userId: currentUser.id,
        content,
        image,
        location: {
          township,
          extension
        }
      });

      showToast("Post updated successfully.", "success");
      navigate("feed");
    } catch (error) {
      handleEditPostError(error);
    }
  });
}

function createField({
  labelText,
  inputId,
  type,
  placeholder,
  value,
  autocomplete,
  required = true,
  helperText = ""
}) {
  const wrapper = createElement("div", { className: "field-group" });

  const label = createElement("label", {
    className: "form-label",
    text: labelText
  });

  const input = createElement("input", {
    className: "form-input",
    id: inputId,
    type,
    placeholder,
    autocomplete,
    required
  });

  input.value = value;

  const helper = createElement("p", {
    className: "field-helper",
    text: helperText
  });

  const error = createFieldError(inputId);

  label.appendChild(input);
  wrapper.append(label, helper, error);

  return wrapper;
}

function createTextAreaField({ labelText, inputId, placeholder, value }) {
  const wrapper = createElement("div", { className: "field-group" });

  const topRow = createElement("div", { className: "field-top-row" });

  const label = createElement("label", {
    className: "form-label",
    text: labelText
  });

  const counter = createElement("span", {
    className: "char-counter",
    id: `${inputId}-counter`,
    text: `0 / ${MAX_POST_LENGTH}`
  });

  topRow.append(label, counter);

  const textarea = document.createElement("textarea");
  textarea.className = "form-input form-textarea";
  textarea.id = inputId;
  textarea.placeholder = placeholder;
  textarea.required = true;
  textarea.maxLength = MAX_POST_LENGTH;
  textarea.value = value;

  const helper = createElement("p", {
    className: "field-helper",
    text: "Maximum 1000 characters."
  });

  const error = createFieldError(inputId);

  wrapper.append(topRow, textarea, helper, error);

  return wrapper;
}

function attachCharacterCounter(inputId, counterId) {
  const input = document.getElementById(inputId);
  const counter = document.getElementById(counterId);

  if (!input || !counter) return;

  const sync = () => {
    counter.textContent = `${input.value.length} / ${MAX_POST_LENGTH}`;
    counter.className =
      input.value.length >= MAX_POST_LENGTH
        ? "char-counter char-counter-limit"
        : "char-counter";
  };

  input.addEventListener("input", sync);
  sync();
}

function handleEditPostError(error) {
  const message = error.message || "Failed to update post.";
  const lower = message.toLowerCase();

  if (lower.includes("post content")) {
    setFieldError("edit-post-content", message);
    return;
  }

  if (lower.includes("image url")) {
    setFieldError("edit-post-image", message);
    return;
  }

  if (lower.includes("township")) {
    setFieldError("edit-post-township", message);
    return;
  }

  if (lower.includes("extension")) {
    setFieldError("edit-post-extension", message);
    return;
  }

  showToast(message, "error");
}