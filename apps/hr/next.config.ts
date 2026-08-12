import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: [
    '@longevity/core',
    '@longevity/access',
    '@longevity/analytics',
    '@longevity/billing',
    '@longevity/gdpr',
  ],
  typescript: { ignoreBuildErrors: false },
};

export default config;
