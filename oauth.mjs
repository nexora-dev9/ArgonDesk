import crypto from 'node:crypto';

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

export function createOAuthAccessToken({ clientId, clientSecret, issuer, resource, now = Math.floor(Date.now() / 1000), expiresIn = 3600 }) {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ iss: issuer, sub: clientId, aud: resource, scope: 'mcp', iat: now, exp: now + expiresIn, jti: crypto.randomUUID() });
  const input = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', clientSecret).update(input).digest('base64url');
  return `${input}.${signature}`;
}

export function verifyOAuthAccessToken({ token, clientId, clientSecret, issuer, resource, now = Math.floor(Date.now() / 1000) }) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const input = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(crypto.createHmac('sha256', clientSecret).update(input).digest('base64url'));
  const supplied = Buffer.from(parts[2]);
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return false;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return header.alg === 'HS256' && payload.iss === issuer && payload.sub === clientId &&
      payload.aud === resource && payload.scope === 'mcp' &&
      Number.isSafeInteger(payload.iat) && payload.iat <= now + 60 &&
      Number.isSafeInteger(payload.exp) && payload.exp > now && payload.exp - payload.iat <= 3600;
  } catch { return false; }
}
