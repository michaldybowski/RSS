import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@longevity/access', '@longevity/audit'],
  typescript: { ignoreBuildErrors: false },
};

export default config;
