/**
 * ホーム画面に追加したときの見え方。
 *
 * vite.config.ts から読む。テストからも読めるよう別ファイルにしている。
 */
export const manifest = {
  name: "宿題提出管理",
  short_name: "宿題チェック",
  description: "宿題の提出をQRコードでチェックする",
  lang: "ja",
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#FBFAF7",
  theme_color: "#22406B",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    {
      src: "/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
} as const;
