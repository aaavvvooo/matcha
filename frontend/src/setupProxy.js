// Development server only: CRA loads this file into `npm start` (webpack-dev-server) and never
// into the production build. It adds the anti-framing / no-sniff headers that nginx.conf sets in
// production. No full CSP here: the dev server relies on eval-based source maps and hot reload.
module.exports = function setupSecurityHeaders(app) {
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
};
