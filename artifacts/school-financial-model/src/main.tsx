import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { TenantProvider } from "@workspace/tenant/react";
import App from "./App";
import "./index.css";
import { setupGlobalErrorHandlers } from "./lib/error-reporter";

setupGlobalErrorHandlers();

// Task #571 (M1 of WHITE_LABEL_STRATEGY): wrap the app in TenantProvider
// so M2+ components can `useTenant()` to read brand/colors/SEO. M1
// itself plumbs in the default `schoolstack` tenant only — no
// component consumes the hook yet, so this is observably a no-op.
createRoot(document.getElementById("root")!).render(
  <TenantProvider>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </TenantProvider>
);
