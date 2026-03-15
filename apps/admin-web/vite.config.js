import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
var rootEnvDir = resolve(__dirname, "../..");
export default defineConfig(function (_a) {
    var mode = _a.mode, command = _a.command;
    var env = loadEnv(mode, rootEnvDir, "");
    var backendUrl = env.VITE_BACKEND_URL || "http://localhost:3000";
    var appBasePath = env.VITE_APP_BASE_PATH || "/license-console-k9/";
    var normalizedAppBasePath = appBasePath.endsWith("/") ? appBasePath : "".concat(appBasePath, "/");
    var isDevServer = command === "serve";
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
