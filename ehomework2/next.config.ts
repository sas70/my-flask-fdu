import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default 10MB truncates large multipart bodies when middleware matches /api/admin/* (breaks FormData).
    middlewareClientMaxBodySize: "32mb",
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
};

export default nextConfig;
