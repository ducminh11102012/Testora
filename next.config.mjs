/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Native and CJS-heavy packages stay outside the bundler; `pg` in particular
  // must be required at runtime so its connection pool is a real singleton.
  experimental: { serverComponentsExternalPackages: ['pg', 'mammoth', 'unpdf', '@huggingface/hub'] },
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
};
export default nextConfig;
