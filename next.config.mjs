/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverComponentsExternalPackages: ['pdf-parse', 'mammoth'] },
};
export default nextConfig;
