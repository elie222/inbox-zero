const { withContentlayer } = require("next-contentlayer");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    serverActions: true,
  },
  async redirects() {
    return [
      {
        source: "/feature-requests",
        destination: "https://inboxzero.canny.io/feature-requests",
        permanent: true,
      },
      {
        source: "/github",
        destination: "https://github.com/elie222/inbox-zero",
        permanent: true,
      },
    ];
  },
};

module.exports = withContentlayer(nextConfig);
