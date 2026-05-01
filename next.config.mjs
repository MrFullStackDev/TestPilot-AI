/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3", "playwright"],
  },
  webpack: (config) => {
    config.externals.push("better-sqlite3", "playwright", "playwright-core");
    return config;
  },
};

export default nextConfig;
