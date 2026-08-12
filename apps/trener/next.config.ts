import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@longevity/access', '@longevity/billing', '@longevity/workshops'],
  typescript: { ignoreBuildErrors: false },
};

export default config;
