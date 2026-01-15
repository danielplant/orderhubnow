import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip TypeScript during build - we run tsc separately in deploy.sh
  typescript: { ignoreBuildErrors: true },
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
      {
        protocol: 'https',
        hostname: 'orderhub-uploads.s3.us-east-1.amazonaws.com',
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
