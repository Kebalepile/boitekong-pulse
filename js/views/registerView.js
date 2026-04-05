import { registerUser } from "../services/authService.js";
import { navigate } from "../router.js";
import {
  clearElement,
  createElement,
  clearFormErrors,
  setFieldError,
  createFieldError
} from "../utils/dom.js";
import { showToast } from "../components/toast.js";
import { createBrandMark } from "../components/brandMark.js";

export function renderRegister(app) {
  clearElement(app);

  const shell = createElement("section", { className: "auth-shell" });
  const card = createElement("div", { className: "auth-card" });
  const intro = createElement("div", { className: "auth-intro" });
  const introEyebrow = createElement("p", {
    className: "section-eyebrow",
    text: "Join the neighborhood"
  });

  const title = createElement("h1", {
    className: "auth-title",
    text: "Create your account"
  });

  const subtitle = createElement("p", {
    className: "auth-subtitle",
    text: "Boitekong Now is built for fast local updates, real replies, and voice notes from people nearby."
  });
  const featureList = createElement("div", { className: "auth-feature-list" });

  [
    "Township-first identity",
    "Comments, replies, and reactions",
    "Voice-note-ready conversations"
  ].forEach((itemText) => {
    featureList.appendChild(
      createElement("span", {
        className: "auth-feature-chip",
        text: itemText
      })
    );
  });

  const form = createElement("form", {
    className: "auth-form",
    id: "register-form"
  });

  const usernameField = createField({
    labelText: "Username",
    inputId: "register-username",
    type: "text",
    placeholder: "Choose username",
    autocomplete: "username",
    helperText: "3-30 characters. Can include emoji. Maximum 3 spaces."
  });

  const townshipField = createField({
    labelText: "Township",
    inputId: "register-township",
    type: "text",
    placeholder: "e.g. Boitekong",
    autocomplete: "address-level2",
    helperText: "Township is text only."
  });

  const extensionField = createField({
    labelText: "Extension",
    inputId: "register-extension",
    type: "text",
    placeholder: "e.g. Ext 2",
    autocomplete: "off",
    helperText: 'Example: "Ext 2"'
  });

  const passwordField = createField({
    labelText: "Password",
    inputId: "register-password",
    type: "password",
    placeholder: "Create password",
    autocomplete: "new-password",
    helperText: "12-64 characters with upper, lower, number, and special character."
  });

  const confirmPasswordField = createField({
    labelText: "Confirm Password",
    inputId: "register-confirm-password",
    type: "password",
    placeholder: "Confirm password",
    autocomplete: "new-password",
    helperText: "Must match the password above."
  });

  const submitBtn = createElement("button", {
    className: "primary-btn auth-submit-btn",
    text: "Register",
    type: "submit"
  });

  form.append(
    usernameField,
    townshipField,
    extensionField,
    passwordField,
    confirmPasswordField,
    submitBtn
  );

  const footer = createElement("div", { className: "auth-footer" });
  const footerText = createElement("span", {
    text: "Already have an account?"
  });

  const loginBtn = createElement("button", {
    className: "link-btn",
    text: "Log In",
    type: "button",
    id: "go-login"
  });

  footer.append(footerText, loginBtn);
  intro.append(createBrandMark(), introEyebrow, title, subtitle, featureList);
  card.append(intro, form, footer);
  shell.appendChild(card);
  app.appendChild(shell);

  loginBtn.addEventListener("click", () => {
    navigate("login");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(form);

    const username = document.getElementById("register-username").value;
    const township = document.getElementById("register-township").value;
    const extension = document.getElementById("register-extension").value;
    const password = document.getElementById("register-password").value;
    const confirmPassword = document.getElementById("register-confirm-password").value;

    try {
      await registerUser({
        username,
        township,
        extension,
        password,
        confirmPassword
      });

      showToast("Account created successfully.", "success");
      navigate("feed");
    } catch (error) {
      handleRegisterError(error);
    }
  });
}

function createField({ labelText, inputId, type, placeholder, autocomplete, helperText = "" }) {
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

  const helper = createElement("p", {
    className: "field-helper",
    text: helperText
  });

  const error = createFieldError(inputId);

  label.appendChild(input);
  wrapper.append(label, helper, error);

  return wrapper;
}

function handleRegisterError(error) {
  const fieldMap = {
    username: "register-username",
    township: "register-township",
    extension: "register-extension",
    password: "register-password",
    confirmPassword: "register-confirm-password"
  };

  if (error?.field && fieldMap[error.field]) {
    setFieldError(fieldMap[error.field], error.message);
    if (error.code === "USERNAME_EXISTS") {
      showToast(error.message, "error");
    }
    return;
  }

  showToast(error?.message || "Registration failed.", "error");
}
