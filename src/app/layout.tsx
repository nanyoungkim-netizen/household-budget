import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { AppProvider } from "@/lib/AppContext";

export const metadata: Metadata = {
  title: "가계부 - 스마트 재무 관리",
  description: "다중 계좌 통합 가계부 서비스",
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
          <Sidebar />
          <main className="md:ml-56 min-h-screen pb-20 md:pb-0">
            {children}
          </main>
        </AppProvider>
      </body>
    </html>
  );
}
