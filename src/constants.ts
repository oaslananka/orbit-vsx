export const VIEW_IDS = {
  HEALTH: 'orbit.health',
  DEBUG: 'orbit.debug',
  A2A: 'orbit.a2a',
  INFO: 'orbit.info',
  MCP_EXPLORER: 'orbit.mcp.explorer',
  SESSIONS: 'orbit.sessions',
  TASKS: 'orbit.tasks',
} as const;

export const COMMAND_IDS = {
  HEALTH_REFRESH: 'orbit.health.refresh',
  HEALTH_ADD_SERVER: 'orbit.health.addServer',
  HEALTH_REMOVE_SERVER: 'orbit.health.removeServer',
  HEALTH_OPEN_DETAIL: 'orbit.health.openDetail',
  HEALTH_CHECK_ALL: 'orbit.health.checkAll',
  DEBUG_NEW_SESSION: 'orbit.debug.newSession',
  DEBUG_REFRESH: 'orbit.debug.refresh',
  DEBUG_OPEN_SESSION: 'orbit.debug.openSession',
  DEBUG_CLOSE_SESSION: 'orbit.debug.closeSession',
  DEBUG_SEARCH: 'orbit.debug.search',
  DEBUG_RECORD_COMMAND: 'orbit.debug.recordCommand',
  A2A_REFRESH: 'orbit.a2a.refresh',
  A2A_VALIDATE: 'orbit.a2a.validate',
  A2A_DISCOVER: 'orbit.a2a.discover',
  A2A_SCAFFOLD: 'orbit.a2a.scaffold',
  A2A_OPEN_CARD: 'orbit.a2a.openCard',
  MCP_EXPLORER_REFRESH: 'orbit.mcp.explorer.refresh',
  SESSIONS_REFRESH: 'orbit.sessions.refresh',
} as const;

export const CONFIG_KEYS = {
  HEALTH_ENDPOINT: 'orbit.health.endpoint',
  HEALTH_TOKEN: 'orbit.health.token',
  HEALTH_POLLING_INTERVAL: 'orbit.health.pollingIntervalSeconds',
  HEALTH_ENABLED: 'orbit.health.enabled',
  DEBUG_ENDPOINT: 'orbit.debug.endpoint',
  DEBUG_TOKEN: 'orbit.debug.token',
  DEBUG_ENABLED: 'orbit.debug.enabled',
  DEBUG_MAX_SESSIONS: 'orbit.debug.maxSessionsShown',
  DEBUG_AUTO_TRACK: 'orbit.debug.autoTrackVscodeSessions',
  A2A_REGISTRY_URL: 'orbit.a2a.registryUrl',
  A2A_CLI_PATH: 'orbit.a2a.cliPath',
  A2A_ENABLED: 'orbit.a2a.enabled',
  A2A_AUTO_VALIDATE: 'orbit.a2a.autoValidateOnSave',
  MCP_EXPLORER_ENABLED: 'orbit.mcp.explorer.enabled',
  INFO_ENABLED: 'orbit.info.enabled',
  SESSIONS_ENABLED: 'orbit.sessions.enabled',
  TASKS_ENABLED: 'orbit.tasks.enabled',
} as const;

export const VIEW_ITEM_CONTEXT = {
  MCP_SERVER: 'mcpServer',
  DEBUG_SESSION: 'debugSession',
  A2A_AGENT: 'a2aAgent',
} as const;

export const MCP_EXPLORER_LABEL = 'MCP Connections';

export const OUTPUT_CHANNEL_NAME = 'Orbit';
