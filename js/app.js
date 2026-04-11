import { initRouter } from "./router.js";
import "./dev/resetApp.js";

document.addEventListener("DOMContentLoaded", () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }

  void initRouter();
});
