import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The ticket route serves the onboarding doc from public/ at runtime.
  outputFileTracingIncludes: {
    '/ticket/[code]/BOT-ONBOARDING.md': ['./public/briefcase-spec/BOT-ONBOARDING.md'],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
