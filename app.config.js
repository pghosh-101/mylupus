// Extends app.json. EXPO_BASE_URL lets the web demo be served from a sub-path
// (e.g. /mylupus on GitHub Pages) without affecting the phone app.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
