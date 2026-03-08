import type { NextConfig } from "next";
import { execSync } from "child_process";

const gitHash = execSync("git rev-parse --short HEAD").toString().trim();

const nextConfig: NextConfig = {
  basePath: "/pulse",
  output: "standalone",
  env: {
    BUILD_HASH: gitHash,
    BUILD_TIME: new Date().toISOString(),
  },
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
