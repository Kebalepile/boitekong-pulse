import {
  clearElement,
  createElement,
  clearFormErrors,
  setFieldError,
  createFieldError
} from "../utils/dom.js";
import { createNavbar } from "../components/navbar.js";
import { createAndStorePost } from "../services/postService.js";
import { showToast } from "../components/toast.js";
import { navigate } from "../router.js";

export function renderCreatePost(app, currentUser) {
  clearElement(app);

  const shell = createElement("section", { className: "feed-shell" });
  const navbar = createNavbar(currentUser);

  const main = createElement("main", { className: "profile-main" });

  const infoCard = createElement("section", { className: "profile-card" });
  const infoTitle = createElement("h2", { text: "Create Post" });
  const infoText = createElement("p", {
    text: "Share a text post with your B-Point. Image URL is optional for now."
  });

  const tipsList = createElement("ul", { className: "helper-list" });
  [
    "Keep post text short and clear.",
    "Use your correct township and extension.",
    "Only use a direct http/https image link if needed."
  ].forEach((tip) => {
    const item = createElement("li", { text: tip });
    tipsList.appendChild(item);
  });

  infoCard.append(infoTitle, infoText, tipsList);

  const formCard = createElement("section", { className: "profile-card" });
  const formTitle = createElement("h2", { text: "New Post" });

  const form = createElement("form", {
    className: "auth-form",
    id: "create-post-form"
  });

  const contentField = createTextAreaField({
    labelText: "Post Content",
    inputId: "post-content",
    placeholder: "What is happening in your area?"
  });

  const imageField = createField({
    labelText: "Image URL (optional)",
    inputId: "post-image",
    type: "url",
    placeholder: "https://example.com/image.jpg",
    value: "",
    autocomplete: "off",
    required: false,
    helperText: "Optional for MVP. File upload can come later."
  });

  const townshipField = createField({
    labelText: "Township",
    inputId: "post-township",
    type: "text",
    placeholder: "e.g. Boitekong",
    value: currentUser.location.township,
    autocomplete: "address-level2",
    helperText: "This is your B-Point township."
  });

  const extensionField = createField({
    labelText: "Extension",
    inputId: "post-extension",
    type: "text",
    placeholder: "e.g. Ext 2",
    value: currentUser.location.extension,
    autocomplete: "off",
    helperText: "Example: Ext 2"
  });

  const actions = createElement("div", { className: "form-actions" });

  const cancelBtn = createElement("button", {
    className: "secondary-btn",
    text: "Cancel",
    type: "button"
  });

  const submitBtn = createElement("button", {
    className: "primary-btn",
    text: "Publish Post",
    type: "submit"
  });

  cancelBtn.addEventListener("click", () => navigate("feed"));

  actions.append(cancelBtn, submitBtn);
  form.append(contentField, imageField, townshipField, extensionField, actions);
  formCard.append(formTitle, form);
  main.append(infoCard, formCard);

  shell.append(navbar, main);
  app.appendChild(shell);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormErrors(form);

    const content = document.getElementById("post-content").value;
    const image = document.getElementById("post-image").value;
    const township = document.getElementById("post-township").value;
    const extension = document.getElementById("post-extension").value;

    try {
      createAndStorePost({
        userId: currentUser.id,
        content,
        image,
        location: {
          township,
          extension
        }
      });

      showToast("Post created successfully.", "success");
      navigate("feed");
    } catch (error) {
      handleCreatePostError(error);
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

function createTextAreaField({ labelText, inputId, placeholder }) {
  const wrapper = createElement("div", { className: "field-group" });

  const label = createElement("label", {
    className: "form-label",
    text: labelText
  });

  const textarea = document.createElement("textarea");
  textarea.className = "form-input form-textarea";
  textarea.id = inputId;
  textarea.placeholder = placeholder;
  textarea.required = true;
  textarea.maxLength = 500;

  const helper = createElement("p", {
    className: "field-helper",
    text: "Maximum 500 characters."
  });

  const error = createFieldError(inputId);

  label.appendChild(textarea);
  wrapper.append(label, helper, error);

  return wrapper;
}

function handleCreatePostError(error) {
  const message = error.message || "Failed to create post.";

  if (message.toLowerCase().includes("post content")) {
    setFieldError("post-content", message);
    return;
  }

  if (message.toLowerCase().includes("image url")) {
    setFieldError("post-image", message);
    return;
  }

  if (message.toLowerCase().includes("township")) {
    setFieldError("post-township", message);
    return;
  }

  if (message.toLowerCase().includes("extension")) {
    setFieldError("post-extension", message);
    return;
  }

  showToast(message, "error");
}