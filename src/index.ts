#!/usr/bin/env node

import { exec } from 'node:child_process';
import { DiagramStore } from './server/store.js';
import { FlowCraftWebServer } from './server/web-server.js';
import { FlowCraftMcpServer } from './mcp/server.js';

async function checkExistingMaster(port = 3344): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 400);
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as any;
      return Boolean(data && data.status === 'ok');
    }
  } catch (_) {}
  return false;
}

function openBrowser(url: string) {
  try {
    const cmd = process.platform === 'win32'
      ? `start ${url}`
      : process.platform === 'darwin'
      ? `open ${url}`
      : `xdg-open ${url}`;
    exec(cmd);
  } catch (_) {}
}

async function main() {
  const store = new DiagramStore();
  const defaultPort = parseInt(process.env.PORT || '3344', 10);
  const masterAlreadyRunning = await checkExistingMaster(defaultPort);

  if (masterAlreadyRunning) {
    const masterUrl = `http://127.0.0.1:${defaultPort}`;
    console.error(`\n========================================================`);
    console.error(`  ⚡ FlowCraft Flowchart Engine & MCP Server v1.0.0 ⚡  `);
    console.error(`========================================================`);
    console.error(`  🔗 Attached to Running Master Instance: ${masterUrl}`);
    console.error(`  🤖 MCP Transport: stdio (JSON-RPC bridge to Master)`);
    console.error(`========================================================\n`);

    if (process.stdin.isTTY) {
      openBrowser(masterUrl);
    }

    const mcpServer = new FlowCraftMcpServer(store, undefined, masterUrl);
    await mcpServer.startWithStdio();
    return;
  }

  const webServer = new FlowCraftWebServer(store, { port: defaultPort });

  try {
    const port = await webServer.start();
    console.error(`\n========================================================`);
    console.error(`  ⚡ FlowCraft Flowchart Engine & MCP Server v1.0.0 ⚡  `);
    console.error(`========================================================`);
    console.error(`  🎨 Live Interactive Web Canvas: http://localhost:${port}`);
    console.error(`  🤖 MCP Transport: stdio (JSON-RPC)`);
    console.error(`  💾 Persistent Storage: ~/.flowcraft/diagrams`);
    console.error(`========================================================\n`);

    if (process.stdin.isTTY) {
      openBrowser(`http://localhost:${port}`);
    }

    const mcpServer = new FlowCraftMcpServer(store, webServer.getHub());
    await mcpServer.startWithStdio();
  } catch (err) {
    console.error('[FlowCraft] Error starting server:', err);
    process.exit(1);
  }
}

main();
