const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Load the real TypeScript implementation with only external services replaced.
function load(file, mocks = {}) {
  const filename = path.resolve(file);
  const source = fs.readFileSync(filename, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports;
}

const { NextResponse } = require('next/server');
const authMock = { hasValidOrigin: async (req) => !req.headers.get('origin') || new URL(req.headers.get('origin')).host === new URL(req.url).host };
const api = load('src/lib/api-route.ts', { './auth': authMock });

test('every form action uses a submit button, including mailbox save', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const ui = load('src/components/ui.tsx');
  const client = load('src/lib/client-api.ts');
  const mocks = { 'next/navigation': { useRouter: () => ({ push() {}, refresh() {} }) }, './ui': ui, '@/lib/client-api': client };
  const AuthForm = load('src/components/AuthForm.tsx', mocks).default;
  const AccountSettings = load('src/components/AccountSettings.tsx', mocks).default;
  const RecoveryForm = load('src/components/RecoveryForm.tsx', mocks).default;
  for (const [Component, props, label] of [
    [AuthForm, { mode: 'signup' }, 'Create account'],
    [AuthForm, { mode: 'login' }, 'Sign in'],
    [AccountSettings, { name: 'Test', email: 'test@example.com', emailVerified: true, welcome: false }, 'Save mailbox'],
    [RecoveryForm, {}, 'Send reset link'],
  ]) {
    const html = renderToStaticMarkup(React.createElement(Component, props));
    assert.match(html, new RegExp(`<button[^>]*type="submit"[^>]*>${label}</button>`));
  }
});

test('HTML server errors produce readable client errors', async () => {
  const { responseJson } = load('src/lib/client-api.ts');
  await assert.rejects(responseJson(new Response('<html>unavailable</html>', { status: 502 })), /Request failed \(502\)/);
  await assert.rejects(responseJson(NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 })), /Sign in to continue/);
});

test('API boundary returns JSON for malformed input and service failures', async () => {
  const invalid = api.apiRoute(async (req) => { await api.jsonObject(req); return NextResponse.json({ ok: true }); });
  for (const body of ['{', 'null', '[]']) {
    const result = await invalid(new Request('http://localhost/api', { method: 'POST', body }));
    assert.equal(result.status, 400);
    assert.match((await result.json()).error, /valid JSON object/);
  }
  const unavailable = api.apiRoute(async () => { throw Object.assign(new Error('private service details'), { code: 'ECONNREFUSED' }); });
  const response = await unavailable(new Request('http://localhost/api'));
  assert.equal(response.status, 503);
  assert.doesNotMatch(JSON.stringify(await response.json()), /private service details/);
});

test('cross-origin API mutations are rejected before the handler runs', async () => {
  let called = false;
  const handler = api.apiRoute(async () => { called = true; return NextResponse.json({ ok: true }); });
  const result = await handler(new Request('http://localhost/api', { method: 'POST', headers: { origin: 'https://other.example' } }));
  assert.equal(result.status, 403);
  assert.equal(called, false);
});

test('mailbox validation rejects invalid limits, headers, and TLS mismatch', () => {
  const { mailboxInput } = load('src/lib/mailbox-input.ts');
  const base = { host: 'smtp.example.com', port: 587, secure: false, username: 'me@example.com', password: 'secret', fromEmail: 'me@example.com', postalAddress: '123 Test Street', maxSendsPerDay: 40, secondsBetween: 45 };
  assert.equal(mailboxInput.safeParse(base).success, true);
  for (const patch of [{ maxSendsPerDay: 1.5 }, { secondsBetween: 0 }, { port: 465 }, { fromEmail: 'invalid' }, { secure: 'false' }, { fromName: 'name\r\nBcc: victim@example.com' }]) {
    assert.equal(mailboxInput.safeParse({ ...base, ...patch }).success, false, JSON.stringify(patch));
  }
  assert.equal(mailboxInput.safeParse({ ...base, port: 465, secure: true }).success, true);
});

test('mailbox credentials stay encrypted and reject tampering', () => {
  const mailbox = load('src/lib/mailbox.ts', { './env': { env: { credentialsEncryptionKey: 'test-only-key-never-used-in-production' } }, './db': {} });
  const encrypted = mailbox.encryptSecret('private-password');
  assert.notEqual(encrypted, 'private-password');
  assert.equal(mailbox.decryptSecret(encrypted), 'private-password');
  const parts = encrypted.split('.');
  const ciphertext = Buffer.from(parts[2], 'base64url');
  ciphertext[0] ^= 1;
  parts[2] = ciphertext.toString('base64url');
  assert.throws(() => mailbox.decryptSecret(parts.join('.')));
  const publicValue = mailbox.publicMailbox({ password: 'private-password', password_encrypted: encrypted });
  assert.equal(publicValue.hasPassword, true);
  assert.equal(Object.hasOwn(publicValue, 'password'), false);
  assert.equal(Object.hasOwn(publicValue, 'password_encrypted'), false);
});

test('failed verification delivery still creates a usable signed-in account', async () => {
  const auth = { ...authMock, findUserByEmail: async () => undefined, registerUser: async () => ({ id: 'user-test', email: 'me@example.com', email_verified: false }), createSession: async () => 'session', setSessionCookie: (response) => response.headers.set('x-test-session', 'created') };
  const { POST } = load('src/app/api/auth/signup/route.ts', {
    '@/lib/api-route': api, '@/lib/auth': auth,
    '@/lib/auth-mail': { authMailConfigured: () => true, issueAuthToken: async () => 'token', sendAuthEmail: async () => { throw new Error('SMTP unavailable'); } },
    '@/lib/env': { env: { baseUrlIsLocal: false } }, '@/lib/db': {},
  });
  const response = await POST(new Request('https://app.example/signup', { method: 'POST', body: JSON.stringify({ name: 'Test', email: 'me@example.com', password: 'a-long-test-password' }) }));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-test-session'), 'created');
  assert.match((await response.json()).warning, /account was created/);
});

test('public signup cannot auto-verify because APP_BASE_URL is misconfigured', async () => {
  let registered = false;
  const { POST } = load('src/app/api/auth/signup/route.ts', {
    '@/lib/api-route': api, '@/lib/auth': { ...authMock, registerUser: async () => { registered = true; } },
    '@/lib/auth-mail': { authMailConfigured: () => false }, '@/lib/env': { env: { baseUrlIsLocal: true } }, '@/lib/db': {},
  });
  const response = await POST(new Request('https://app.example/signup', { method: 'POST', body: JSON.stringify({ name: 'Test', email: 'me@example.com', password: 'a-long-test-password' }) }));
  assert.equal(response.status, 503);
  assert.equal(registered, false);
});

test('password reset consumes token once and invalidates sessions', async () => {
  let tokenAvailable = true;
  const changes = [];
  const { POST } = load('src/app/api/auth/reset-password/route.ts', {
    '@/lib/api-route': api,
    '@/lib/auth': { ...authMock, hashPassword: async () => 'new-hash' },
    '@/lib/auth-mail': { authTokenHash: () => 'token-hash' },
    '@/lib/db': { tx: async (fn) => fn({ query: async (query) => {
      if (query.includes('RETURNING user_id')) { const available = tokenAvailable; tokenAvailable = false; return { rows: available ? [{ user_id: 'user-test' }] : [] }; }
      changes.push(query); return { rows: [] };
    } }) },
  });
  const request = () => new Request('http://localhost/api', { method: 'POST', body: JSON.stringify({ token: 'token', password: 'a-long-test-password' }) });
  const responses = await Promise.all([POST(request()), POST(request())]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400]);
  assert.equal(changes.filter((q) => q.startsWith('UPDATE users')).length, 1);
  assert.equal(changes.filter((q) => q.startsWith('DELETE FROM sessions')).length, 1);
});

test('template imports can send without a Hunter API key', async () => {
  const saved = process.env.HUNTER_API_KEY;
  delete process.env.HUNTER_API_KEY;
  try {
    const { verifyEmail } = load('src/lib/providers/hunter.ts', { '../env': { env: {} } });
    const verdict = await verifyEmail('imported@example.com');
    assert.equal(verdict.deliverable, true);
    assert.equal(verdict.unknown, true);
  } finally {
    if (saved !== undefined) process.env.HUNTER_API_KEY = saved;
  }
});
