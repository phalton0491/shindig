const { expo } = require('./app.json');

const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

module.exports = () => ({
  ...expo,
  extra: {
    ...expo.extra,
    eas: {
      ...(expo.extra?.eas ?? {}),
      ...(easProjectId ? { projectId: easProjectId } : {}),
    },
  },
});
