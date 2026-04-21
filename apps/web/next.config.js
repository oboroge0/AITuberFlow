// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require('./package.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
const isDesktop = process.env.BUILD_MODE === 'desktop';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  // Desktop: static export (no Node.js needed), Web: standalone for Docker
  output: isDesktop ? 'export' : 'standalone',

  // Skip server-side parsing of heavy 3D libraries (improves dev server startup)
  serverExternalPackages: [
    'three',
    '@pixiv/three-vrm',
    '@pixiv/three-vrm-animation',
  ],

  // Turbopack config (Next.js 16+ default bundler).
  // Pin the workspace root explicitly — both the monorepo root and apps/web
  // have their own package-lock.json, and Next otherwise prints a warning
  // asking us to disambiguate.
  turbopack: {
    root: path.resolve(__dirname),
  },

  // Disable dev indicators (Next.js logo in bottom-left corner)
  devIndicators: false,

  // Proxy API requests to backend (eliminates CORS issues)
  // Disabled for desktop mode (static export doesn't support rewrites)
  ...(!isDesktop && {
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
  }),
};

module.exports = nextConfig;
