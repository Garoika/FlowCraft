import { WebSocketServer, WebSocket } from 'ws';
import { DiagramStore, ApprovalRequest } from './store.js';
import { FlowDiagram } from '../engine/model.js';

export interface WsMessage {
  type: string;
  payload?: any;
}

export class WebSocketHub {
  private wss: WebSocketServer | null = null;
  private store: DiagramStore;
  private clients = new Map<WebSocket, { diagramId?: string }>();

  constructor(store: DiagramStore) {
    this.store = store;
    this.setupStoreListeners();
  }

  public attach(wss: WebSocketServer) {
    this.wss = wss;
    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.set(ws, {});

      // Send initial state upon connection
      const activeId = this.store.getActiveDiagramId();
      this.send(ws, {
        type: 'diagram:init',
        payload: {
          diagram: this.store.getDiagram(activeId),
          diagramsList: this.store.listDiagrams(),
          pendingApprovals: this.store.getPendingApprovals()
        }
      });

      ws.on('message', (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString()) as WsMessage;
          this.handleClientMessage(ws, msg);
        } catch (err) {
          console.error('[FlowCraft WS] Failed to parse message:', err);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });
  }

  private setupStoreListeners() {
    this.store.on('change', (diagram: FlowDiagram, action: string) => {
      this.broadcast({
        type: 'diagram:update',
        payload: { diagram, action, timestamp: Date.now() }
      });

      // Broadcast updated list to hub clients
      this.broadcast({
        type: 'diagrams:list_updated',
        payload: { diagrams: this.store.listDiagrams() }
      });
    });

    this.store.on('diagram:deleted', (id: string) => {
      this.broadcast({
        type: 'diagram:deleted',
        payload: { id, diagrams: this.store.listDiagrams() }
      });
    });

    this.store.on('approval:requested', (request: ApprovalRequest) => {
      this.broadcast({
        type: 'approval:requested',
        payload: request
      });
    });

    this.store.on('approval:resolved', (request: ApprovalRequest) => {
      this.broadcast({
        type: 'approval:resolved',
        payload: request
      });
    });
  }

  private handleClientMessage(ws: WebSocket, msg: WsMessage) {
    switch (msg.type) {
      case 'client:join_diagram': {
        const diagramId = msg.payload?.diagramId;
        if (diagramId) {
          const clientData = this.clients.get(ws) || {};
          clientData.diagramId = diagramId;
          this.clients.set(ws, clientData);

          const diagram = this.store.getDiagram(diagramId);
          this.send(ws, {
            type: 'diagram:init',
            payload: {
              diagram,
              pendingApprovals: this.store.getPendingApprovals()
            }
          });
        }
        break;
      }

      case 'client:get_diagrams_list': {
        this.send(ws, {
          type: 'diagrams:list_updated',
          payload: { diagrams: this.store.listDiagrams() }
        });
        break;
      }

      case 'client:update_diagram':
        if (msg.payload) {
          this.store.setFullDiagram(msg.payload);
        }
        break;

      case 'client:create_diagram': {
        const { title, description, direction, theme } = msg.payload || {};
        const created = this.store.createDiagram(title, description, direction, theme);
        this.send(ws, {
          type: 'diagram:created',
          payload: { diagram: created }
        });
        break;
      }

      case 'client:duplicate_diagram': {
        const { id } = msg.payload || {};
        if (id) {
          const cloned = this.store.duplicateDiagram(id);
          this.send(ws, {
            type: 'diagram:created',
            payload: { diagram: cloned }
          });
        }
        break;
      }

      case 'client:delete_diagram': {
        const { id } = msg.payload || {};
        if (id) {
          this.store.deleteDiagram(id);
        }
        break;
      }

      case 'client:move_node': {
        const { id, x, y, diagramId } = msg.payload || {};
        if (id && typeof x === 'number' && typeof y === 'number') {
          this.store.updateNode(id, { x, y }, diagramId);
        }
        break;
      }

      case 'client:resolve_approval': {
        const { id, approved, userResponse } = msg.payload || {};
        if (id) {
          this.store.resolveApproval(id, !!approved, userResponse);
        }
        break;
      }

      case 'client:request_layout': {
        const { direction, spacingX, spacingY, diagramId } = msg.payload || {};
        this.store.applyLayout(direction, spacingX, spacingY, diagramId);
        break;
      }

      case 'client:set_theme': {
        if (msg.payload?.theme) {
          this.store.setTheme(msg.payload.theme, msg.payload.diagramId);
        }
        break;
      }

      case 'client:undo':
        this.store.undo(msg.payload?.diagramId);
        break;

      case 'client:redo':
        this.store.redo(msg.payload?.diagramId);
        break;

      default:
        break;
    }
  }

  public broadcastAgentActivity(activity: string) {
    this.broadcast({
      type: 'agent:activity',
      payload: { message: activity, timestamp: Date.now() }
    });
  }

  public broadcast(msg: WsMessage) {
    const raw = JSON.stringify(msg);
    this.clients.forEach((_, client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    });
  }

  private send(ws: WebSocket, msg: WsMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
