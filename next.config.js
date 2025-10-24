/** @type {import('next').NextConfig} */
const nextConfig = {
  // Empty turbopack config to silence warning
  turbopack: {},
};

// Set environment variable to allow self-signed certificates
if (process.env.NODE_ENV === 'development') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

module.exports = nextConfig;
