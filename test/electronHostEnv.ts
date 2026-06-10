const ELECTRON_HOST_ENV_BLOCKLIST = new Set(['ELECTRON_RUN_AS_NODE', 'VSCODE_DEV']);

export function createElectronHostEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...source };
  Object.keys(env).forEach((key) => {
    if (ELECTRON_HOST_ENV_BLOCKLIST.has(key.toUpperCase())) {
      delete env[key];
    }
  });
  return env;
}
