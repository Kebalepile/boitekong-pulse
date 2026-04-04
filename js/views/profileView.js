import {
  clearElement,
  createElement,
  clearFormErrors,
  setFieldError,
  createFieldError
} from "../utils/dom.js";
import { createNavbar } from "../components/navbar.js";
import { navigate } from "../router.js";
import { showToast } from "../components/toast.js";
import { updateAuthenticatedUserProfile } from "../services/authService.js";

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
    helperText: "3-30 characters. Can include emoji. Maximum 3 spaces."
  });

  const townshipField = createField({
    labelText: "Township",
    inputId: "profile-township",
    type: "text",
    placeholder: "e.g. Boitekong",
    value: currentUser.location.township,
    autocomplete: "address-level2",
    helperText: "Township is text only."
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

  const currentPasswordField = createField({
    labelText: "Current Password",
    inputId: "profile-current-password",
    type: "password",
    value: "",
    placeholder: "Required only when changing password",
    autocomplete: "current-password",
    required: false,
    helperText: "Enter your current password before setting a new one."
  });

  const newPasswordField = createField({
    labelText: "New Password",
    inputId: "profile-password",
    type: "password",
    value: "",
    placeholder: "Leave blank to keep current password",
    autocomplete: "new-password",
    required: false,
    helperText: "Optional. If used, must meet password rules."
  });

  const confirmNewPasswordField = createField({
    labelText: "Confirm New Password",
    inputId: "profile-confirm-password",
    type: "password",
    value: "",
    placeholder: "Confirm new password",
    autocomplete: "new-password",
    required: false,
    helperText: "Only required when setting a new password."
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
    currentPasswordField,
    newPasswordField,
    confirmNewPasswordField,
    actions
  );

  formCard.append(formTitle, form);
  main.append(summaryCard, formCard);
  shell.append(navbar, main);
  app.appendChild(shell);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(form);

    const username = document.getElementById("profile-username").value;
    const township = document.getElementById("profile-township").value;
    const extension = document.getElementById("profile-extension").value;
    const currentPassword = document.getElementById("profile-current-password").value;
    const newPassword = document.getElementById("profile-password").value;
    const confirmNewPassword = document.getElementById("profile-confirm-password").value;

    try {
      await updateAuthenticatedUserProfile({
        currentUser,
        username,
        township,
        extension,
        currentPassword,
        newPassword,
        confirmNewPassword
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
  helperText = "",
  required = true
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
    required,
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
  const fieldMap = {
    username: "profile-username",
    township: "profile-township",
    extension: "profile-extension",
    currentPassword: "profile-current-password",
    password: "profile-password",
    confirmPassword: "profile-confirm-password"
  };

  if (error?.field && fieldMap[error.field]) {
    setFieldError(fieldMap[error.field], error.message);
    if (error.code === "USERNAME_EXISTS" || error.code === "CURRENT_PASSWORD_INVALID") {
      showToast(error.message, "error");
    }
    return;
  }

  showToast(error?.message || "Failed to update profile.", "error");
}