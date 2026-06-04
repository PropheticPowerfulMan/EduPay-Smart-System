import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const disablePwa = (process.env.VITE_DISABLE_PWA ?? "").trim().toLowerCase() === "true";

export default defineConfig({
  base: "/EduPay-Smart-System/",
  plugins: [
    react(),
    !disablePwa && VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "logo-school.png", "kcs.jpg", "apple-touch-icon.png", "pwa-192x192.png", "pwa-512x512.png", "pwa-maskable-512x512.png"],
      manifest: {
        id: "/EduPay-Smart-System/",
        name: "EduPay KCS",
        short_name: "EduPay KCS",
        lang: "fr",
        description: "Application mobile et tablette de paiement scolaire pour Kinshasa Christian School",
        theme_color: "#031b34",
        background_color: "#020817",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
        orientation: "any",
        scope: "/EduPay-Smart-System/",
        start_url: "/EduPay-Smart-System/#/dashboard",
        categories: ["education", "finance", "productivity"],
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ],
        shortcuts: [
          {
            name: "Dashboard",
            short_name: "Dashboard",
            url: "/EduPay-Smart-System/#/dashboard",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" }]
          },
          {
            name: "Paiements",
            short_name: "Paiements",
            url: "/EduPay-Smart-System/#/payments",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" }]
          },
          {
            name: "Parents",
            short_name: "Parents",
            url: "/EduPay-Smart-System/#/parents",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" }]
          }
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
