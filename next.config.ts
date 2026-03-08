import type { NextConfig } from "next";
import { execSync } from "child_process";

const gitHash = execSync("git rev-parse --short HEAD").toString().trim();
const buildNum = execSync("git rev-list --count HEAD").toString().trim();
const buildTime = new Date().toLocaleString("en-HK", {
  timeZone: "Asia/Hong_Kong",
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});

const nextConfig: NextConfig = {
  basePath: "/pulse",
  output: "standalone",
  env: {
    BUILD_NUM: buildNum,
    BUILD_HASH: gitHash,
    BUILD_TIME: buildTime,
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
