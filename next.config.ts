import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
      },
      {
        protocol: 'http',
        hostname: 'inventory.limeapple.ca',
      },
    ],
  },
  async rewrites() {
    return [
      {
        // Proxy category images from legacy .NET server
        source: '/SkuImages/:path*',
        destination: 'http://inventory.limeapple.ca/SkuImages/:path*',
      },
    ];
  },
};

export default nextConfig;
