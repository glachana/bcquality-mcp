import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE_REPO = path.resolve(__dirname, '..', 'fixtures', 'mini-repo');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'dist', 'index.js');

interface RpcResponse {
  jsonrpc: string;
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

class StdioClient {
  private proc: ChildProcessWithoutNullStreams;
  private buf = '';
  private pending = new Map<number, (r: RpcResponse) => void>();
  private nextId = 1;

  constructor(env: Record<string, string>) {
    this.proc = spawn('node', [SERVER_ENTRY], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    this.proc.stdout.on('data', (d) => this.onData(d.toString()));
    this.proc.stderr.on('data', () => {
      /* swallow boot logs */
    });
  }

  private onData(chunk: string) {
    this.buf += chunk;
    let idx: number;
    while ((idx = this.buf.indexOf('\n')) !== -1) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as RpcResponse;
        if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
          this.pending.get(msg.id)!(msg);
          this.pending.delete(msg.id);
        }
      } catch {
        /* not a JSON-RPC frame */
      }
    }
  }

  async send(method: string, params: unknown = {}): Promise<RpcResponse> {
    const id = this.nextId++;
    const msg = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, resolve);
      this.proc.stdin.write(JSON.stringify(msg) + '\n');
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timeout waiting for ${method}`));
        }
      }, 5000);
    });
  }

  notify(method: string, params: unknown = {}) {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  close() {
    this.proc.kill();
  }
}

describe('E2E stdio against fixture mini-repo', () => {
  let client: StdioClient;

  beforeAll(() => {
    if (!fs.existsSync(SERVER_ENTRY)) {
      throw new Error(`Missing build artifact: ${SERVER_ENTRY}. Run 'npm run build' first.`);
    }
    client = new StdioClient({
      BCQUALITY_REPO_PATH: FIXTURE_REPO,
      BCQUALITY_AUTO_CLONE: 'false',
    });
  });

  afterAll(() => {
    client.close();
  });

  it('responds to initialize with protocolVersion', async () => {
    const r = await client.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'vitest', version: '1' },
    });
    expect(r.result).toBeDefined();
    const result = r.result as { protocolVersion: string; serverInfo: { name: string } };
    expect(result.protocolVersion).toBe('2024-11-05');
    expect(result.serverInfo.name).toBe('bcquality-mcp');
    client.notify('notifications/initialized');
  });

  it('lists all 10 expected tools', async () => {
    const r = await client.send('tools/list');
    const tools = (r.result as { tools: Array<{ name: string }> }).tools;
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'bcquality_get_applicable_for_context',
        'bcquality_get_examples',
        'bcquality_get_knowledge',
        'bcquality_get_skill',
        'bcquality_list_domains',
        'bcquality_list_knowledge',
        'bcquality_list_skills',
        'bcquality_refresh',
        'bcquality_search_knowledge',
        'bcquality_status',
      ].sort(),
    );
  });

  it('bcquality_list_domains returns performance + security domains from fixture', async () => {
    const r = await client.send('tools/call', {
      name: 'bcquality_list_domains',
      arguments: {},
    });
    const sc = (r.result as { structuredContent: { domains: Array<{ name: string }> } }).structuredContent;
    const names = sc.domains.map((d) => d.name).sort();
    expect(names).toContain('performance');
    expect(names).toContain('security');
  });

  it('bcquality_get_knowledge parses sections of the fixture file', async () => {
    const r = await client.send('tools/call', {
      name: 'bcquality_get_knowledge',
      arguments: {
        path: 'microsoft/knowledge/performance/use-isempty-for-existence-check.md',
      },
    });
    const sc = (r.result as { structuredContent: { title: string; sections: { description?: string; bestPractice?: string; antiPattern?: string } } }).structuredContent;
    expect(sc.title).toBe('Use IsEmpty for existence checks');
    expect(sc.sections.description).toContain('IsEmpty');
    expect(sc.sections.bestPractice).toBeDefined();
    expect(sc.sections.antiPattern).toBeDefined();
  });

  it('bcquality_get_examples returns both .good.al and .bad.al', async () => {
    const r = await client.send('tools/call', {
      name: 'bcquality_get_examples',
      arguments: {
        knowledgePath: 'microsoft/knowledge/performance/use-isempty-for-existence-check.md',
      },
    });
    const sc = (r.result as { structuredContent: { good?: { content: string }; bad?: { content: string } } }).structuredContent;
    expect(sc.good?.content).toContain('IsEmpty()');
    expect(sc.bad?.content).toContain('FindFirst()');
  });

  it('bcquality_get_applicable_for_context applies layer precedence', async () => {
    const r = await client.send('tools/call', {
      name: 'bcquality_get_applicable_for_context',
      arguments: {
        goal: 'isempty existence check',
        technologies: ['al'],
        limit: 10,
      },
    });
    const sc = (r.result as {
      structuredContent: {
        applicable: Array<{ path: string; layer: string }>;
        suppressed: Array<{ path: string; layer: string; supersededBy: string }>;
      };
    }).structuredContent;
    // The slug exists in microsoft/, community/ AND custom/. Custom must win.
    const isemptyKept = sc.applicable.find((a) => a.path.includes('use-isempty-for-existence-check'));
    expect(isemptyKept?.layer).toBe('custom');
    const suppressedLayers = sc.suppressed.map((s) => s.layer).sort();
    expect(suppressedLayers).toContain('community');
    expect(suppressedLayers).toContain('microsoft');
  });

  it('bcquality_status reports the fixture repo source as env', async () => {
    const r = await client.send('tools/call', {
      name: 'bcquality_status',
      arguments: {},
    });
    const sc = (r.result as { structuredContent: { source: string; layers: Array<{ name: string; articleCount: number }> } }).structuredContent;
    expect(sc.source).toBe('env');
    const cu = sc.layers.find((l) => l.name === 'custom');
    expect(cu?.articleCount).toBe(1);
  });
});
