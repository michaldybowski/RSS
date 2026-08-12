import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: [
    '@longevity/access',
    '@longevity/analytics',
    '@longevity/billing',
    '@longevity/consent',
    '@longevity/core',
    '@longevity/gdpr',
    '@longevity/notion-sync',
    '@longevity/questionnaire',
  ],
  typescript: { ignoreBuildErrors: false },
};

export default config;
