import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Cloudflare Images 未設定のため最適化はオフ（SVGはインラインで扱う）
  images: { unoptimized: true },
  // セキュリティヘッダ。script-src は canvas/Worker 等の互換性のため絞らず、
  // フレーム埋め込み（クリックジャッキング）・base/object/form の悪用を塞ぐ。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

// `next dev` から Cloudflare バインディングへアクセスできるようにする。
// 本番/ビルド時は no-op。
initOpenNextCloudflareForDev();
