import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const rootEnvDir = resolve(__dirname, "../..");

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, rootEnvDir, "");
  const backendUrl = env.VITE_BACKEND_URL || "http://localhost:3000";
  const appBasePath = env.VITE_APP_BASE_PATH || "/license-console-k9/";
  const normalizedAppBasePath = appBasePath.endsWith("/") ? appBasePath : `${appBasePath}/`;
  const isDevServer = command === "serve";

  return {
    envDir: rootEnvDir,
    // In local Vite dev, serve on root path. Sub-path is handled by nginx in production.
    base: isDevServer ? "/" : normalizedAppBasePath,
    plugins: [react()],
    server: {
      port: 5174,
      proxy: {
        "^/admin(?:/|$)": backendUrl,
        "^/license(?:/|$)": backendUrl,
        "^/health(?:/|$)": backendUrl,
      },
    },
  };
});
