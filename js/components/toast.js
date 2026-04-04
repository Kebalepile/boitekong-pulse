let activeToastTimeout = null;

export function showToast(message, type = "error") {
  const existing = document.getElementById("toast-root");
  if (existing) {
    existing.remove();
  }

  if (activeToastTimeout) {
    clearTimeout(activeToastTimeout);
    activeToastTimeout = null;
  }

  const root = document.createElement("div");
  root.id = "toast-root";

  const overlay = document.createElement("div");
  overlay.className = "toast-overlay";

  const container = document.createElement("div");
  container.className = "toast-container";

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  root.appendChild(overlay);
  root.appendChild(container);
  document.body.appendChild(root);

  activeToastTimeout = setTimeout(() => {
    root.remove();
    activeToastTimeout = null;
  }, 2500);
}