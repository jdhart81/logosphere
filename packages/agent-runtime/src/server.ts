import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { append, replay } from '../../reasoning-core/src/core.js';
import { LeanVerifier, type Verifier } from '../../verifier/src/index.js';

export type ServerOptions = { token: string; allowedOrigin?: string; port: number; verifier?: Verifier };
export function verificationServer(options: ServerOptions) {
  let active = false;
  const verifier = options.verifier ?? new LeanVerifier();
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const send = (status: number, data: unknown) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(data)); };
    if (request.headers.host !== `127.0.0.1:${options.port}`) return send(403, { error: 'Invalid host' });
    const origin = request.headers.origin;
    if (origin && origin !== options.allowedOrigin) return send(403, { error: 'Origin is not paired' });
    if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin'); }
    if (request.url !== '/verify') return send(404, { error: 'Not found' });
    if (request.method === 'OPTIONS') {
      if (!origin || request.headers['access-control-request-method'] !== 'POST') return send(403, { error: 'Invalid preflight' });
      response.setHeader('Access-Control-Allow-Methods', 'POST'); response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      response.writeHead(204); response.end(); return;
    }
    const supplied = Buffer.from(request.headers.authorization ?? ''); const expected = Buffer.from(`Bearer ${options.token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(401, { error: 'Pairing token required' });
    if (request.method !== 'POST' || request.headers['content-type'] !== 'application/json') return send(415, { error: 'POST application/json required' });
    if (active) return send(429, { error: 'Verifier busy; retry after current job' });
    active = true;
    try {
      let bytes = 0; const chunks: Buffer[] = [];
      for await (const chunk of request) {
        const buffer = Buffer.from(chunk); bytes += buffer.length;
        if (bytes > 2_000_000) { send(413, { error: 'Request exceeds 2 MB' }); request.resume(); return; }
        chunks.push(buffer);
      }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || typeof body !== 'object' || !('artifact' in body) || !('edgeId' in body) || typeof body.edgeId !== 'string' || Object.keys(body).some(k => !['artifact', 'edgeId'].includes(k))) throw new Error('Invalid request');
      const graph = await replay(body.artifact);
      const receipt = await verifier.verify(graph, body.edgeId);
      const artifact = await append(graph.artifact, { id: 'local:lean-verifier', kind: 'system' }, [{ type: 'verification', value: receipt }]);
      send(200, { artifact, receiptId: receipt.id });
    } catch { send(400, { error: 'Invalid artifact or verification request; no graph was persisted.' }); }
    finally { active = false; }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000; server.timeout = 15_000; server.maxRequestsPerSocket = 20;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = 4318;
  const allowedOrigin = process.env.LOGOSPHERE_EXTENSION_ORIGIN;
  if (allowedOrigin && !/^chrome-extension:\/\/[a-p]{32}$/.test(allowedOrigin)) throw new Error('LOGOSPHERE_EXTENSION_ORIGIN must be chrome-extension:// followed by the extension ID');
  const token = randomBytes(32).toString('hex');
  const server = verificationServer({ token, port, ...(allowedOrigin ? { allowedOrigin } : {}) });
  server.listen(port, '127.0.0.1', () => {
    process.stderr.write(`Logosphere local verifier: http://127.0.0.1:${port}\nPaired extension: ${allowedOrigin ?? 'none (CLI only)'}\nTemporary pairing token: ${token}\nNo capture or graph persistence. Stop with Ctrl-C.\n`);
  });
}
