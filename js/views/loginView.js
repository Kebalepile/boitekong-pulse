import {
  loginUser,
  requestPasswordResetOtp,
  resetPasswordWithOtp
} from "../services/authService.js";
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

  const loginPanel = createElement("div", {
    className: "auth-login-panel"
  });
  const loginStatus = createLoginStatusPanel();
  const loginTransition = createLoginTransitionPanel();
  const loginForm = createElement("form", {
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

  const resetPanel = createElement("div", {
    className: "auth-reset-panel"
  });
  resetPanel.hidden = true;

  const resetCopy = createElement("div", {
    className: "auth-card-copy auth-card-copy-login"
  });
  const resetTitle = createElement("h2", {
    className: "auth-title",
    text: "Reset your password"
  });
  const resetSubtitle = createElement("p", {
    className: "auth-subtitle",
    text: "Enter the verified phone number you used to register. We will send a reset code by SMS, and that code expires after 5 minutes."
  });
  const resetStatus = createElement("p", {
    className: "auth-subtitle",
    text: "Only verified phone numbers can be used for password recovery, and you can only complete one forgot-password reset every 24 hours."
  });
  const resetRequestForm = createElement("form", {
    className: "auth-form auth-form-login",
    id: "forgot-password-request-form"
  });
  const resetPhoneField = createField({
    labelText: "Registered phone number",
    inputId: "forgot-phone-number",
    type: "tel",
    autocomplete: "tel",
    attributes: {
      inputmode: "tel"
    }
  });
  const sendResetOtpBtn = createElement("button", {
    className: "primary-btn auth-submit-btn",
    text: "Send reset code",
    type: "submit"
  });

  const resetConfirmForm = createElement("form", {
    className: "auth-form auth-form-login auth-reset-confirm-form",
    id: "forgot-password-confirm-form"
  });
  resetConfirmForm.hidden = true;

  const resetCodeField = createField({
    labelText: "SMS code",
    inputId: "forgot-reset-code",
    type: "text",
    autocomplete: "one-time-code",
    attributes: {
      inputmode: "numeric",
      maxlength: "8"
    }
  });
  const resetPasswordField = createField({
    labelText: "New password",
    inputId: "forgot-reset-password",
    type: "password",
    autocomplete: "new-password"
  });
  const resetConfirmPasswordField = createField({
    labelText: "Confirm new password",
    inputId: "forgot-reset-confirm-password",
    type: "password",
    autocomplete: "new-password"
  });
  const completeResetBtn = createElement("button", {
    className: "primary-btn auth-submit-btn",
    text: "Reset password",
    type: "submit"
  });
  const resetActionRow = createElement("div", {
    className: "auth-field-row"
  });
  const resendResetOtpBtn = createElement("button", {
    className: "link-btn auth-aux-link",
    text: "Resend code",
    type: "button"
  });
  const backToLoginBtn = createElement("button", {
    className: "secondary-btn auth-outline-btn",
    text: "Back to login",
    type: "button"
  });

  let lastResetPhoneNumber = "";

  const hideLoginFeedback = () => {
    loginStatus.hide();
    loginTransition.hide();
  };

  const setLoginBusyState = (nextBusy) => {
    const isBusy = Boolean(nextBusy);

    [
      identifierField.input,
      passwordField.input,
      submitBtn,
      forgotBtn,
      registerBtn
    ].forEach((control) => {
      if (control) {
        control.disabled = isBusy;
      }
    });

    submitBtn.textContent = isBusy ? "Logging in..." : "Log in";
    card.classList.toggle("auth-card-login-busy", isBusy);
  };

  function openResetPanel() {
    hideLoginFeedback();
    setLoginBusyState(false);
    const identifierInput = document.getElementById("login-identifier");

    if (identifierInput?.value?.trim()) {
      const resetPhoneInput = document.getElementById("forgot-phone-number");

      if (resetPhoneInput && !resetPhoneInput.value.trim()) {
        resetPhoneInput.value = identifierInput.value.trim();
      }
    }

    loginPanel.hidden = true;
    resetPanel.hidden = false;
    resetStatus.textContent =
      "Enter your verified phone number. The reset code expires after 5 minutes.";
    document.getElementById("forgot-phone-number")?.focus();
  }

  function closeResetPanel() {
    hideLoginFeedback();
    setLoginBusyState(false);
    loginPanel.hidden = false;
    resetPanel.hidden = true;
    resetConfirmForm.hidden = true;
    clearFormErrors(resetRequestForm);
    clearFormErrors(resetConfirmForm);
    resetRequestForm.reset();
    resetConfirmForm.reset();
    lastResetPhoneNumber = "";
    resetStatus.textContent =
      "Only verified phone numbers can be used for password recovery, and you can only complete one forgot-password reset every 24 hours.";
    document.getElementById("login-identifier")?.focus();
  }

  async function sendResetCode(phoneNumber) {
    const response = await requestPasswordResetOtp({
      phoneNumber
    });

    lastResetPhoneNumber = response.phoneNumber || phoneNumber;
    resetConfirmForm.hidden = false;
    resetStatus.textContent =
      "Reset code sent. Enter the SMS code within 5 minutes, then choose your new password.";
    showToast("Password reset code sent.", "success");
    document.getElementById("forgot-reset-code")?.focus();
    return response;
  }

  loginForm.append(identifierField.wrapper, passwordField.wrapper, submitBtn);
  loginPanel.append(loginForm, forgotBtn, registerBtn);

  resetCopy.append(resetTitle, resetSubtitle, resetStatus);
  resetRequestForm.append(resetPhoneField.wrapper, sendResetOtpBtn);
  resetConfirmForm.append(
    resetCodeField.wrapper,
    resetPasswordField.wrapper,
    resetConfirmPasswordField.wrapper,
    completeResetBtn
  );
  resetActionRow.append(resendResetOtpBtn, backToLoginBtn);
  resetPanel.append(resetCopy, resetRequestForm, resetConfirmForm, resetActionRow);

  header.append(title, subtitle);
  mobileBrand.appendChild(createBrandMark({ compact: true, showTagline: false }));
  card.append(header, loginStatus.root, loginPanel, resetPanel, loginTransition.root);
  pane.append(mobileBrand, card);
  layout.append(showcase, pane);
  shell.append(layout, createAuthSiteFooter());
  app.appendChild(shell);

  [identifierField.input, passwordField.input].forEach((input) => {
    input.addEventListener("input", () => {
      loginStatus.hide();
    });
  });

  registerBtn.addEventListener("click", () => {
    navigate("register");
  });

  forgotBtn.addEventListener("click", () => {
    openResetPanel();
  });

  backToLoginBtn.addEventListener("click", () => {
    closeResetPanel();
  });

  resendResetOtpBtn.addEventListener("click", async () => {
    clearFormErrors(resetRequestForm);

    const phoneNumber = document.getElementById("forgot-phone-number").value;

    try {
      await sendResetCode(phoneNumber);
    } catch (error) {
      handleForgotPasswordError(error);
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(loginForm);
    hideLoginFeedback();
    setLoginBusyState(true);

    const identifier = document.getElementById("login-identifier").value;
    const password = document.getElementById("login-password").value;

    try {
      await loginUser({ identifier, password });
      loginTransition.show({
        title: "Welcome back",
        message: "Getting your local feed ready..."
      });
      await navigate("feed", null, {
        skipTransition: true
      });
    } catch (error) {
      hideLoginFeedback();
      handleLoginError(error, {
        showStatus: (options) => loginStatus.show(options)
      });
    } finally {
      setLoginBusyState(false);
    }
  });

  resetRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(resetRequestForm);

    const phoneNumber = document.getElementById("forgot-phone-number").value;

    try {
      await sendResetCode(phoneNumber);
    } catch (error) {
      handleForgotPasswordError(error);
    }
  });

  resetConfirmForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(resetConfirmForm);

    const phoneNumber = document.getElementById("forgot-phone-number").value || lastResetPhoneNumber;
    const code = document.getElementById("forgot-reset-code").value;
    const newPassword = document.getElementById("forgot-reset-password").value;
    const confirmNewPassword = document.getElementById("forgot-reset-confirm-password").value;

    try {
      await resetPasswordWithOtp({
        phoneNumber,
        code,
        newPassword,
        confirmNewPassword
      });

      showToast("Password reset successfully. Log in with your new password.", "success");
      navigate("login");
    } catch (error) {
      handleForgotPasswordError(error);
    }
  });
}

function createField({
  labelText,
  inputId,
  type,
  autocomplete,
  required = true,
  attributes = null
}) {
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
    required,
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

  return {
    wrapper,
    input,
    error
  };
}

function createLoginStatusPanel() {
  const root = createElement("div", {
    className: "auth-login-status"
  });
  const indicator = createElement("div", {
    className: "auth-login-status-indicator",
    attributes: {
      "aria-hidden": "true"
    }
  });
  const ring = createElement("span", {
    className: "auth-login-status-ring",
    text: "B"
  });
  const copy = createElement("div", {
    className: "auth-login-status-copy"
  });
  const title = createElement("p", {
    className: "auth-login-status-title"
  });
  const message = createElement("p", {
    className: "auth-login-status-message"
  });
  const dismissBtn = createElement("button", {
    className: "auth-login-status-dismiss",
    text: "x",
    type: "button",
    attributes: {
      "aria-label": "Dismiss login message"
    }
  });

  indicator.append(ring);
  copy.append(title, message);
  root.append(indicator, copy, dismissBtn);

  const api = {
    root,
    hide() {
      root.className = "auth-login-status";
      title.textContent = "";
      message.textContent = "";
    },
    show({ tone = "error", title: nextTitle = "", message: nextMessage = "" } = {}) {
      root.className = `auth-login-status auth-login-status-visible auth-login-status-${tone}`;
      title.textContent = nextTitle;
      message.textContent = nextMessage;
    }
  };

  dismissBtn.addEventListener("click", () => {
    api.hide();
  });

  return api;
}

function createLoginTransitionPanel() {
  const root = createElement("div", {
    className: "auth-login-transition"
  });
  const card = createElement("div", {
    className: "auth-login-transition-card"
  });
  const orb = createElement("div", {
    className: "auth-login-transition-orb",
    attributes: {
      "aria-hidden": "true"
    }
  });
  const orbCore = createElement("span", {
    className: "auth-login-transition-core",
    text: "B"
  });
  const dots = createElement("div", {
    className: "auth-login-transition-dots",
    attributes: {
      "aria-hidden": "true"
    }
  });
  const title = createElement("p", {
    className: "auth-login-transition-title"
  });
  const message = createElement("p", {
    className: "auth-login-transition-message"
  });

  for (let index = 0; index < 3; index += 1) {
    dots.appendChild(
      createElement("span", {
        className: "auth-login-transition-dot"
      })
    );
  }

  orb.appendChild(orbCore);
  card.append(orb, title, message, dots);
  root.appendChild(card);
  root.hidden = true;

  return {
    root,
    hide() {
      root.hidden = true;
      title.textContent = "";
      message.textContent = "";
    },
    show({ title: nextTitle = "", message: nextMessage = "" } = {}) {
      title.textContent = nextTitle;
      message.textContent = nextMessage;
      root.hidden = false;
    }
  };
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

function handleLoginError(error, { showStatus = null } = {}) {
  const fieldMap = {
    identifier: "login-identifier",
    password: "login-password"
  };
  const safeMessage = error?.message || "Login failed.";
  const isAccountMissing =
    error?.code === "USER_NOT_FOUND" ||
    safeMessage.toLowerCase() === "account not found.";

  if (isAccountMissing) {
    setFieldError("login-identifier", safeMessage);

    if (typeof showStatus === "function") {
      showStatus({
        tone: "error",
        title: "Account not found",
        message: "We could not find a Boitekong Pulse account for that username or phone number."
      });
      return;
    }
  }

  if (error?.field && fieldMap[error.field]) {
    setFieldError(fieldMap[error.field], error.message);

    if (typeof showStatus === "function") {
      showStatus({
        tone: "error",
        title: error.field === "password" ? "Check your password" : "Check your details",
        message: safeMessage
      });
      return;
    }

    showToast(error.message, "error");
    return;
  }

  if (typeof showStatus === "function") {
    showStatus({
      tone: "error",
      title: "Could not log in",
      message: safeMessage
    });
    return;
  }

  showToast(safeMessage, "error");
}

function handleForgotPasswordError(error) {
  const fieldMap = {
    phoneNumber: "forgot-phone-number",
    code: "forgot-reset-code",
    password: "forgot-reset-password",
    confirmPassword: "forgot-reset-confirm-password"
  };

  if (error?.field && fieldMap[error.field]) {
    setFieldError(fieldMap[error.field], error.message);
    showToast(error.message, "error");
    return;
  }

  showToast(error?.message || "Could not reset password.", "error");
}
