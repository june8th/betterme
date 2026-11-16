import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  title: "betterme",
  description: "Hello World — betterme mobile app",
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
      <body className="antialiased selection:bg-indigo-500 selection:text-white">
        <div className="max-w-[430px] mx-auto min-h-dvh bg-slate-50 shadow-2xl relative flex flex-col overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
