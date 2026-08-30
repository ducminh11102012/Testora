/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverComponentsExternalPackages: ['pdf-parse', 'mammoth', 'pg', 'deasync'] },
};
export default nextConfig;
