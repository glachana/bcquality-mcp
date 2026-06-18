#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { resolveRepo } from './repo/manager.js';
import { createContext } from './tools/shared.js';
import { registerDiscoveryTools } from './tools/discovery.js';
import { registerReadTools } from './tools/read.js';
import { registerWorkflowTools } from './tools/workflow.js';
import { registerMetaTools } from './tools/meta.js';

async function main() {
  const config = loadConfig();
  const repo = await resolveRepo(config);

  // Bootstrap log goes to stderr — stdout is reserved for MCP framing.
  console.error(
    `[bcquality-mcp] Loaded repo from ${repo.path} (source=${repo.source}, layers=${config.layers.join(',')})`,
  );

  const ctx = createContext(config, repo);
  console.error(
    `[bcquality-mcp] Indexed ${ctx.index.knowledge.length} knowledge files, ${ctx.index.skills.length} skills`,
  );

  const server = new McpServer({
    name: 'bcquality-mcp',
    version: '0.1.0',
  });

  registerDiscoveryTools(server, ctx);
  registerReadTools(server, ctx);
  registerWorkflowTools(server, ctx);
  registerMetaTools(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[bcquality-mcp] Connected on stdio.');
}

main().catch((err) => {
  console.error('[bcquality-mcp] Fatal:', err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
