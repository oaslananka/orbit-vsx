export function createElectronHostEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...source };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VSCODE_DEV;
  return env;
}
