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

export function renderRegister(app) {
  clearElement(app);

  const shell = createElement("section", { className: "auth-shell" });
  const card = createElement("div", { className: "auth-card" });

  const title = createElement("h1", {
    className: "auth-title",
    text: "Create Account"
  });

  const subtitle = createElement("p", {
    className: "auth-subtitle",
    text: "Join Boitekong Plus"
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
    helperText: "3-20 characters. Letters, numbers, underscores."
  });

  const townshipField = createField({
    labelText: "Township",
    inputId: "register-township",
    type: "text",
    placeholder: "e.g. Boitekong",
    autocomplete: "address-level2",
    helperText: "Use your township name only."
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

  const submitBtn = createElement("button", {
    className: "primary-btn",
    text: "Register",
    type: "submit"
  });

  form.append(
    usernameField,
    townshipField,
    extensionField,
    passwordField,
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
  card.append(title, subtitle, form, footer);
  shell.appendChild(card);
  app.appendChild(shell);

  loginBtn.addEventListener("click", () => {
    navigate("login");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormErrors(form);

    const username = document.getElementById("register-username").value;
    const township = document.getElementById("register-township").value;
    const extension = document.getElementById("register-extension").value;
    const password = document.getElementById("register-password").value;

    try {
      registerUser({ username, township, extension, password });
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
  const message = error.message || "Registration failed.";

  if (message.toLowerCase().includes("username already exists")) {
    setFieldError("register-username", message);
    showToast(message, "error");
    return;
  }

  if (message.toLowerCase().includes("username")) {
    setFieldError("register-username", message);
    return;
  }

  if (message.toLowerCase().includes("township")) {
    setFieldError("register-township", message);
    return;
  }

  if (message.toLowerCase().includes("extension")) {
    setFieldError("register-extension", message);
    return;
  }

  if (message.toLowerCase().includes("password")) {
    setFieldError("register-password", message);
    return;
  }

  showToast(message, "error");
}