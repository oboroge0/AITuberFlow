/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable standalone output for Docker deployments
  output: 'standalone',

  // Skip server-side parsing of heavy 3D libraries (improves dev server startup)
  serverExternalPackages: [
    'three',
    '@pixiv/three-vrm',
    '@pixiv/three-vrm-animation',
  ],

  // Turbopack config (Next.js 16+ default bundler)
  turbopack: {},
};

module.exports = nextConfig;
