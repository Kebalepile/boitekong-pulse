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

  const shell = createElement("section", { className: "auth-shell auth-shell-register" });
  const layout = createElement("div", { className: "auth-layout auth-layout-register" });
  const pane = createElement("section", { className: "auth-pane auth-pane-register" });
  const card = createElement("div", { className: "auth-card auth-card-register" });
  const brand = createElement("div", { className: "auth-register-brand" });
  const header = createElement("div", { className: "auth-card-copy auth-card-copy-register" });
  const title = createElement("h1", {
    className: "auth-title",
    text: "Create your account"
  });
  const subtitle = createElement("p", {
    className: "auth-subtitle",
    text: "Join the local platform for township updates, replies, and voice notes that stay close to home."
  });

  const form = createElement("form", {
    className: "auth-form auth-form-register",
    id: "register-form"
  });

  const phoneField = createField({
    labelText: "Phone number",
    inputId: "register-phone-number",
    type: "tel",
    autocomplete: "tel",
    attributes: {
      inputmode: "tel"
    }
  });

  const usernameField = createField({
    labelText: "Username",
    inputId: "register-username",
    type: "text",
    autocomplete: "username"
  });

  const townshipField = createField({
    labelText: "Township",
    inputId: "register-township",
    type: "text",
    autocomplete: "address-level2"
  });

  const extensionField = createField({
    labelText: "Extension",
    inputId: "register-extension",
    type: "text",
    autocomplete: "off"
  });

  const passwordField = createField({
    labelText: "Password",
    inputId: "register-password",
    type: "password",
    autocomplete: "new-password"
  });

  const confirmPasswordField = createField({
    labelText: "Confirm password",
    inputId: "register-confirm-password",
    type: "password",
    autocomplete: "new-password"
  });

  const locationRow = createElement("div", { className: "auth-field-row" });
  const passwordRow = createElement("div", { className: "auth-field-row" });
  const ageConfirmField = createAgeConfirmField();
  locationRow.append(townshipField, extensionField);
  passwordRow.append(passwordField, confirmPasswordField);

  const legal = createElement("div", { className: "auth-legal-copy-block" });
  const legalLead = createElement("p", {
    className: "auth-legal-copy",
    text:
      "By tapping Create account, you agree to create an account and to Boitekong Pulse's Terms & Conditions and Privacy Policy."
  });
  const legalFollow = createElement("p", {
    className: "auth-legal-copy",
    text:
      "Your phone number is required now and can be verified later from your profile with the SMS code flow."
  });
  const legalLinks = createElement("p", { className: "auth-legal-links" });
  legalLinks.append(
    createElement("span", {
      className: "auth-legal-link",
      text: "Terms & Conditions"
    }),
    createElement("span", {
      className: "auth-legal-separator",
      text: " | "
    }),
    createElement("span", {
      className: "auth-legal-link",
      text: "Privacy Policy"
    })
  );
  legal.append(legalLead, legalFollow, legalLinks);

  const submitBtn = createElement("button", {
    className: "primary-btn auth-submit-btn",
    text: "Create account",
    type: "submit"
  });

  const loginBtn = createElement("button", {
    className: "secondary-btn auth-outline-btn",
    text: "I already have an account",
    type: "button",
    id: "go-login"
  });

  form.append(
    phoneField,
    usernameField,
    locationRow,
    passwordRow,
    ageConfirmField.element,
    legal,
    submitBtn
  );
  brand.appendChild(createBrandMark({ compact: true, showTagline: false }));
  header.append(title, subtitle);
  card.append(brand, header, form, loginBtn);
  pane.append(card);
  layout.append(pane);
  shell.append(layout, createAuthSiteFooter());
  app.appendChild(shell);

  loginBtn.addEventListener("click", () => {
    navigate("login");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(form);

    const username = document.getElementById("register-username").value;
    const phoneNumber = document.getElementById("register-phone-number").value;
    const township = document.getElementById("register-township").value;
    const extension = document.getElementById("register-extension").value;
    const password = document.getElementById("register-password").value;
    const confirmPassword = document.getElementById("register-confirm-password").value;

    if (!ageConfirmField.isChecked()) {
      ageConfirmField.setInvalid("Confirm that you are 16 or older to continue.");
      showToast("Confirm that you are 16 or older to continue.", "error");
      return;
    }

    try {
      await registerUser({
        username,
        phoneNumber,
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

function createField({ labelText, inputId, type, autocomplete, attributes = null }) {
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
      "aria-label": labelText,
      ...(attributes || {})
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

function createAgeConfirmField() {
  const wrapper = createElement("div", {
    className: "field-group auth-checkbox-field"
  });
  const label = createElement("label", {
    className: "auth-checkbox-label",
    attributes: {
      for: "register-age-confirm"
    }
  });
  const input = createElement("input", {
    className: "auth-checkbox-input",
    id: "register-age-confirm",
    type: "checkbox",
    attributes: {
      "aria-describedby": "register-age-confirm-error"
    }
  });
  const copy = createElement("span", {
    className: "auth-checkbox-copy",
    text: "I confirm that I am 16 years old or older."
  });
  const error = createFieldError("register-age-confirm");

  const clearInvalid = () => {
    input.classList.remove("input-error");
    wrapper.classList.remove("auth-checkbox-field-invalid");
    error.textContent = "";
  };

  input.addEventListener("change", () => {
    if (input.checked) {
      clearInvalid();
    }
  });

  label.append(input, copy);
  wrapper.append(label, error);

  return {
    element: wrapper,
    isChecked: () => input.checked,
    setInvalid: (message) => {
      input.classList.add("input-error");
      wrapper.classList.add("auth-checkbox-field-invalid");
      error.textContent = message;
    }
  };
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

function handleRegisterError(error) {
  const fieldMap = {
    username: "register-username",
    phoneNumber: "register-phone-number",
    township: "register-township",
    extension: "register-extension",
    password: "register-password",
    confirmPassword: "register-confirm-password"
  };

  if (error?.field && fieldMap[error.field]) {
    setFieldError(fieldMap[error.field], error.message);
    showToast(error.message, "error");
    return;
  }

  showToast(error?.message || "Registration failed.", "error");
}
