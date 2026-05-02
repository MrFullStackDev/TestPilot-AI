/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: "/AI-QA-Assistant",
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
