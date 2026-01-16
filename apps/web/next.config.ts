import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@squire/core'],
  output: 'standalone',
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude native modules from webpack bundle
      config.externals = [
        ...(config.externals || []),
        'cpu-features',
        'ssh2',
        'dockerode',
        'docker-modem',
      ];
    }
    return config;
  },
};

export default nextConfig;
