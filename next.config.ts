import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // фото к заказу загружаются через server actions
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
