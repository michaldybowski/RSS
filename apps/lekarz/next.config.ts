import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: [
    '@longevity/access',
    '@longevity/clinical',
    '@longevity/consent',
    '@longevity/core',
    '@longevity/gdpr',
    '@longevity/plan',
  ],
  typescript: { ignoreBuildErrors: false },
};

export default config;
