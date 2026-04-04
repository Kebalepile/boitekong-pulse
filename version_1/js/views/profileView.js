import {
  clearElement,
  createElement,
  clearFormErrors,
  setFieldError,
  createFieldError
} from "../utils/dom.js";
import { createNavbar } from "../components/navbar.js";
import { updateUserProfile } from "../services/userService.js";
import { navigate } from "../router.js";
import { showToast } from "../components/toast.js";

export function renderProfile(app, currentUser) {
  clearElement(app);

  const shell = createElement("section", { className: "feed-shell" });
  const navbar = createNavbar(currentUser);

  const main = createElement("main", { className: "profile-main" });

  const summaryCard = createElement("section", { className: "profile-card" });
  const summaryTitle = createElement("h2", { text: "Profile" });

  const usernameRow = createInfoRow("Username", currentUser.username);
  const townshipRow = createInfoRow("Township", currentUser.location.township);
  const extensionRow = createInfoRow("Extension", currentUser.location.extension);

  summaryCard.append(summaryTitle, usernameRow, townshipRow, extensionRow);

  const formCard = createElement("section", { className: "profile-card" });
  const formTitle = createElement("h2", { text: "Edit Profile" });

  const form = createElement("form", {
    className: "auth-form",
    id: "profile-form"
  });

  const usernameField = createField({
    labelText: "Username",
    inputId: "profile-username",
    type: "text",
    placeholder: "Enter username",
    value: currentUser.username,
    autocomplete: "username",
    helperText: "3-20 characters. Letters, numbers, underscores."
  });

  const townshipField = createField({
    labelText: "Township",
    inputId: "profile-township",
    type: "text",
    placeholder: "e.g. Boitekong",
    value: currentUser.location.township,
    autocomplete: "address-level2",
    helperText: "Use your township name only."
  });

  const extensionField = createField({
    labelText: "Extension",
    inputId: "profile-extension",
    type: "text",
    placeholder: "e.g. Ext 2",
    value: currentUser.location.extension,
    autocomplete: "off",
    helperText: 'Example: "Ext 2"'
  });

  const passwordField = createField({
    labelText: "Password",
    inputId: "profile-password",
    type: "password",
    placeholder: "Update password",
    value: currentUser.password,
    autocomplete: "new-password",
    helperText: "Use a strong password with mixed character types."
  });

  const actions = createElement("div", { className: "form-actions" });

  const backBtn = createElement("button", {
    className: "secondary-btn",
    text: "Back to Feed",
    type: "button"
  });

  const submitBtn = createElement("button", {
    className: "primary-btn",
    text: "Save Profile",
    type: "submit"
  });

  backBtn.addEventListener("click", () => navigate("feed"));

  actions.append(backBtn, submitBtn);

  form.append(
    usernameField,
    townshipField,
    extensionField,
    passwordField,
    actions
  );

  formCard.append(formTitle, form);
  main.append(summaryCard, formCard);
  shell.append(navbar, main);
  app.appendChild(shell);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormErrors(form);

    const username = document.getElementById("profile-username").value;
    const township = document.getElementById("profile-township").value;
    const extension = document.getElementById("profile-extension").value;
    const password = document.getElementById("profile-password").value;

    try {
      updateUserProfile({
        userId: currentUser.id,
        username,
        township,
        extension,
        password
      });

      showToast("Profile updated successfully.", "success");
      navigate("profile");
    } catch (error) {
      handleProfileError(error);
    }
  });
}

function createInfoRow(label, value) {
  const row = createElement("div", { className: "info-row" });
  const strong = createElement("strong", { text: `${label}: ` });
  const span = createElement("span", { text: value });

  row.append(strong, span);
  return row;
}

function createField({
  labelText,
  inputId,
  type,
  placeholder,
  value,
  autocomplete,
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
    required: true,
    autocomplete
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

function handleProfileError(error) {
  const message = error.message || "Failed to update profile.";

  if (message.toLowerCase().includes("username already exists")) {
    setFieldError("profile-username", message);
    showToast(message, "error");
    return;
  }

  if (message.toLowerCase().includes("username")) {
    setFieldError("profile-username", message);
    return;
  }

  if (message.toLowerCase().includes("township")) {
    setFieldError("profile-township", message);
    return;
  }

  if (message.toLowerCase().includes("extension")) {
    setFieldError("profile-extension", message);
    return;
  }

  if (message.toLowerCase().includes("password")) {
    setFieldError("profile-password", message);
    return;
  }

  showToast(message, "error");
}