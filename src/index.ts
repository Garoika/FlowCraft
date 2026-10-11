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

  const url = `http://localhost:${port}`;
  const pid = process.pid;

  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $notify = New-Object System.Windows.Forms.NotifyIcon
    $bmp = New-Object System.Drawing.Bitmap 32, 32
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(2, 132, 199))
    $g.FillEllipse($brush, 2, 2, 28, 28)
    $wbrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $pts = @(
      (New-Object System.Drawing.Point 17, 6),
      (New-Object System.Drawing.Point 11, 16),
      (New-Object System.Drawing.Point 16, 16),
      (New-Object System.Drawing.Point 14, 26),
      (New-Object System.Drawing.Point 22, 15),
      (New-Object System.Drawing.Point 17, 15),
      (New-Object System.Drawing.Point 18, 6)
    )
    $g.FillPolygon($wbrush, $pts)
    $notify.Icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
    $notify.Text = 'FlowCraft (${port})'
    $notify.Visible = $true

    $menu = New-Object System.Windows.Forms.ContextMenuStrip
    $mTitle = $menu.Items.Add('⚡ FlowCraft (Порт ${port})')
    $mTitle.Enabled = $false
    $menu.Items.Add('-') | Out-Null
    $mOpen = $menu.Items.Add('🎨 Открыть холст')
    $mOpen.Add_Click({ Start-Process '${url}' })
    $mHub = $menu.Items.Add('📂 Хаб всех схем')
    $mHub.Add_Click({ Start-Process '${url}/hub' })
    $menu.Items.Add('-') | Out-Null
    $mExit = $menu.Items.Add('❌ Закрыть FlowCraft')
    $mExit.Add_Click({
      $notify.Visible = $false
      try { Stop-Process -Id ${pid} -Force } catch {}
      [System.Windows.Forms.Application]::Exit()
    })
    $notify.ContextMenuStrip = $menu
    $notify.Add_Click({
      if ($_.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
        Start-Process '${url}'
      }
    })

    [System.Threading.ThreadPool]::QueueUserWorkItem({
      try {
        $p = [System.Diagnostics.Process]::GetProcessById(${pid})
        $p.WaitForExit()
      } catch {}
      $notify.Visible = $false
      [System.Windows.Forms.Application]::Exit()
    })

    [System.Windows.Forms.Application]::Run()
  `;

  try {
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle', 'Hidden',
      '-EncodedCommand', encoded
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
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

    // Запускаем трей ТОЛЬКО если это не фоновый MCP-воркер от IDE/агента
    const isHeadlessMcp = !process.stdin.isTTY && !process.argv.includes('--gui') && !process.argv.includes('--tray');
    if (!isHeadlessMcp) {
      startTrayIcon(port);
    }

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
