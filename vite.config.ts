import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { INAS_LOGO_BASE64 } from "./src/assets/inasLogo";

function inasLogoAsset(): Plugin {
  const logo = Buffer.from(INAS_LOGO_BASE64, "base64");
  const icon = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#f7faf8"/><image href="data:image/png;base64,${INAS_LOGO_BASE64}" x="40" y="130" width="432" height="213" preserveAspectRatio="xMidYMid meet"/></svg>`);
  return {
    name: "inas-logo-asset",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use("/inas-logo.png", (_request, response) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "image/png");
        response.setHeader("Cache-Control", "public,max-age=3600");
        response.end(logo);
      });
      server.middlewares.use("/inas-icon.svg", (_request, response) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "image/svg+xml");
        response.setHeader("Cache-Control", "public,max-age=3600");
        response.end(icon);
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "inas-logo.png", source: logo });
      this.emitFile({ type: "asset", fileName: "inas-icon.svg", source: icon });
      this.emitFile({ type: "asset", fileName: "inas-icon-192.png", source: logo });
      this.emitFile({ type: "asset", fileName: "inas-icon-512.png", source: logo });
    }
  };
}

export default defineConfig({
  plugins: [
    inasLogoAsset(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "INAS Check-in",
        short_name: "INAS Check-in",
        description: "Secure invitation and attendance check-in for INAS events.",
        theme_color: "#062f33",
        background_color: "#f3f7f5",
        display: "standalone",
        orientation: "portrait-primary",
        lang: "ar",
        dir: "rtl",
        start_url: "/",
        icons: [
          {
            src: "/inas-icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/inas-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "/inas-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,png,svg,woff2,wasm}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.googleapis\.com\//,
            handler: "NetworkOnly"
          },
          {
            urlPattern: /^https:\/\/fastly\.jsdelivr\.net\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "jsdelivr-cdn-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  server: {
    port: 4173,
    strictPort: true
  },
  preview: {
    port: 4173,
    strictPort: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/firebase") || id.includes("node_modules/@firebase")) {
            return "firebase";
          }
          if (id.includes("node_modules/@capacitor") || id.includes("node_modules/barcode-detector") || id.includes("node_modules/zxing-wasm")) {
            return "scanner";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "icons";
          }
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "ui";
          }
        }
      }
    }
  }
});
