import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: [
    '@longevity/academy',
    '@longevity/access',
    '@longevity/analytics',
    '@longevity/challenges',
    '@longevity/consent',
    '@longevity/core',
    '@longevity/gdpr',
    '@longevity/notion-sync',
  ],
  typescript: { ignoreBuildErrors: false },
};

export default config;
