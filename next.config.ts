import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    "@napi-rs/canvas",
    "tesseract.js",
    "pdfjs-dist",
  ],
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./assets/tessdata/**/*",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/tesseract.js-core/tesseract-core.wasm",
      "./node_modules/tesseract.js-core/tesseract-core-simd.wasm",
      "./node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm",
      "./node_modules/tesseract.js-core/tesseract-core-lstm.wasm",
      "./node_modules/tesseract.js-core/tesseract-core-relaxedsimd.wasm",
      "./node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm",
    ],
  },
};

export default nextConfig;
