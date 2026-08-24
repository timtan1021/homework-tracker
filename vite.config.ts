import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { manifest } from "./src/pwa/manifest";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 自動で切り替えない。スキャン中に画面が変わると、
      // 記録できたのか分からなくなる。
      registerType: "prompt",
      // as const で readonly になっているため、可変型を要求する
      // プラグインへは複製して渡す。テスト側は as const の恩恵を受ける。
      manifest: { ...manifest, icons: [...manifest.icons] },
      workbox: {
        /*
          プリキャッシュにフォント実体を含めない。

          日本語フォント3種は unicode-range で496個に分割されており、
          全部で 11.5MB ある。すべてプリキャッシュすると初回に25MBを
          要求することになり、教室のWi-Fiでは落とせない。

          ブラウザは実際に表示する文字を含むサブセットしか取りに
          行かないので、フォントは実行時キャッシュ（下の
          runtimeCaching）に委ねる。初回は約920KBで起動する。

          この配列に woff2 を足してはいけない。
        */
        globPatterns: ["**/*.{js,css,html}"],
        runtimeCaching: [
          {
            // 一度取ったフォントは端末に残す。次からはオフラインでも出る。
            urlPattern: /\.woff2$/,
            handler: "CacheFirst",
            options: {
              cacheName: "fonts",
              expiration: {
                maxEntries: 200,
                // 1年。フォントの中身は変わらない。
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
