export const VIEW_IDS = {
  HEALTH: 'orbit.health',
  DEBUG: 'orbit.debug',
  A2A: 'orbit.a2a',
  MCP_EXPLORER: 'orbit.mcp.explorer',
} as const;

export const COMMAND_IDS = {
  HEALTH_REFRESH: 'orbit.health.refresh',
  HEALTH_ADD_SERVER: 'orbit.health.addServer',
  HEALTH_REMOVE_SERVER: 'orbit.health.removeServer',
  HEALTH_OPEN_DETAIL: 'orbit.health.openDetail',
  HEALTH_CHECK_ALL: 'orbit.health.checkAll',
  HEALTH_SET_TOKEN: 'orbit.health.setToken',
  HEALTH_CLEAR_TOKEN: 'orbit.health.clearToken',
  DEBUG_SET_TOKEN: 'orbit.debug.setToken',
  DEBUG_CLEAR_TOKEN: 'orbit.debug.clearToken',
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
} as const;

export const CONFIG_KEYS = {
  HEALTH_ENDPOINT: 'orbit.health.endpoint',
  HEALTH_TOKEN: 'orbit.health.token',
  HEALTH_POLLING_INTERVAL: 'orbit.health.pollingIntervalSeconds',
  HEALTH_ENABLED: 'orbit.health.enabled',
  HEALTH_ALERT_ON_DOWN: 'orbit.health.alertOnDown',
  HEALTH_ALERT_ON_RECOVER: 'orbit.health.alertOnRecover',
  DEBUG_ENDPOINT: 'orbit.debug.endpoint',
  DEBUG_TOKEN: 'orbit.debug.token',
  DEBUG_ENABLED: 'orbit.debug.enabled',
  DEBUG_MAX_SESSIONS: 'orbit.debug.maxSessionsShown',
  DEBUG_AUTO_TRACK: 'orbit.debug.autoTrackVscodeSessions',
  DEBUG_SHOW_EDITOR_DECORATIONS: 'orbit.debug.showEditorDecorations',
  A2A_REGISTRY_URL: 'orbit.a2a.registryUrl',
  A2A_CLI_PATH: 'orbit.a2a.cliPath',
  A2A_ENABLED: 'orbit.a2a.enabled',
  A2A_AUTO_VALIDATE: 'orbit.a2a.autoValidateOnSave',
  A2A_LOCAL_CARD_SCAN_LIMIT: 'orbit.a2a.localCardScanLimit',
  A2A_LOCAL_CARD_EXCLUDE_GLOB: 'orbit.a2a.localCardExcludeGlob',
  MCP_EXPLORER_ENABLED: 'orbit.mcp.explorer.enabled',
} as const;

export const VIEW_ITEM_CONTEXT = {
  MCP_SERVER: 'mcpServer',
  DEBUG_SESSION: 'debugSession',
  A2A_AGENT: 'a2aAgent',
} as const;

export const ORBIT_VIEW_CONTAINER_COMMAND = 'workbench.view.extension.orbit';

export const MCP_SERVER_DEFINITION_PROVIDER_ID = 'orbit.mcp.provider';

export const MCP_EXPLORER_LABEL = 'MCP Connections';

export const OUTPUT_CHANNEL_NAME = 'Orbit';
