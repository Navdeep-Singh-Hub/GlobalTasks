/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    // Avoid PackFileCacheStrategy gzip OOM on low-RAM Windows dev machines.
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
