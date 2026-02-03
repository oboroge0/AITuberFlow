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

  // Disable dev indicators (Next.js logo in bottom-left corner)
  devIndicators: false,

  // Proxy API requests to backend (eliminates CORS issues)
  async rewrites() {
    const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
    // Normalize: strip trailing slashes and trailing /api suffix to avoid double slashes
    const apiUrlNormalized = rawApiUrl
      .replace(/\/+$/, '')      // Remove trailing slashes
      .replace(/\/api$/, '');   // Remove trailing /api if present
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrlNormalized}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
