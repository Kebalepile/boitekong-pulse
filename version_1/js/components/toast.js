export function showToast(message, type = "error") {
  // Remove existing
  const existing = document.getElementById("toast-root");
  if (existing) existing.remove();

  const root = document.createElement("div");
  root.id = "toast-root";

  // FULLSCREEN OVERLAY
  const overlay = document.createElement("div");
  overlay.className = "toast-overlay";

  // CENTERED CONTAINER
  const container = document.createElement("div");
  container.className = "toast-container";

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  root.appendChild(overlay);
  root.appendChild(container);
  document.body.appendChild(root);

  setTimeout(() => {
    root.remove();
  }, 2500);
}