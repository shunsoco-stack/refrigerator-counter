import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "冷蔵庫カウンター",
    short_name: "冷蔵庫",
    description:
      "冷蔵庫を開けた回数だけを、真剣に記録。理由、グラフ、実績を端末に保存するカウンター。",
    lang: "ja",
    id: "/",
    scope: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f6f7",
    theme_color: "#f3f6f7",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
