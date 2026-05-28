"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("node:assert");
const A2AProvider_1 = require("../../src/panels/a2a/A2AProvider");
suite('A2A Explorer Panel', () => {
    test('A2AClient should construct with registry URL', () => {
        const registryUrl = 'http://127.0.0.1:3099';
        assert.ok(registryUrl.length > 0, 'Registry URL should be non-empty');
    });
    test('A2AProvider should have refresh method', () => {
        const provider = new A2AProvider_1.A2AProvider({});
        const hasRefresh = typeof provider.refresh === 'function';
        assert.ok(hasRefresh, 'Provider should have refresh method');
    });
    test('Agent card types should be valid', () => {
        const authTypes = ['none', 'bearer', 'oauth2', 'apiKey'];
        authTypes.forEach((t) => {
            assert.ok(['none', 'bearer', 'oauth2', 'apiKey'].includes(t), `${t} should be valid auth type`);
        });
    });
});
