import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";

// Request OS persistent storage so iOS/Android does not purge offline caches under disk pressure
if ("storage" in navigator && navigator.storage && "persist" in navigator.storage) {
  navigator.storage.persist().catch(() => undefined);
}

registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent("inas-sw-updated"));
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
