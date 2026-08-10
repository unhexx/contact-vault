import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@contact-vault/domain",
    "@contact-vault/parser",
    "@contact-vault/db",
    "@contact-vault/ui",
  ],
};

export default nextConfig;
