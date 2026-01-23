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
  async redirects() {
    return [
      // Legacy shopify routes → new dev portal
      { source: '/admin/shopify', destination: '/admin/dev/shopify', permanent: true },
      { source: '/admin/shopify/config', destination: '/admin/dev/shopify/config', permanent: true },
      { source: '/admin/shopify/settings', destination: '/admin/dev/shopify/settings', permanent: true },
      { source: '/admin/shopify/discovery', destination: '/admin/dev/schema', permanent: true },
      { source: '/admin/shopify/sync', destination: '/admin/dev/shopify/sync', permanent: true },
      { source: '/admin/shopify/sync/:path*', destination: '/admin/dev/shopify/sync/:path*', permanent: true },
      // Legacy developer route
      { source: '/admin/developer', destination: '/admin/dev/shopify/config', permanent: true },
    ];
  },
};

export default nextConfig;
