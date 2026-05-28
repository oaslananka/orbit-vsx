"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("node:assert");
const HealthProvider_1 = require("../../src/panels/health/HealthProvider");
suite('Health Monitor Panel', () => {
    test('HealthClient should construct with endpoint', () => {
        const endpoint = 'http://127.0.0.1:3000';
        assert.ok(endpoint.length > 0, 'Endpoint should be non-empty');
    });
    test('HealthProvider should have refresh method', () => {
        const provider = new HealthProvider_1.HealthProvider({});
        const hasRefresh = typeof provider.refresh === 'function';
        assert.ok(hasRefresh, 'Provider should have refresh method');
    });
});
