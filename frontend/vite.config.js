import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    // Bind tất cả interface để điện thoại trong cùng LAN truy cập qua IP máy
    // (vd: http://192.168.1.5:5173). Vite sẽ in dòng "Network: ..." khi start.
    host: true,
    // Cho phép host của tunnel (cloudflared / ngrok) để demo qua URL công khai HTTPS.
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.io", ".pharmahome.shop"],
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:5000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  // Bản build production phục vụ qua `vite preview` (demo domain qms.pharmahome.shop):
  // proxy /api + /ws về backend :5000 giống dev + cho phép host tunnel/domain.
  preview: {
    host: true,
    port: 4173,
    allowedHosts: [".trycloudflare.com", ".pharmahome.shop"],
    proxy: {
      "/api": { target: "http://localhost:5000", changeOrigin: true },
      "/ws": { target: "ws://localhost:5000", changeOrigin: true, ws: true },
    },
  },
  // Bỏ console.* / debugger khỏi bản build production (giữ lại khi dev).
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    // PWA: cho phép BN cài app từ trang /track/:hangDoiId/:stt
    // (BN scan QR code trên phiếu Kiosk → trình duyệt prompt "Cài đặt").
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico"],
      manifest: {
        name: "QMS — Theo dõi số thứ tự",
        short_name: "QMS Track",
        description:
          "Theo dõi số thứ tự khám bệnh, nhận thông báo khi sắp đến lượt.",
        lang: "vi",
        theme_color: "#1677ff",
        background_color: "#f0f5ff",
        display: "standalone",
        scope: "/",
        // Mở icon vào trang theo dõi của BN (không phải trang login của nhân viên).
        // Lưu ý: iOS đọc manifest tĩnh này lúc cài → không kèm ?bn= cho từng người.
        start_url: "/track",
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Nhúng handler Web Push vào service worker do workbox sinh ra.
        importScripts: ["push-handler.js"],
        // BN có thể mất sóng → cache index.html + assets để mở offline.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/ws/],
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/public\/track/,
            handler: "NetworkFirst",
            options: {
              cacheName: "track-api",
              expiration: { maxAgeSeconds: 60 },
            },
          },
        ],
      },
    }),
  ],
}));
