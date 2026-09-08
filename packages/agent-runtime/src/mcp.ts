import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { CommandSchema, Runtime } from '../../sdk/src/index.js';
import { FileStore } from '../../storage/src/index.js';
import { LeanVerifier } from '../../verifier/src/index.js';
import { boundJson } from '../../reasoning-core/src/core.js';

const URI = 'logosphere://graph';
const instructions = 'Reasoning is canonical. Lean checks conditional deductions, not empirical truth. Imported proof claims require reproduction. OBSERVE processes caller-supplied text locally.';
export class McpSession {
  private initialized = false;
  private subscribed = false;
  private readonly unsubscribe: () => void;
  constructor(private readonly runtime: Runtime, notify: (message: unknown) => void) {
    this.unsubscribe = runtime.subscribe(() => { if (this.subscribed) notify({ jsonrpc: '2.0', method: 'notifications/resources/updated', params: { uri: URI } }); });
  }
  close(): void { this.unsubscribe(); }
  async handle(raw: unknown): Promise<unknown | undefined> {
    let requestId: string | number | null = null;
    let notification = false;
    try {
      boundJson(raw);
      const request = z.strictObject({ jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number().int()]).optional(), method: z.string(), params: z.record(z.string(), z.unknown()).optional() }).parse(raw);
      notification = request.id === undefined; requestId = request.id ?? null;
      // Requests that mutate the graph must have a response channel.
      if (notification && !request.method.startsWith('notifications/')) return undefined;
      const p = request.params ?? {}; let result: unknown;
      if (request.method === 'initialize') {
        if (this.initialized) throw new Error('Already initialized');
        this.initialized = true;
        result = { protocolVersion: '2025-11-25', capabilities: { tools: {}, resources: { subscribe: true } }, serverInfo: { name: 'logosphere', version: '0.1.0' }, instructions };
      } else if (request.method === 'notifications/initialized' || request.method === 'notifications/cancelled') return undefined;
      else if (request.method === 'ping') result = {};
      else {
        if (!this.initialized) throw new Error('Initialize first');
        switch (request.method) {
          case 'tools/list': result = { tools: CommandSchema.options.map(schema => {
            const name = schema.shape.action.value;
            const toolSchema = z.toJSONSchema(schema);
            if (toolSchema.properties) delete toolSchema.properties.action;
            if (toolSchema.required) toolSchema.required = toolSchema.required.filter(key => key !== 'action');
            return { name, description: `${name} on the canonical local reasoning graph. ${instructions}`, inputSchema: toolSchema,
              annotations: { readOnlyHint: ['TRACE', 'COMPARE', 'SUBSCRIBE', 'RENDER'].includes(name), destructiveHint: false, idempotentHint: ['TRACE', 'COMPARE', 'SUBSCRIBE', 'RENDER'].includes(name), openWorldHint: false } };
          }) }; break;
          case 'tools/call': {
            const tool = z.strictObject({ name: z.string(), arguments: z.record(z.string(), z.unknown()).optional(), _meta: z.record(z.string(), z.unknown()).optional() }).parse(p);
            if (!CommandSchema.options.some(s => s.shape.action.value === tool.name)) throw new Error('Unknown tool');
            try {
              if (tool.arguments?.action !== undefined && tool.arguments.action !== tool.name) throw new Error('Tool/action mismatch');
              const data = await this.runtime.dispatch({ ...tool.arguments, action: tool.name });
              result = { content: [{ type: 'text', text: JSON.stringify(data) }], isError: false };
            } catch (error) { result = { content: [{ type: 'text', text: (error as Error).message }], isError: true }; }
            break;
          }
          case 'resources/list': result = { resources: [{ uri: URI, name: 'Canonical reasoning artifact', mimeType: 'application/json', description: 'Hash-linked graph events, including untrusted reported verification receipts.' }] }; break;
          case 'resources/read':
            if (p.uri !== URI) throw new Error('Unknown resource');
            result = { contents: [{ uri: URI, mimeType: 'application/json', text: JSON.stringify(this.runtime.export()) }] }; break;
          case 'resources/subscribe':
          case 'resources/unsubscribe':
            if (p.uri !== URI) throw new Error('Unknown resource');
            this.subscribed = request.method === 'resources/subscribe'; result = {}; break;
          default: return notification ? undefined : { jsonrpc: '2.0', id: requestId, error: { code: -32601, message: 'Method not found' } };
        }
      }
      return notification ? undefined : { jsonrpc: '2.0', id: requestId, result };
    } catch { return notification ? undefined : { jsonrpc: '2.0', id: requestId, error: { code: -32602, message: 'Invalid request or parameters' } }; }
  }
}

export async function startMcp(): Promise<void> {
  const store = new FileStore(process.env.LOGOSPHERE_STORE ?? '.logosphere');
  const runtime = new Runtime({ id: process.env.LOGOSPHERE_ACTOR ?? 'agent:local-mcp', kind: 'agent' }, new LeanVerifier(), await store.load(), store);
  const send = (message: unknown) => { process.stdout.write(`${JSON.stringify(message)}\n`); };
  const session = new McpSession(runtime, send);
  let buffer = ''; process.stdin.setEncoding('utf8');
  try {
    for await (const chunk of process.stdin) {
      buffer += String(chunk);
      if (Buffer.byteLength(buffer) > 2_000_000) throw new Error('MCP input exceeds 2 MB');
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        try { const result = await session.handle(JSON.parse(line)); if (result !== undefined) send(result); }
        catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
      }
    }
  } finally { session.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startMcp().catch(error => { process.stderr.write(`${(error as Error).message}\n`); process.exitCode = 1; });
