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
import { createBrandMark } from "../components/brandMark.js";

export function renderLogin(app) {
  clearElement(app);

  const shell = createElement("section", { className: "auth-shell auth-shell-login" });
  const layout = createElement("div", { className: "auth-layout auth-layout-login" });
  const showcase = createLoginShowcase();
  const pane = createElement("section", { className: "auth-pane auth-pane-login" });
  const mobileBrand = createElement("div", { className: "auth-mobile-brand" });
  const card = createElement("div", { className: "auth-card auth-card-login" });
  const header = createElement("div", { className: "auth-card-copy auth-card-copy-login" });
  const title = createElement("h1", {
    className: "auth-title",
    text: "Log in to Boitekong Pulse"
  });
  const subtitle = createElement("p", {
    className: "auth-subtitle",
    text: "Log back into the local platform for township updates, replies, and voice notes that stay close to home."
  });

  const form = createElement("form", {
    className: "auth-form auth-form-login",
    id: "login-form"
  });

  const identifierField = createField({
    labelText: "Username or phone number",
    inputId: "login-identifier",
    type: "text",
    autocomplete: "username"
  });

  const passwordField = createField({
    labelText: "Password",
    inputId: "login-password",
    type: "password",
    autocomplete: "current-password"
  });

  const submitBtn = createElement("button", {
    className: "primary-btn auth-submit-btn",
    text: "Log in",
    type: "submit"
  });

  const forgotBtn = createElement("button", {
    className: "link-btn auth-aux-link",
    text: "Forgot password?",
    type: "button"
  });

  const registerBtn = createElement("button", {
    className: "secondary-btn auth-outline-btn",
    text: "Create new account",
    type: "button",
    id: "go-register"
  });

  form.append(identifierField, passwordField, submitBtn);
  header.append(title, subtitle);
  mobileBrand.appendChild(createBrandMark({ compact: true, showTagline: false }));
  card.append(header, form, forgotBtn, registerBtn);
  pane.append(mobileBrand, card);
  layout.append(showcase, pane);
  shell.append(layout, createAuthSiteFooter());
  app.appendChild(shell);

  registerBtn.addEventListener("click", () => {
    navigate("register");
  });

  forgotBtn.addEventListener("click", () => {
    showToast("Password reset can be added once backend is connected.", "success");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(form);

    const identifier = document.getElementById("login-identifier").value;
    const password = document.getElementById("login-password").value;

    try {
      await loginUser({ identifier, password });
      showToast("Logged in successfully.", "success");
      navigate("feed");
    } catch (error) {
      handleLoginError(error);
    }
  });
}

function createField({ labelText, inputId, type, autocomplete }) {
  const wrapper = createElement("div", { className: "field-group auth-field-group" });
  const fieldShell = createElement("label", {
    className: "form-label auth-floating-field",
    attributes: {
      for: inputId
    }
  });
  const input = createElement("input", {
    className: "form-input auth-form-input",
    id: inputId,
    type,
    placeholder: " ",
    required: true,
    autocomplete,
    attributes: {
      "aria-label": labelText
    }
  });
  const caption = createElement("span", {
    className: "auth-floating-label",
    text: labelText
  });
  const error = createFieldError(inputId);

  const syncFieldState = () => {
    const missingRequired =
      input.dataset.touched === "true" && input.required && !input.value.trim();
    const hasError = input.classList.contains("input-error");
    fieldShell.classList.toggle("auth-floating-field-invalid", missingRequired || hasError);
    input.classList.toggle("auth-empty-error", missingRequired);
  };

  input.addEventListener("blur", () => {
    input.dataset.touched = "true";
    syncFieldState();
  });

  input.addEventListener("input", () => {
    if (input.classList.contains("input-error")) {
      input.classList.remove("input-error");
    }

    if (error.textContent) {
      error.textContent = "";
    }

    syncFieldState();
  });

  input.addEventListener("invalid", () => {
    input.dataset.touched = "true";
    syncFieldState();
  });

  fieldShell.append(input, caption);
  wrapper.append(fieldShell, error);

  return wrapper;
}

function createLoginShowcase() {
  const showcase = createElement("section", {
    className: "auth-showcase auth-showcase-login"
  });
  const brand = createBrandMark({ showTagline: false });
  const title = createElement("h2", {
    className: "auth-showcase-title"
  });
  const titleLead = createElement("span", {
    className: "auth-showcase-title-line",
    text: "From Boitekong."
  });
  const titleAccent = createElement("span", {
    className: "auth-showcase-title-line auth-showcase-title-accent",
    text: "For Boitekong."
  });
  const copy = createElement("p", {
    className: "auth-showcase-copy",
    text: "Boitekong Pulse is built for local updates, real replies, and voice notes from people who actually know home."
  });
  const collage = createElement("div", { className: "auth-showcase-stack" });

  [
    "Kasi updates",
    "Voice notes from nearby",
    "Replies that keep the loop alive"
  ].forEach((itemText, index) => {
    const card = createElement("div", {
      className: `auth-showcase-card auth-showcase-card-${index + 1}`
    });
    const badge = createElement("span", {
      className: "auth-showcase-card-badge",
      text: "BP"
    });
    const text = createElement("p", {
      className: "auth-showcase-card-text",
      text: itemText
    });

    card.append(badge, text);
    collage.appendChild(card);
  });

  title.append(titleLead, titleAccent);
  showcase.append(brand, title, copy, collage);
  return showcase;
}

function createAuthSiteFooter() {
  const footer = createElement("footer", { className: "auth-site-footer" });
  const links = createElement("div", { className: "auth-site-footer-links" });
  const meta = createElement("div", { className: "auth-site-footer-meta" });

  ["About", "Help", "Privacy", "Terms & Conditions", "Contact"].forEach((itemText) => {
    links.appendChild(
      createElement("span", {
        className: "auth-site-footer-link",
        text: itemText
      })
    );
  });

  meta.append(
    createElement("span", {
      className: "auth-site-footer-meta-text",
      text: "English"
    }),
    createElement("span", {
      className: "auth-site-footer-meta-text",
      text: "Copyright 2025 Boitekong Pulse"
    })
  );

  footer.append(links, meta);
  return footer;
}

function handleLoginError(error) {
  const fieldMap = {
    identifier: "login-identifier",
    password: "login-password"
  };

  if (error?.field && fieldMap[error.field]) {
    setFieldError(fieldMap[error.field], error.message);
    showToast(error.message, "error");
    return;
  }

  showToast(error?.message || "Login failed.", "error");
}
