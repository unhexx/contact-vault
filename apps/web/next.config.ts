import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only packages that apps/web depends on today. Add @contact-vault/ui when web takes that dependency.
  transpilePackages: [
    "@contact-vault/domain",
    "@contact-vault/parser",
    "@contact-vault/db",
  ],
  // Server modules use TypeScript ESM `.js` import specifiers (NodeNext style).
  // Webpack must map those to `.ts` sources during the Next build.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
