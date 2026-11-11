// Stand-in for @forge/bridge in the local development harness, where no Forge host exists.
// The real package throws on import outside an Atlassian product. Production builds use the real one.
const unavailable = () => Promise.reject(new Error('@forge/bridge is not available in the local harness'));
export const invoke = unavailable;
export const view = { getContext: unavailable, theme: { enable: unavailable } };
