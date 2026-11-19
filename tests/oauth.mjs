import assert from 'node:assert/strict';
import { createOAuthAccessToken, verifyOAuthAccessToken } from '../oauth.mjs';

const credentials = { clientId: 'argondesk-test-client', clientSecret: 'test-client-secret-value' };
const context = { issuer: 'https://workspace.example', resource: 'https://workspace.example/mcp/test-key', now: 1_800_000_000 };
const token = createOAuthAccessToken({ ...credentials, ...context });

assert.equal(verifyOAuthAccessToken({ token, ...credentials, ...context }), true);
assert.equal(verifyOAuthAccessToken({ token, ...credentials, ...context, clientSecret: 'wrong-secret' }), false);
assert.equal(verifyOAuthAccessToken({ token, ...credentials, ...context, resource: 'https://workspace.example/mcp/other-key' }), false);
assert.equal(verifyOAuthAccessToken({ token, ...credentials, ...context, now: context.now + 3601 }), false);
assert.equal(verifyOAuthAccessToken({ token: token + 'x', ...credentials, ...context }), false);
console.log(JSON.stringify({ passed: true, oauthChecks: 5 }));
