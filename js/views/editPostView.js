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

  if (post.voiceNote?.dataUrl) {
    showToast("Voice-note posts can't be edited. Delete and repost instead.", "error");
    navigate("feed");
    return;
  }

  const shell = createElement("section", { className: "feed-shell" });
  const navbar = createNavbar(currentUser, "create-post");

  const main = createElement("main", { className: "profile-main editor-main" });

  const infoCard = createElement("section", {
    className: "profile-card editor-card editor-brief-card"
  });
  const infoEyebrow = createElement("p", {
    className: "section-eyebrow",
    text: "Refine your message"
  });
  const infoTitle = createElement("h2", {
    className: "section-title",
    text: "Edit your post"
  });
  const infoText = createElement("p", {
    className: "section-copy",
    text: "Edit the wording only. Your original post metadata stays attached to the post."
  });

  infoCard.append(infoEyebrow, infoTitle, infoText);

  const formCard = createElement("section", {
    className: "profile-card editor-card editor-form-card"
  });
  const formTitle = createElement("h2", {
    className: "section-title",
    text: "Update post"
  });
  const formText = createElement("p", {
    className: "section-copy",
    text: "Keep the update sharp and direct. Voice-note posts can only be deleted, not edited."
  });

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
  form.append(contentField, actions);

  formCard.append(formTitle, formText, form);
  main.append(infoCard, formCard);
  shell.append(navbar, main);
  app.appendChild(shell);

  attachCharacterCounter("edit-post-content", "edit-post-content-counter");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormErrors(form);

    const content = document.getElementById("edit-post-content").value;

    try {
      updatePost({
        postId: post.id,
        userId: currentUser.id,
        content,
        image: post.image || "",
        location: post.location
      });

      showToast("Post updated successfully.", "success");
      navigate("feed");
    } catch (error) {
      handleEditPostError(error);
    }
  });
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

  if (error?.field === "content" || message.toLowerCase().includes("post content")) {
    setFieldError("edit-post-content", message);
    return;
  }

  showToast(message, "error");
}
