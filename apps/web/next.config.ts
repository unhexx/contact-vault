import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only packages that apps/web depends on today. Add @contact-vault/ui when web takes that dependency.
  transpilePackages: [
    "@contact-vault/domain",
    "@contact-vault/parser",
    "@contact-vault/db",
  ],
};

export default nextConfig;
