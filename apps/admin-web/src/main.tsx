import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./state/auth-context";
import { Agentation } from "agentation";
import "./styles/global.scss";

const configuredBasePath = (import.meta.env.VITE_APP_BASE_PATH || "/license-console-k9").replace(/\/+$/, "");
const appBasePath = import.meta.env.DEV ? "/" : configuredBasePath;
const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
const isDevelopment =
  import.meta.env.DEV ||
  nodeEnv === "development";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={appBasePath}>
      <AuthProvider>
        <App />
        {isDevelopment && <Agentation />}
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
