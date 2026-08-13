import type { NextConfig } from 'next';

const config: NextConfig = {
  // Pakiety warsztatowe są w TypeScripcie i nie mają kroku budowania —
  // Next kompiluje je razem z aplikacją.
  transpilePackages: [
    '@longevity/academy',
    '@longevity/analytics',
    '@longevity/challenges',
    '@longevity/clinical',
    '@longevity/core',
    '@longevity/consent',
    '@longevity/questionnaire',
    '@longevity/plan',
    '@longevity/documents',
  ],
  typescript: { ignoreBuildErrors: false },
};

export default config;
