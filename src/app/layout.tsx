import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/AppContext";
import AuthGuard from "@/components/AuthGuard";

export const metadata: Metadata = {
  title: "🌰 밤티부 - 스마트 재무 관리",
  description: "밤티부 예산관리 시스템",
};

// 모바일: 기기 화면 전체 사용(노치·홈 인디케이터 영역 포함) + 확대 허용(접근성)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0064FF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full bg-gray-100">
        <AppProvider>
          <AuthGuard>
            {children}
          </AuthGuard>
        </AppProvider>
      </body>
    </html>
  );
}
