import EventEmitter from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FlowDiagram,
  FlowNode,
  FlowEdge,
  FlowGroup,
  DiagramMode,
  DiagramTheme,
  LayoutDirection,
  DEFAULT_NODE_DIMENSIONS,
  THEMES
} from '../engine/model.js';
import { applyAutoLayout } from '../engine/layout.js';

export interface ApprovalRequest {
  id: string;
  message: string;
  options?: string[];
  createdAt: number;
  status: 'pending' | 'approved' | 'rejected';
  userResponse?: string;
}

export interface StoreEvents {
  'change': (diagram: FlowDiagram, action: string) => void;
  'approval:requested': (request: ApprovalRequest) => void;
  'approval:resolved': (request: ApprovalRequest) => void;
  'diagram:deleted': (id: string) => void;
}

export interface DiagramSummary {
  id: string;
  title: string;
  description?: string;
  mode?: DiagramMode;
  theme: DiagramTheme;
  direction: LayoutDirection;
  nodeCount: number;
  edgeCount: number;
  createdAt: number;
  updatedAt: number;
}

export class DiagramStore extends EventEmitter {
  private diagrams = new Map<string, FlowDiagram>();
  private activeDiagramId: string = '';
  private historyMap = new Map<string, FlowDiagram[]>();
  private historyIndexMap = new Map<string, number>();
  private maxHistory = 50;
  private storageDir: string;
  private pendingApprovals = new Map<string, { request: ApprovalRequest; resolve: (val: any) => void }>();

  constructor(customStorageDir?: string) {
    super();
    let baseDir: string;
    if (customStorageDir) {
      baseDir = path.resolve(customStorageDir);
    } else if (process.env.FLOWCRAFT_STORAGE_DIR) {
      baseDir = path.resolve(process.env.FLOWCRAFT_STORAGE_DIR);
    } else {
      const localProjectDir = path.resolve(process.cwd(), '.flowcraft');
      if (fs.existsSync(localProjectDir)) {
        baseDir = localProjectDir;
      } else {
        baseDir = path.join(os.homedir(), '.flowcraft');
      }
    }

    this.storageDir = path.join(baseDir, 'diagrams');
    this.initStorage(baseDir);
  }

  private initStorage(baseDir: string) {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }

      // Legacy migration from diagram.json
      const legacyPath = path.join(baseDir, 'diagram.json');
      if (fs.existsSync(legacyPath)) {
        try {
          const raw = fs.readFileSync(legacyPath, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.nodes)) {
            const id = parsed.id || 'chart_' + Date.now().toString(36);
            parsed.id = id;
            fs.writeFileSync(path.join(this.storageDir, `${id}.json`), JSON.stringify(parsed, null, 2), 'utf-8');
            this.diagrams.set(id, parsed);
            this.activeDiagramId = id;
          }
        } catch (e) {}
      }

      // Load all diagrams from storageDir
      const files = fs.readdirSync(this.storageDir);
      files.forEach(file => {
        if (file.endsWith('.json')) {
          try {
            const raw = fs.readFileSync(path.join(this.storageDir, file), 'utf-8');
            const parsed = JSON.parse(raw) as FlowDiagram;
            if (parsed && parsed.id && Array.isArray(parsed.nodes)) {
              this.diagrams.set(parsed.id, parsed);
              if (!this.activeDiagramId) this.activeDiagramId = parsed.id;
            }
          } catch (e) {}
        }
      });

      // If no diagrams exist, create default
      if (this.diagrams.size === 0) {
        const defaultDiag = this.createDefaultDiagram();
        this.diagrams.set(defaultDiag.id, defaultDiag);
        this.activeDiagramId = defaultDiag.id;
        this.saveDiagramToDisk(defaultDiag);
      }
    } catch (err) {
      const defaultDiag = this.createDefaultDiagram();
      this.diagrams.set(defaultDiag.id, defaultDiag);
      this.activeDiagramId = defaultDiag.id;
    }
  }

  public generateId(): string {
    return 'chart_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  private createDefaultDiagram(title = 'Новая схема', direction: LayoutDirection = 'TB', theme: DiagramTheme = 'light', id?: string, mode: DiagramMode = 'flowchart'): FlowDiagram {
    return {
      id: id || this.generateId(),
      title,
      description: 'Схема создана в FlowCraft',
      mode,
      theme,
      direction,
      nodes: [],
      edges: [],
      groups: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1
    };
  }

  public listDiagrams(): DiagramSummary[] {
    const list: DiagramSummary[] = [];
    this.diagrams.forEach(diag => {
      list.push({
        id: diag.id,
        title: diag.title || 'Без названия',
        description: diag.description,
        mode: diag.mode || 'flowchart',
        theme: diag.theme || 'light',
        direction: diag.direction || 'TB',
        nodeCount: diag.nodes ? diag.nodes.length : 0,
        edgeCount: diag.edges ? diag.edges.length : 0,
        createdAt: diag.createdAt || diag.updatedAt || Date.now(),
        updatedAt: diag.updatedAt || Date.now()
      });
    });

    list.sort((a, b) => b.updatedAt - a.updatedAt);
    return list;
  }

  public getActiveDiagramId(): string {
    if (!this.activeDiagramId || !this.diagrams.has(this.activeDiagramId)) {
      const first = Array.from(this.diagrams.keys())[0];
      if (first) {
        this.activeDiagramId = first;
      } else {
        const d = this.createDefaultDiagram();
        this.diagrams.set(d.id, d);
        this.activeDiagramId = d.id;
      }
    }
    return this.activeDiagramId;
  }

  public getDiagram(id?: string): FlowDiagram {
    const targetId = id || this.getActiveDiagramId();
    let diag = this.diagrams.get(targetId);

    if (!diag) {
      // Try reading from disk
      const filePath = path.join(this.storageDir, `${targetId}.json`);
      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          diag = JSON.parse(raw);
          if (diag) this.diagrams.set(targetId, diag);
        } catch (e) {}
      }
    }

    if (!diag) {
      diag = this.createDefaultDiagram('Новая схема', 'TB', 'light', targetId);
      this.diagrams.set(targetId, diag);
      this.saveDiagramToDisk(diag);
    }

    this.activeDiagramId = targetId;
    return JSON.parse(JSON.stringify(diag));
  }

  public createDiagram(
    title: string = 'Новая схема',
    description?: string,
    direction: LayoutDirection = 'TB',
    theme: DiagramTheme = 'light',
    customId?: string,
    mode: DiagramMode = 'flowchart'
  ): FlowDiagram {
    const id = customId || this.generateId();
    const diagram: FlowDiagram = {
      id,
      title,
      description: description || '',
      mode,
      theme,
      direction,
      nodes: [],
      edges: [],
      groups: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1
    };

    this.diagrams.set(id, diagram);
    this.activeDiagramId = id;
    this.saveDiagramToDisk(diagram);
    this.saveHistoryState(diagram, `Created diagram: ${title}`);
    this.emitChange(diagram, 'create_diagram');
    return JSON.parse(JSON.stringify(diagram));
  }

  public duplicateDiagram(id: string): FlowDiagram {
    const source = this.getDiagram(id);
    const newId = this.generateId();
    const cloned: FlowDiagram = {
      ...JSON.parse(JSON.stringify(source)),
      id: newId,
      title: `${source.title || 'Блок-схема'} (Копия)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1
    };

    this.diagrams.set(newId, cloned);
    this.activeDiagramId = newId;
    this.saveDiagramToDisk(cloned);
    this.saveHistoryState(cloned, `Duplicated diagram: ${source.title}`);
    this.emitChange(cloned, 'create_diagram');
    return JSON.parse(JSON.stringify(cloned));
  }

  public deleteDiagram(id: string): boolean {
    const deleted = this.diagrams.delete(id);
    const filePath = path.join(this.storageDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {}
    }

    if (this.activeDiagramId === id) {
      const remaining = Array.from(this.diagrams.keys())[0];
      this.activeDiagramId = remaining || '';
    }

    this.emit('diagram:deleted', id);
    return deleted;
  }

  public addNode(nodeData: Partial<FlowNode> & { id: string; label: string }, diagramId?: string): FlowNode {
    const diagram = this.getDiagram(diagramId);
    const shape = nodeData.shape || 'process';
    const dims = DEFAULT_NODE_DIMENSIONS[shape] || { width: 160, height: 60 };

    const existingIdx = diagram.nodes.findIndex(n => n.id === nodeData.id);
    const node: FlowNode = {
      id: nodeData.id,
      label: nodeData.label,
      shape,
      x: nodeData.x ?? 100,
      y: nodeData.y ?? 100,
      width: nodeData.width ?? dims.width,
      height: nodeData.height ?? dims.height,
      style: nodeData.style,
      groupId: nodeData.groupId,
      metadata: nodeData.metadata
    };

    if (existingIdx >= 0) {
      diagram.nodes[existingIdx] = node;
    } else {
      diagram.nodes.push(node);
    }

    diagram.updatedAt = Date.now();
    diagram.version++;
    this.setFullDiagram(diagram);
    return node;
  }

  public addNodes(nodesData: Array<Partial<FlowNode> & { id: string; label: string }>, diagramId?: string): FlowNode[] {
    const diagram = this.getDiagram(diagramId);
    const added: FlowNode[] = [];
    nodesData.forEach(data => {
      const shape = data.shape || 'process';
      const dims = DEFAULT_NODE_DIMENSIONS[shape] || { width: 160, height: 60 };
      const node: FlowNode = {
        id: data.id,
        label: data.label,
        shape,
        x: data.x ?? 100,
        y: data.y ?? 100,
        width: data.width ?? dims.width,
        height: data.height ?? dims.height,
        style: data.style,
        groupId: data.groupId,
        metadata: data.metadata
      };
      const existingIdx = diagram.nodes.findIndex(n => n.id === node.id);
      if (existingIdx >= 0) {
        diagram.nodes[existingIdx] = node;
      } else {
        diagram.nodes.push(node);
      }
      added.push(node);
    });

    diagram.updatedAt = Date.now();
    diagram.version++;
    this.setFullDiagram(diagram);
    return added;
  }

  public updateNode(nodeId: string, updates: Partial<FlowNode>, diagramId?: string): FlowNode | null {
    const diagram = this.getDiagram(diagramId);
    const node = diagram.nodes.find(n => n.id === nodeId);
    if (!node) return null;

    Object.assign(node, updates);
    diagram.updatedAt = Date.now();
    diagram.version++;
    this.setFullDiagram(diagram);
    return node;
  }

  public deleteNode(nodeId: string, diagramId?: string): boolean {
    const diagram = this.getDiagram(diagramId);
    const initialLen = diagram.nodes.length;
    diagram.nodes = diagram.nodes.filter(n => n.id !== nodeId);
    diagram.edges = diagram.edges.filter(e => e.source !== nodeId && e.target !== nodeId);

    if (diagram.nodes.length < initialLen) {
      diagram.updatedAt = Date.now();
      diagram.version++;
      this.setFullDiagram(diagram);
      return true;
    }
    return false;
  }

  public addEdge(edgeData: { source: string; target: string; label?: string; sourcePort?: any; targetPort?: any; style?: any; segmentOffsets?: any }, diagramId?: string): FlowEdge {
    const diagram = this.getDiagram(diagramId);
    const id = `edge-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const edge: FlowEdge = {
      id,
      source: edgeData.source,
      target: edgeData.target,
      label: edgeData.label,
      sourcePort: edgeData.sourcePort || 'bottom',
      targetPort: edgeData.targetPort || 'top',
      style: edgeData.style,
      segmentOffsets: edgeData.segmentOffsets
    };

    diagram.edges.push(edge);
    diagram.updatedAt = Date.now();
    diagram.version++;
    this.setFullDiagram(diagram);
    return edge;
  }

  public addEdges(edgesData: Array<{ source: string; target: string; label?: string; sourcePort?: any; targetPort?: any; style?: any }>, diagramId?: string): FlowEdge[] {
    const diagram = this.getDiagram(diagramId);
    const added: FlowEdge[] = [];
    edgesData.forEach(data => {
      const id = `edge-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const edge: FlowEdge = {
        id,
        source: data.source,
        target: data.target,
        label: data.label,
        sourcePort: data.sourcePort || 'bottom',
        targetPort: data.targetPort || 'top',
        style: data.style
      };
      diagram.edges.push(edge);
      added.push(edge);
    });

    diagram.updatedAt = Date.now();
    diagram.version++;
    this.setFullDiagram(diagram);
    return added;
  }

  public updateEdge(edgeId: string, updates: Partial<FlowEdge>, diagramId?: string): FlowEdge | null {
    const diagram = this.getDiagram(diagramId);
    const edge = diagram.edges.find(e => e.id === edgeId);
    if (!edge) return null;

    Object.assign(edge, updates);
    diagram.updatedAt = Date.now();
    diagram.version++;
    this.setFullDiagram(diagram);
    return edge;
  }

  public deleteEdge(edgeId: string, diagramId?: string): boolean {
    const diagram = this.getDiagram(diagramId);
    const initialLen = diagram.edges.length;
    diagram.edges = diagram.edges.filter(e => e.id !== edgeId);

    if (diagram.edges.length < initialLen) {
      diagram.updatedAt = Date.now();
      diagram.version++;
      this.setFullDiagram(diagram);
      return true;
    }
    return false;
  }

  public groupNodes(
    arg1: string | string[],
    arg2: string[] | string,
    arg3?: string,
    arg4?: string
  ): FlowGroup {
    let groupId: string;
    let nodeIds: string[];
    let label: string;
    let diagramId: string | undefined;

    if (typeof arg1 === 'string' && Array.isArray(arg2)) {
      groupId = arg1;
      nodeIds = arg2;
      label = arg3 || 'Группа';
      diagramId = arg4;
    } else {
      nodeIds = (Array.isArray(arg1) ? arg1 : [arg1]) as string[];
      label = (typeof arg2 === 'string' ? arg2 : 'Группа');
      groupId = `group-${Date.now()}`;
      diagramId = arg3;
    }

    const diagram = this.getDiagram(diagramId);
    let group = diagram.groups.find(g => g.id === groupId || g.label === label);
    if (!group) {
      group = { id: groupId, label, x: 0, y: 0, width: 0, height: 0 };
      diagram.groups.push(group);
    } else {
      group.id = groupId;
      group.label = label;
    }

    diagram.nodes.forEach(n => {
      if (nodeIds.includes(n.id)) {
        n.groupId = groupId;
      } else if (n.groupId === groupId && !nodeIds.includes(n.id)) {
        n.groupId = undefined;
      }
    });

    const updated = applyAutoLayout(diagram);
    this.setFullDiagram(updated);
    return group;
  }

  public applyLayout(direction?: LayoutDirection, spacingX?: number, spacingY?: number, diagramId?: string): FlowDiagram {
    const diagram = this.getDiagram(diagramId);
    const updated = applyAutoLayout(diagram, {
      direction: direction || diagram.direction,
      nodeSpacingX: spacingX,
      nodeSpacingY: spacingY
    });
    this.setFullDiagram(updated);
    return updated;
  }

  public setTheme(theme: DiagramTheme, diagramId?: string): void {
    if (THEMES[theme]) {
      const diagram = this.getDiagram(diagramId);
      diagram.theme = theme;
      this.setFullDiagram(diagram);
    }
  }

  public setFullDiagram(diagram: FlowDiagram): void {
    const id = diagram.id || this.getActiveDiagramId();
    diagram.id = id;
    diagram.updatedAt = Date.now();
    diagram.version = (diagram.version || 0) + 1;

    this.diagrams.set(id, JSON.parse(JSON.stringify(diagram)));
    this.activeDiagramId = id;
    this.saveDiagramToDisk(diagram);
    this.saveHistoryState(diagram, 'Diagram updated');
    this.emitChange(diagram, 'full_update');
  }

  // --- Human Approval Mechanism ---
  public requestUserApproval(message: string, options?: string[]): Promise<ApprovalRequest> {
    const id = 'approval-' + Date.now();
    return new Promise((resolve) => {
      const request: ApprovalRequest = {
        id,
        message,
        options,
        createdAt: Date.now(),
        status: 'pending'
      };
      this.pendingApprovals.set(id, { request, resolve });
      this.emit('approval:requested', request);
    });
  }

  public resolveApproval(id: string, approved: boolean, userResponse?: string): boolean {
    const pending = this.pendingApprovals.get(id);
    if (!pending) return false;

    pending.request.status = approved ? 'approved' : 'rejected';
    pending.request.userResponse = userResponse;
    pending.resolve(pending.request);
    this.pendingApprovals.delete(id);
    this.emit('approval:resolved', pending.request);
    return true;
  }

  public getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).map(p => p.request);
  }

  // --- Undo / Redo ---
  public undo(diagramId?: string): FlowDiagram | null {
    const id = diagramId || this.getActiveDiagramId();
    const history = this.historyMap.get(id) || [];
    let idx = this.historyIndexMap.get(id) ?? (history.length - 1);

    if (idx > 0) {
      idx--;
      this.historyIndexMap.set(id, idx);
      const diagram = JSON.parse(JSON.stringify(history[idx]));
      this.diagrams.set(id, diagram);
      this.saveDiagramToDisk(diagram);
      this.emitChange(diagram, 'undo');
      return JSON.parse(JSON.stringify(diagram));
    }
    return null;
  }

  public redo(diagramId?: string): FlowDiagram | null {
    const id = diagramId || this.getActiveDiagramId();
    const history = this.historyMap.get(id) || [];
    let idx = this.historyIndexMap.get(id) ?? (history.length - 1);

    if (idx < history.length - 1) {
      idx++;
      this.historyIndexMap.set(id, idx);
      const diagram = JSON.parse(JSON.stringify(history[idx]));
      this.diagrams.set(id, diagram);
      this.saveDiagramToDisk(diagram);
      this.emitChange(diagram, 'redo');
      return JSON.parse(JSON.stringify(diagram));
    }
    return null;
  }

  private saveHistoryState(diagram: FlowDiagram, desc?: string) {
    const id = diagram.id;
    let history = this.historyMap.get(id);
    let idx = this.historyIndexMap.get(id) ?? -1;

    if (!history) {
      history = [];
      this.historyMap.set(id, history);
    }

    if (idx < history.length - 1) {
      history = history.slice(0, idx + 1);
    }
    history.push(JSON.parse(JSON.stringify(diagram)));
    if (history.length > this.maxHistory) {
      history.shift();
    } else {
      idx++;
    }
    this.historyIndexMap.set(id, history.length - 1);
  }

  private emitChange(diagram: FlowDiagram, action: string) {
    this.emit('change', JSON.parse(JSON.stringify(diagram)), action);
  }

  private saveDiagramToDisk(diagram: FlowDiagram) {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      const filePath = path.join(this.storageDir, `${diagram.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(diagram, null, 2), 'utf-8');
    } catch (err) {
      // Ignore disk errors
    }
  }
}
