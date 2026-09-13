import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist는 서버 함수에 번들하지 않고 외부 패키지로 로드
  serverExternalPackages: ["pdfjs-dist"],
  // pdfjs가 런타임에 동적 import하는 worker 파일을 서버 함수 배포에 강제 포함
  // (Vercel 파일 트레이싱이 동적 import 경로는 자동으로 못 챙기므로)
  outputFileTracingIncludes: {
    "/api/parse-pdf": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    ],
  },
};

export default nextConfig;
