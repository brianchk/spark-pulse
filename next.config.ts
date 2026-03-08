import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/pulse",
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `http://localhost:${process.env.API_PORT || 8100}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
