/**
 * Vercel-compatible local Lambda smoke test.
 *
 * Simulates how @vercel/node builds an API function in ESM mode: every `.ts`
 * file under api/ and server/ is transpiled one-by-one to `.js` (imports
 * preserved, NOT bundled) into a lambda tree, then executed by Node.
 *
 * The function tree uses explicit `.js` extensions on all relative imports
 * (the Node ESM requirement). Without them, @vercel/node emits the exact
 * runtime failure this smoke guards against:
 *
 *   Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/server/app'
 *   imported from '/var/task/api/index.js'
 *
 * Endpoint assertions (node:native fetch against the built tree):
 *   A. GET  /api/health            -> 200, success envelope, status "ok"
 *   B. POST /api/allocation/check  -> 503 NFT_CONTRACT_NOT_CONFIGURED when
 *                                     WAZI_NFT_CONTRACT_ADDRESS is blank
 *                                     (valuable structure error, never a crash)
 *   C. POST /api/allocation/check  -> 400 INVALID_ADDRESS for a bad wallet
 *
 * Usage:
 *   node scripts/vercel-lambda-smoke.mjs
 */
import { transform } from 'esbuild';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(root, '.smoke-lambda', 'esm');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`SMOKE ASSERTION FAILED: ${message}`);
  }
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

async function buildLambdaTree() {
  await fs.rm(outRoot, { recursive: true, force: true });

  const sources = [];
  for (const dir of ['api', 'server']) {
    for (const file of await walk(path.join(root, dir))) {
      sources.push(path.relative(root, file));
    }
  }
  if (sources.length === 0) throw new Error(`No .ts sources found under ${root}/api or ${root}/server`);

  for (const rel of sources) {
    const code = await fs.readFile(path.join(root, rel), 'utf8');
    const result = await transform(code, {
      loader: 'ts',
      format: 'esm',
      target: 'node18',
    });
    const outFile = path.join(outRoot, rel.replace(/\.ts$/, '.js'));
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, result.code);
  }

  const launcher = `
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
process.on('uncaughtException', (error) => {
  console.error(error);
  process.exit(1);
});
process.on('unhandledRejection', (error) => {
  console.error(error);
  process.exit(1);
});
const mod = await import(pathToFileURL(path.join(import.meta.dirname, 'api', 'index.js')).href);
const handler = mod.default || mod;
if (typeof handler !== 'function') {
  console.error('handler is not a function');
  process.exit(2);
}
const server = http.createServer((req, res) => handler(req, res));
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  console.log('PORT=' + address.port);
});
setTimeout(() => {
  server.close(() => process.exit(0));
}, 12000);
`;
  await fs.writeFile(path.join(outRoot, 'launcher.mjs'), launcher);
}

/**
 * Spawns the built lambda and resolves with its port once the launcher reports
 * it. The caller must call stop() to terminate the child.
 */
async function runLambda() {
  const dbDir = path.join(outRoot, 'data');
  await fs.mkdir(dbDir, { recursive: true });
  const child = spawn(process.execPath, [path.join(outRoot, 'launcher.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      ALLOCATION_STORE: 'sqlite',
      ALLOCATION_DB_PATH: path.join(dbDir, 'allocations.sqlite'),
      WAZI_NFT_CONTRACT_ADDRESS: '',
      ALCHEMY_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const port = await new Promise((resolve, reject) => {
    const lines = readline.createInterface({ input: child.stdout });
    const timer = setTimeout(() => {
      reject(new Error(`lambda did not report a port in time. stderr=${stderr.slice(0, 500)}`));
    }, 30_000);
    lines.on('line', (line) => {
      const match = String(line).match(/PORT=(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.on('error', (error) => reject(error));
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`lambda exited early (code ${code}). stderr=${stderr.slice(0, 500)}`));
      }
    });
  });

  return {
    port,
    stop() {
      child.kill();
    },
  };
}

async function fetchJson(port, url, init) {
  const res = await fetch(`http://127.0.0.1:${port}${url}`, init);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function main() {
  await buildLambdaTree();
  const lambda = await runLambda();
  const port = lambda.port;
  try {
    // A. GET /api/health
    const health = await fetchJson(port, '/api/health');
    assert(health.status === 200, `health status=${health.status}`);
    assert(health.body?.success === true, `health success=${JSON.stringify(health.body)}`);
    assert(health.body?.data?.status === 'ok', `health body=${JSON.stringify(health.body)}`);

    // B. POST /api/allocation/check, valid wallet, blank WAZI NFT contract
    const valid = '0x71C44F3a9B3f6b4E90B04aF5796E25bB24F88F29';
    const check = await fetchJson(port, '/api/allocation/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: valid }),
    });
    assert(check.status === 503, `NFT_CONFIGURED status=${check.status} body=${JSON.stringify(check.body)}`);
    assert(check.body?.success === false, `NFT_CONFIGURED success=${JSON.stringify(check.body)}`);
    assert(
      check.body?.error?.code === 'NFT_CONTRACT_NOT_CONFIGURED',
      `NFT_CONFIGURED code=${check.body?.error?.code}`,
    );

    // C. POST /api/allocation/check, invalid wallet
    const invalid = await fetchJson(port, '/api/allocation/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: '0xnot-an-address' }),
    });
    assert(invalid.status === 400, `INVALID_ADDRESS status=${invalid.status}`);
    assert(invalid.body?.error?.code === 'INVALID_ADDRESS', `INVALID_ADDRESS code=${invalid.body?.error?.code}`);

    console.log('[esm] PASS  GET  /api/health           -> 200 {"success":true,"data":{"status":"ok",...}}');
    console.log('[esm] PASS  POST /api/allocation/check -> 503 NFT_CONTRACT_NOT_CONFIGURED (blank contract, no module crash)');
    console.log('[esm] PASS  POST /api/allocation/check -> 400 INVALID_ADDRESS');
    console.log('[esm] Vercel-compatible Lambda gateway: all endpoint assertions passed.');
  } finally {
    lambda.stop();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});