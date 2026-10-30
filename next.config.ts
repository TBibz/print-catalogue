import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The catalogue is the home page for now.
  async redirects() {
    return [{ source: "/", destination: "/catalogue", permanent: false }];
  },
};

export default nextConfig;
