import { initRouter } from "./router.js";
import "./dev/resetApp.js";
import { bindInstallPrompt } from "./utils/pwaInstall.js";

document.addEventListener("DOMContentLoaded", () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }

  bindInstallPrompt();
  void initRouter();
});
