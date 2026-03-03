import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Avatar and image uploads are posted through Server Actions.
      // Keep this above current admin-configurable limits to avoid 413 errors.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
