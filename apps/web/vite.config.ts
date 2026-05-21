import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/EduPay-Smart-System/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "logo-school.png", "kcs.jpg"],
      manifest: {
        name: "EduPay KCS",
        short_name: "EduPay",
        description: "Kinshasa Christian School payment and finance application",
        theme_color: "#031b34",
        background_color: "#020817",
        display: "standalone",
        orientation: "any",
        scope: "/EduPay-Smart-System/",
        start_url: "/EduPay-Smart-System/#/dashboard",
        icons: [
          { src: "logo-school.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "logo-school.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      },
      workbox: {
        navigateFallback: "/EduPay-Smart-System/index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,jpg,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "edupay-api-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 160, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:4000"
    }
  },
  build: {
    chunkSizeWarningLimit: 1000
  }
});
