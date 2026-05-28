"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readConfig = readConfig;
exports.onConfigChange = onConfigChange;
const vscode = require("vscode");
const constants_1 = require("./constants");
function readConfig() {
    const config = vscode.workspace.getConfiguration('orbit');
    return {
        health: {
            endpoint: config.get(constants_1.CONFIG_KEYS.HEALTH_ENDPOINT, 'http://127.0.0.1:3000'),
            token: config.get(constants_1.CONFIG_KEYS.HEALTH_TOKEN, ''),
            pollingIntervalSeconds: config.get(constants_1.CONFIG_KEYS.HEALTH_POLLING_INTERVAL, 30),
            enabled: config.get(constants_1.CONFIG_KEYS.HEALTH_ENABLED, true),
        },
        debug: {
            endpoint: config.get(constants_1.CONFIG_KEYS.DEBUG_ENDPOINT, 'http://127.0.0.1:3001'),
            token: config.get(constants_1.CONFIG_KEYS.DEBUG_TOKEN, ''),
            enabled: config.get(constants_1.CONFIG_KEYS.DEBUG_ENABLED, true),
            maxSessionsShown: config.get(constants_1.CONFIG_KEYS.DEBUG_MAX_SESSIONS, 50),
            autoTrackVscodeSessions: config.get(constants_1.CONFIG_KEYS.DEBUG_AUTO_TRACK, false),
        },
        a2a: {
            registryUrl: config.get(constants_1.CONFIG_KEYS.A2A_REGISTRY_URL, 'http://127.0.0.1:3099'),
            cliPath: config.get(constants_1.CONFIG_KEYS.A2A_CLI_PATH, 'a2a-warp'),
            enabled: config.get(constants_1.CONFIG_KEYS.A2A_ENABLED, true),
            autoValidateOnSave: config.get(constants_1.CONFIG_KEYS.A2A_AUTO_VALIDATE, true),
        },
    };
}
function onConfigChange(handler) {
    return vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('orbit')) {
            handler(readConfig());
        }
    });
}
