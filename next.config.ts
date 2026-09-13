import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist는 서버 함수에 번들하지 않고 외부 패키지로 로드(서버 PDF 파싱 안정화)
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
