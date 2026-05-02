/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: "/TestPilot-AI",
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
