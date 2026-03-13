import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendUrl = process.env.VITE_BACKEND_URL || "http://localhost:3000";

export default defineConfig({
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
