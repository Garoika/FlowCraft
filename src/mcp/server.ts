import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { DiagramStore } from '../server/store.js';
import { WebSocketHub } from '../server/ws-hub.js';
import { TOOL_DEFINITIONS, executeTool } from './tools.js';
import { renderDiagramToSVG } from '../engine/renderer.js';

export class FlowCraftMcpServer {
  private server: Server;
  private store: DiagramStore;
  private wsHub?: WebSocketHub;
  private masterUrl?: string;

  constructor(store: DiagramStore, wsHub?: WebSocketHub, masterUrl?: string) {
    this.store = store;
    this.wsHub = wsHub;
    this.masterUrl = masterUrl;

    this.server = new Server(
      {
        name: 'flowcraft',
        version: '1.1.1'
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        }
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // 1. List Available Tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: TOOL_DEFINITIONS
      };
    });

    // 2. Call Tool Handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (this.masterUrl) {
        try {
          const res = await fetch(`${this.masterUrl}/api/mcp/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, args })
          });
          if (res.ok) {
            const data = await res.json();
            return data;
          }
        } catch (err) {
          console.error(`[FlowCraft MCP] Master instance at ${this.masterUrl} unreachable, falling back to local store.`);
        }
      }

      if (this.wsHub) {
        this.wsHub.broadcastAgentActivity(`🤖 Agent called ${name}`);
      }

      const result = await executeTool(name, args || {}, this.store);
      return result;
    });

    // 3. List Resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'flowcraft://diagram/current',
            name: 'Current Flowchart State (JSON)',
            mimeType: 'application/json',
            description: 'Live JSON graph model of the active flowchart diagram'
          },
          {
            uri: 'flowcraft://diagram/preview.svg',
            name: 'Current Flowchart Preview (SVG)',
            mimeType: 'image/svg+xml',
            description: 'Live rendered SVG graphic of the active flowchart'
          }
        ]
      };
    });

    // 4. Read Resource Handler
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri === 'flowcraft://diagram/current') {
        if (this.masterUrl) {
          try {
            const res = await fetch(`${this.masterUrl}/api/diagram`);
            if (res.ok) {
              const diagram = await res.json();
              return {
                contents: [
                  {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify(diagram, null, 2)
                  }
                ]
              };
            }
          } catch (_) {}
        }

        const diagram = this.store.getDiagram();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(diagram, null, 2)
            }
          ]
        };
      }

      if (uri === 'flowcraft://diagram/preview.svg') {
        if (this.masterUrl) {
          try {
            const res = await fetch(`${this.masterUrl}/api/export/svg?inline=true`);
            if (res.ok) {
              const svg = await res.text();
              return {
                contents: [
                  {
                    uri,
                    mimeType: 'image/svg+xml',
                    text: svg
                  }
                ]
              };
            }
          } catch (_) {}
        }

        const diagram = this.store.getDiagram();
        const svg = renderDiagramToSVG(diagram);
        return {
          contents: [
            {
              uri,
              mimeType: 'image/svg+xml',
              text: svg
            }
          ]
        };
      }

      throw new Error(`Resource not found: ${uri}`);
    });
  }

  public async startWithStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[FlowCraft MCP] Server connected to stdio transport.');
  }

  public getServer(): Server {
    return this.server;
  }
}
