import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#FAF7F2",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://betterme.june8th.net"),
  title: "betterme — 매일 운동 기록 스탬프 챌린지",
  description: "매일 나를 바꾸는 운동 기록, betterme — 나만의 데일리 운동 달력 스탬프 챌린지",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "betterme — 매일 운동 기록 스탬프 챌린지",
    description: "매일 나를 바꾸는 운동 기록, betterme — 나만의 데일리 운동 달력 스탬프 챌린지",
    url: "https://betterme.june8th.net",
    siteName: "betterme",
    locale: "ko_KR",
    type: "website",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "betterme",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased text-[#2C2A27] selection:bg-[#6CA824]/20 selection:text-[#2C2A27]">
        <div className="max-w-[430px] mx-auto min-h-dvh bg-[#FAF7F2] shadow-[0_0_50px_rgba(44,42,39,0.10)] relative flex flex-col overflow-x-clip">
          {children}
        </div>
      </body>
    </html>
  );
}
