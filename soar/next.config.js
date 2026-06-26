/** @type {import('next').NextConfig} */
// ローカル開発時に /api/* をバックエンド(:8004)へproxyする。
// 本番では nginx が /api を先取りするためこのrewriteは発火しない。
const API_TARGET = process.env.API_PROXY_TARGET || 'http://localhost:8004';

const nextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_TARGET}/api/:path*` }];
  },
};

module.exports = nextConfig;
