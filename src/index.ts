#!/usr/bin/env node

import { DiagramStore } from './server/store.js';
import { FlowCraftWebServer } from './server/web-server.js';
import { FlowCraftMcpServer } from './mcp/server.js';

async function main() {
  const store = new DiagramStore();
  const webServer = new FlowCraftWebServer(store);

  try {
    const port = await webServer.start();
    console.error(`\n========================================================`);
    console.error(`  ⚡ FlowCraft Flowchart Engine & MCP Server v1.0.0 ⚡  `);
    console.error(`========================================================`);
    console.error(`  🎨 Live Interactive Web Canvas: http://localhost:${port}`);
    console.error(`  🤖 MCP Transport: stdio (JSON-RPC)`);
    console.error(`  💾 Persistent Auto-Save: .flowcraft/diagram.json`);
    console.error(`========================================================\n`);

    if (process.platform === 'win32' && process.stdin.isTTY) {
      try {
        const { exec } = await import('node:child_process');
        exec(`start http://localhost:${port}`);
      } catch (_) {}
    }

    const mcpServer = new FlowCraftMcpServer(store, webServer.getHub());
    await mcpServer.startWithStdio();
  } catch (err) {
    console.error('[FlowCraft] Error starting server:', err);
    process.exit(1);
  }
}

main();
