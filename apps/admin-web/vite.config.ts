import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendUrl = process.env.VITE_BACKEND_URL || "http://localhost:3000";
const appBasePath = process.env.VITE_APP_BASE_PATH || "/license-console-k9/";

export default defineConfig({
  base: appBasePath,
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/admin": backendUrl,
      "/license": backendUrl,
      "/health": backendUrl,
    },
  },
});
