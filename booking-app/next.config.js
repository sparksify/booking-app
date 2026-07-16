/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/',
          has: [{ type: 'host', value: 'bookkanso.co' }],
          destination: '/book-home',
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'www.bookkanso.co' }],
          destination: '/book-home',
        },
      ],
    };
  },
  async redirects() {
    return [
      {
        source: '/',
        has: [{ type: 'host', value: 'app.trykanso.co' }],
        destination: '/dashboard',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
