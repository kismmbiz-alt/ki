import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // раздел «Скупка» переехал в «Рынок»
  async redirects() {
    return [
      { source: "/buyback", destination: "/market/search", permanent: false },
      { source: "/buyback/rating", destination: "/market/results", permanent: false },
      { source: "/buyback/sources", destination: "/market/sources", permanent: false },
      { source: "/buyback/:id", destination: "/market/search/:id", permanent: false },
    ];
  },
  experimental: {
    // фото к заказу загружаются через server actions
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
