import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { DiagramStore } from './store.js';
import { WebSocketHub } from './ws-hub.js';
import { renderDiagramToSVG } from '../engine/renderer.js';
import { TOOL_DEFINITIONS } from '../mcp/tools.js';

const getCurrentDirname = () => {
  if (typeof __dirname !== 'undefined' && __dirname) return __dirname;
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch (_) {
    return process.cwd();
  }
};

export interface WebServerOptions {
  port?: number;
  host?: string;
  publicDir?: string;
}

export class FlowCraftWebServer {
  private server: http.Server;
  private wss: WebSocketServer;
  private wsHub: WebSocketHub;
  private store: DiagramStore;
  private publicDir: string;
  public port: number;
  public host: string;

  constructor(store: DiagramStore, options?: WebServerOptions) {
    this.store = store;
    this.port = options?.port || parseInt(process.env.PORT || '3344', 10);
    this.host = options?.host || '0.0.0.0';
    const defaultPublic = path.resolve(getCurrentDirname(), '../../public');
    const localPublic = path.resolve(getCurrentDirname(), '../public');
    const exeDirPublic = path.resolve(path.dirname(process.execPath), 'public');
    const cwdPublic = path.resolve(process.cwd(), 'public');
    this.publicDir = options?.publicDir || (
      fs.existsSync(exeDirPublic) ? exeDirPublic :
      (fs.existsSync(defaultPublic) ? defaultPublic : (fs.existsSync(localPublic) ? localPublic : cwdPublic))
    );

    this.server = http.createServer((req, res) => this.handleHttpRequest(req, res));
    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on('error', () => {
      // Prevent unhandled error event on WebSocketServer
    });
    this.wsHub = new WebSocketHub(this.store);
    this.wsHub.attach(this.wss);
  }

  public start(): Promise<number> {
    return new Promise((resolve) => {
      const tryListen = (portToTry: number) => {
        const onError = (err: NodeJS.ErrnoException) => {
          this.server.removeListener('error', onError);
          this.server.removeListener('listening', onListening);
          if (err.code === 'EADDRINUSE' && portToTry < 3360) {
            tryListen(portToTry + 1);
          } else {
            resolve(0);
          }
        };

        const onListening = () => {
          this.server.removeListener('error', onError);
          this.server.removeListener('listening', onListening);
          const addr = this.server.address();
          const actualPort = typeof addr === 'object' && addr ? addr.port : portToTry;
          this.port = actualPort;
          resolve(actualPort);
        };

        this.server.once('error', onError);
        this.server.once('listening', onListening);
        this.server.listen(portToTry, this.host);
      };

      tryListen(this.port);
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.server.close(() => resolve());
      });
    });
  }

  public getHub(): WebSocketHub {
    return this.wsHub;
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // API Routes
    if (pathname === '/api/diagrams' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.store.listDiagrams(), null, 2));
      return;
    }

    if (pathname === '/api/diagrams' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const created = this.store.createDiagram(data.title, data.description, data.direction, data.theme, data.id);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(created, null, 2));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        }
      });
      return;
    }

    if (pathname.startsWith('/api/diagrams/')) {
      const parts = pathname.split('/').filter(Boolean);
      const diagramId = parts[2];

      if (parts.length === 3 && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.store.getDiagram(diagramId), null, 2));
        return;
      }

      if (parts.length === 3 && (req.method === 'PUT' || req.method === 'PATCH')) {
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            const diagram = this.store.getDiagram(diagramId);
            if (data.title !== undefined) diagram.title = data.title;
            if (data.description !== undefined) diagram.description = data.description;
            if (data.theme !== undefined) diagram.theme = data.theme;
            if (data.nodes !== undefined) diagram.nodes = data.nodes;
            if (data.edges !== undefined) diagram.edges = data.edges;
            this.store.setFullDiagram(diagram);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(diagram, null, 2));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          }
        });
        return;
      }

      if (parts.length === 3 && req.method === 'DELETE') {
        const deleted = this.store.deleteDiagram(diagramId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: deleted }));
        return;
      }

      if (parts.length === 4 && parts[3] === 'duplicate' && req.method === 'POST') {
        const cloned = this.store.duplicateDiagram(diagramId);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cloned, null, 2));
        return;
      }

      if (parts.length === 4 && parts[3] === 'preview.svg' && req.method === 'GET') {
        const diagram = this.store.getDiagram(diagramId);
        const svg = renderDiagramToSVG(diagram, {
          theme: diagram.theme || 'light',
          transparentBg: true,
          interactive: false,
          padding: 12
        });
        res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' });
        res.end(svg);
        return;
      }
    }

    if (pathname === '/api/diagram' && req.method === 'GET') {
      const diagramId = url.searchParams.get('id') || undefined;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.store.getDiagram(diagramId), null, 2));
      return;
    }

    if (pathname === '/api/export/svg' && req.method === 'GET') {
      const diagramId = url.searchParams.get('id') || url.searchParams.get('diagramId') || undefined;
      const theme = url.searchParams.get('theme') as any;
      const transparent = url.searchParams.get('transparent') === 'true';
      const inline = url.searchParams.get('inline') === 'true';
      const interactive = url.searchParams.get('interactive') === 'true' || inline;
      const diagram = this.store.getDiagram(diagramId);
      const svg = renderDiagramToSVG(diagram, {
        theme: theme || diagram.theme || 'light',
        transparentBg: transparent,
        inlineOnly: inline,
        interactive: interactive
      });
      res.writeHead(200, {
        'Content-Type': inline ? 'text/html; charset=utf-8' : 'image/svg+xml; charset=utf-8',
        'Content-Disposition': inline ? 'inline' : `attachment; filename="${encodeURIComponent(diagram.title || 'diagram')}.svg"`
      });
      res.end(svg);
      return;
    }

    if (pathname === '/api/approve' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const success = this.store.resolveApproval(data.id, data.approved, data.userResponse);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        }
      });
      return;
    }

    if (pathname === '/api/mcp/tools' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(TOOL_DEFINITIONS, null, 2));
      return;
    }

    if (pathname === '/api/mcp/info' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        tools: TOOL_DEFINITIONS,
        execPath: process.execPath,
        scriptPath: path.resolve(__dirname, '../index.js'),
        isPkg: Boolean((process as any).pkg),
        port: this.port
      }, null, 2));
      return;
    }

    if (pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version: '1.0.0' }));
      return;
    }

    // Static Assets & Multi-page Routing
    let filePath: string;

    if (pathname === '/' || pathname === '/hub' || pathname === '/hub.html') {
      filePath = path.join(this.publicDir, 'hub.html');
    } else if (pathname === '/editor' || pathname === '/index.html') {
      filePath = path.join(this.publicDir, 'index.html');
    } else {
      const candidatePath = path.join(this.publicDir, pathname.startsWith('/') ? pathname.slice(1) : pathname);
      if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        filePath = candidatePath;
      } else {
        // Any chart URL like /d/<id> or /<id> serves the editor index.html
        filePath = path.join(this.publicDir, 'index.html');
      }
    }

    // Prevent path traversal
    if (!filePath.startsWith(this.publicDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        filePath = path.join(this.publicDir, 'hub.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon'
      };

      const contentType = mimeTypes[ext] || 'application/octet-stream';

      fs.readFile(filePath, (readErr, content) => {
        if (readErr) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      });
    });
  }
}
