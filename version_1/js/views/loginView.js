import { loginUser } from "../services/authService.js";
import { navigate } from "../router.js";
import {
  clearElement,
  createElement,
  clearFormErrors,
  setFieldError,
  createFieldError
} from "../utils/dom.js";
import { showToast } from "../components/toast.js";

export function renderLogin(app) {
  clearElement(app);

  const shell = createElement("section", { className: "auth-shell" });
  const card = createElement("div", { className: "auth-card" });

  const title = createElement("h1", {
    className: "auth-title",
    text: "Boitekong Plus"
  });

  const subtitle = createElement("p", {
    className: "auth-subtitle",
    text: "Log in to your local community feed"
  });

  const form = createElement("form", {
    className: "auth-form",
    id: "login-form"
  });

  const usernameField = createField({
    labelText: "Username",
    inputId: "login-username",
    type: "text",
    placeholder: "Enter username",
    autocomplete: "username",
    helperText: "Use the username you registered with."
  });

  const passwordField = createField({
    labelText: "Password",
    inputId: "login-password",
    type: "password",
    placeholder: "Enter password",
    autocomplete: "current-password",
    helperText: "Enter your account password."
  });

  const submitBtn = createElement("button", {
    className: "primary-btn",
    text: "Log In",
    type: "submit"
  });

  form.append(usernameField, passwordField, submitBtn);

  const footer = createElement("div", { className: "auth-footer" });
  const footerText = createElement("span", {
    text: "Don’t have an account?"
  });

  const registerBtn = createElement("button", {
    className: "link-btn",
    text: "Register",
    type: "button",
    id: "go-register"
  });

  footer.append(footerText, registerBtn);
  card.append(title, subtitle, form, footer);
  shell.appendChild(card);
  app.appendChild(shell);

  registerBtn.addEventListener("click", () => {
    navigate("register");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormErrors(form);

    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;

    try {
      loginUser({ username, password });
      showToast("Logged in successfully.", "success");
      navigate("feed");
    } catch (error) {
      handleLoginError(error);
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

function handleLoginError(error) {
  const message = error.message || "Login failed.";

  if (message.toLowerCase().includes("user not found")) {
    setFieldError("login-username", message);
    showToast(message, "error");
    return;
  }

  if (message.toLowerCase().includes("password")) {
    setFieldError("login-password", message);
    showToast(message, "error");
    return;
  }

  if (message.toLowerCase().includes("username")) {
    setFieldError("login-username", message);
    return;
  }

  showToast(message, "error");
}