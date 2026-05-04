import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/EduPay-Smart-System/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000"
    }
  },
  build: {
    chunkSizeWarningLimit: 1000
  }
});
