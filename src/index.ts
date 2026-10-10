import fs from 'node:fs';
import path from 'node:path';
import { exec, spawn } from 'node:child_process';
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

function startTrayIcon(port: number) {
  if (process.platform !== 'win32') return;

  try {
    const exeDir = path.dirname(process.execPath);
    const trayCandidates = [
      path.join(exeDir, 'FlowCraftTray.exe'),
      path.join(process.cwd(), 'dist', 'FlowCraftTray.exe'),
      path.join(process.cwd(), 'FlowCraftTray.exe')
    ];

    // Также проверяем любые папки внутри release/
    try {
      const releaseRoot = path.join(process.cwd(), 'release');
      if (fs.existsSync(releaseRoot)) {
        fs.readdirSync(releaseRoot).forEach(d => {
          trayCandidates.push(path.join(releaseRoot, d, 'FlowCraftTray.exe'));
        });
      }
    } catch (_) {}

    const trayExe = trayCandidates.find(p => fs.existsSync(p));
    if (trayExe) {
      const child = spawn(trayExe, [String(port), String(process.pid)], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();
    }
  } catch (_) {}
}

async function main() {
  const store = new DiagramStore();
  const defaultPort = parseInt(process.env.PORT || '3344', 10);
  const masterAlreadyRunning = await checkExistingMaster(defaultPort);

  if (masterAlreadyRunning) {
    const masterUrl = `http://127.0.0.1:${defaultPort}`;
    console.error(`\n========================================================`);
    console.error(`  ⚡ FlowCraft Flowchart Engine & MCP Server v1.1.0 ⚡  `);
    console.error(`========================================================`);
    console.error(`  🔗 Attached to Running Master Instance: ${masterUrl}`);
    console.error(`  🤖 MCP Transport: stdio (JSON-RPC bridge to Master)`);
    console.error(`========================================================\n`);

    const shouldOpenBrowser = process.argv.includes('--open') || Boolean(process.stdin.isTTY);
    if (shouldOpenBrowser) {
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
    console.error(`  ⚡ FlowCraft Flowchart Engine & MCP Server v1.1.0 ⚡  `);
    console.error(`========================================================`);
    console.error(`  🎨 Live Interactive Web Canvas: http://localhost:${port}`);
    console.error(`  🤖 MCP Transport: stdio (JSON-RPC)`);
    console.error(`  💾 Persistent Storage: ~/.flowcraft/diagrams`);
    console.error(`  🔔 System Tray Icon Active (Notification Area)`);
    console.error(`========================================================\n`);

    startTrayIcon(port);

    const shouldOpenBrowser = process.argv.includes('--open') || Boolean(process.stdin.isTTY);
    if (shouldOpenBrowser) {
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
