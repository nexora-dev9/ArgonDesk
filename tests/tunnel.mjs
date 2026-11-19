import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Tunnel, validateDomain, buildTrafficPolicy } from '../tunnel.mjs';

const base = fileURLToPath(new URL('../', import.meta.url));
const stateRoot = path.join(base, '.local', 'tests', 'tunnel-' + randomUUID());
fs.mkdirSync(stateRoot, {recursive:true});
let config = {publicBase:'', tunnelAutoStart:false};
const tunnel = new Tunnel({base,stateRoot,port:3008,getConfig:()=>config,update:value=>{config={...config,...value};}});
for (const value of ['sample.ngrok-free.dev','https://sample.ngrok-free.app/','https://sample.ngrok.app']) assert.ok(validateDomain(value).startsWith('https://'));
for (const value of ['http://sample.ngrok-free.dev','https://sample.ngrok-free.dev/mcp/private','https://user:password@sample.ngrok-free.dev','https://sample.ngrok-free.dev?secret=value','https://unrelated.example','https://sample.ngrok-free.dev:3333']) assert.throws(()=>validateDomain(value));
const dummy = 'LOCAL_TEST_ONLY_' + randomUUID().replaceAll('-','');
await tunnel.configure({domain:'https://sample.ngrok-free.dev',token:dummy,autoStart:false});
const encrypted = fs.readFileSync(tunnel.tokenPath,'utf8');
assert.ok(encrypted.length>dummy.length);
assert.ok(!encrypted.includes(dummy));
assert.equal(tunnel.info().configured,true);
assert.ok(!JSON.stringify(tunnel.info()).includes(dummy));
const plaintext = await new Promise((resolve,reject)=>{
 const p=spawn(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-File',path.join(base,'secret.ps1'),'-Mode','Unprotect'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let output='';p.stdout.on('data',b=>output+=b);p.stderr.resume();p.on('error',reject);p.on('close',code=>code?reject(new Error('Windows credential protection failed')):resolve(output.trim()));p.stdin.end(encrypted);
});
assert.equal(plaintext,dummy);
await assert.rejects(()=>tunnel.configure({domain:'https://unrelated.example',token:'BAD',autoStart:true}));
assert.equal(fs.readFileSync(tunnel.tokenPath,'utf8'),encrypted);
await tunnel.configure({domain:'sample.ngrok-free.dev',token:'',autoStart:true});
assert.equal(config.tunnelAutoStart,true);
assert.equal(fs.readFileSync(tunnel.tokenPath,'utf8'),encrypted);
const policyExpression = buildTrafficPolicy({ key: 'test-capability-key' }).on_http_request[0].expressions[0];
for (const route of ['/mcp', '/mcp/test-capability-key', '/.well-known/google-connected-apps', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/oauth/token', '/privacy', '/terms', '/help']) {
  assert.ok(policyExpression.includes(`req.url.path != '${route}'`));
}
assert.ok(policyExpression.includes(' && '));
await tunnel.stop();
assert.equal(tunnel.info().status,'stopped');
console.log(JSON.stringify({passed:true,checks:['ngrok domain validation','Windows DPAPI round trip','saved credential never returned in status','invalid settings preserve credential','empty token keeps saved credential','public route allowlist','stop with no child is safe'],networkConnectionsStarted:0}));
