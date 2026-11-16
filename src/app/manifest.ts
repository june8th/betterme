import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "betterme — 매일 운동 기록 스탬프 챌린지",
    short_name: "betterme",
    description: "매일 나를 바꾸는 운동 기록, betterme — 나만의 데일리 운동 달력 스탬프 챌린지",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF7F2",
    theme_color: "#FAF7F2",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-touch-icon.svg",
        sizes: "180x180",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
