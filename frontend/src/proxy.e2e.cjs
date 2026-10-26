// This proxy is selected only for E2E against the explicitly configured test backend.
module.exports = {
  '/api/**': {
    target: process.env.E2E_API_TARGET || 'http://127.0.0.1:8081',
    secure: false,
    changeOrigin: true,
  },
};
