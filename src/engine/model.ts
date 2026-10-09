export type DiagramMode = 'flowchart' | 'chen';

export type NodeShape =
  | 'process'      // Блок (прямоугольник)
  | 'decision'     // Условие (горизонтальный ромб)
  | 'terminal'     // Начало / конец (полностью скруглённый прямоугольник)
  | 'subroutine'   // Подпрограмма (прямоугольник с линиями по краям)
  | 'io'           // Ввод / вывод (параллелограмм)
  | 'display'      // Дисплей (слева треугольный острый угол, справа максимально скруглённые углы)
  | 'hexagon'      // Цикл (6-гранный ромб)
  | 'circle'       // Ссылка (круг)
  | 'entity'       // Сущность в нотации Чена (прямоугольник / слабая сущность с двойной рамкой)
  | 'relationship' // Связь в нотации Чена (ромб / слабая связь с двойным ромбом)
  | 'attribute'    // Атрибут в нотации Чена (эллипс / ключевой / многозначный / производный)
  | 'ellipse'      // Общий эллипс (синоним attribute)
  | 'database'     // База данных (дополнительно)
  | 'cloud'        // Облако (дополнительно)
  | 'note';        // Заметка (дополнительно)

export type PortPosition = 'top' | 'right' | 'bottom' | 'left' | 'auto';
export type EdgeRouting = 'orthogonal' | 'bezier' | 'straight';
export type LayoutDirection = 'TB' | 'LR' | 'BT' | 'RL';
export type DiagramTheme = 'dark' | 'light' | 'cyberpunk' | 'blueprint' | 'emerald' | 'nord';

export interface Point {
  x: number;
  y: number;
}

export interface NodeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  textColor?: string;
  fontSize?: number;
  fontFamily?: string;
  dashed?: boolean;
  opacity?: number;
  badge?: string;
  badgeColor?: string;
  // Нотация Чена:
  isWeak?: boolean;         // Слабая сущность / слабая связь (двойная рамка)
  isKey?: boolean;          // Первичный ключ (подчеркнутый текст)
  isMultivalued?: boolean;  // Многозначный атрибут (двойной овал)
  isDerived?: boolean;      // Производный атрибут (пунктирный овал)
}

export interface FlowNode {
  id: string;
  label: string;
  shape: NodeShape;
  x: number;
  y: number;
  width: number;
  height: number;
  style?: NodeStyle;
  branchLabels?: {
    left?: string | { text: string; position?: 'top' | 'bottom' | 'inside' };
    right?: string | { text: string; position?: 'top' | 'bottom' | 'inside' };
    top?: string | { text: string; position?: 'left' | 'right' };
    bottom?: string | { text: string; position?: 'left' | 'right' };
    hidden?: boolean;
    mode?: string;
    positionMode?: 'top' | 'bottom' | 'outside' | 'inside';
  };
  groupId?: string;
  subDiagram?: FlowSubDiagram;
  metadata?: Record<string, unknown>;
}

export interface FlowSubDiagram {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport?: { panX: number; panY: number; zoom: number };
}

export interface EdgeStyle {
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  animated?: boolean;
  routing?: EdgeRouting;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  textColor?: string;
  fontSize?: number;
  isDouble?: boolean;      // Двойная линия (полное / обязательное участие в связи)
  cardinality?: string;   // Кратность / кардинальность (1, N, M, 0..1, 1..1, 0..N, 1..N)
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourcePort?: PortPosition;
  targetPort?: PortPosition;
  label?: string;
  style?: EdgeStyle;
  points?: Point[];
  segmentOffset?: number;
  segmentOffsets?: Record<number, number>;
}

export interface FlowGroup {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  dashed?: boolean;
}

export interface DiagramOptions {
  title?: string;
  description?: string;
  mode?: DiagramMode;
  theme?: DiagramTheme;
  direction?: LayoutDirection;
  nodeSpacingX?: number;
  nodeSpacingY?: number;
}

export interface FlowDiagram {
  id: string;
  title: string;
  description?: string;
  mode?: DiagramMode;
  theme: DiagramTheme;
  direction: LayoutDirection;
  nodes: FlowNode[];
  edges: FlowEdge[];
  groups: FlowGroup[];
  createdAt: number;
  updatedAt: number;
  version: number;
}

export const THEMES: Record<DiagramTheme, {
  background: string;
  surface: string;
  gridColor: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  nodeDefaults: Record<NodeShape, { fill: string; stroke: string; textColor: string }>;
  edgeDefault: { stroke: string; textColor: string };
  groupDefault: { fill: string; stroke: string; textColor: string };
}> = {
  dark: {
    background: '#0b0f19',
    surface: '#131b2e',
    gridColor: 'rgba(255, 255, 255, 0.08)',
    textPrimary: '#f8fafc',
    textSecondary: '#94a3b8',
    accent: '#38bdf8',
    nodeDefaults: {
      process: { fill: '#000000', stroke: '#38bdf8', textColor: '#f8fafc' },
      decision: { fill: '#000000', stroke: '#38bdf8', textColor: '#f8fafc' },
      terminal: { fill: '#000000', stroke: '#38bdf8', textColor: '#f8fafc' },
      subroutine: { fill: '#000000', stroke: '#38bdf8', textColor: '#f8fafc' },
      io: { fill: '#000000', stroke: '#38bdf8', textColor: '#f8fafc' },
      display: { fill: '#000000', stroke: '#38bdf8', textColor: '#f8fafc' },
      hexagon: { fill: '#000000', stroke: '#38bdf8', textColor: '#f8fafc' },
      circle: { fill: '#000000', stroke: '#38bdf8', textColor: '#f8fafc' },
      database: { fill: '#000000', stroke: '#38bdf8', textColor: '#f8fafc' },
      cloud: { fill: '#000000', stroke: '#38bdf8', textColor: '#f8fafc' },
      note: { fill: '#000000', stroke: '#38bdf8', textColor: '#f8fafc' },
      entity: { fill: '#000000', stroke: '#38bdf8', textColor: '#f8fafc' },
      relationship: { fill: '#000000', stroke: '#38bdf8', textColor: '#f8fafc' },
      attribute: { fill: '#000000', stroke: '#38bdf8', textColor: '#f8fafc' },
      ellipse: { fill: '#000000', stroke: '#38bdf8', textColor: '#f8fafc' }
    },
    edgeDefault: { stroke: '#94a3b8', textColor: '#cbd5e1' },
    groupDefault: { fill: 'rgba(51, 65, 85, 0.25)', stroke: '#475569', textColor: '#94a3b8' }
  },
  light: {
    background: '#ffffff',
    surface: '#ffffff',
    gridColor: 'rgba(0, 0, 0, 0.08)',
    textPrimary: '#000000',
    textSecondary: '#64748b',
    accent: '#0284c7',
    nodeDefaults: {
      process: { fill: '#ffffff', stroke: '#0f172a', textColor: '#000000' },
      decision: { fill: '#ffffff', stroke: '#0f172a', textColor: '#000000' },
      terminal: { fill: '#ffffff', stroke: '#0f172a', textColor: '#000000' },
      subroutine: { fill: '#ffffff', stroke: '#0f172a', textColor: '#000000' },
      io: { fill: '#ffffff', stroke: '#0f172a', textColor: '#000000' },
      display: { fill: '#ffffff', stroke: '#0f172a', textColor: '#000000' },
      hexagon: { fill: '#ffffff', stroke: '#0f172a', textColor: '#000000' },
      circle: { fill: '#ffffff', stroke: '#0f172a', textColor: '#000000' },
      database: { fill: '#ffffff', stroke: '#0f172a', textColor: '#000000' },
      cloud: { fill: '#ffffff', stroke: '#0f172a', textColor: '#000000' },
      note: { fill: '#ffffff', stroke: '#0f172a', textColor: '#000000' },
      entity: { fill: '#ffffff', stroke: '#0f172a', textColor: '#000000' },
      relationship: { fill: '#ffffff', stroke: '#0f172a', textColor: '#000000' },
      attribute: { fill: '#ffffff', stroke: '#0f172a', textColor: '#000000' },
      ellipse: { fill: '#ffffff', stroke: '#0f172a', textColor: '#000000' }
    },
    edgeDefault: { stroke: '#000000', textColor: '#000000' },
    groupDefault: { fill: 'rgba(241, 245, 249, 0.6)', stroke: '#cbd5e1', textColor: '#475569' }
  },
  cyberpunk: {
    background: '#090a0f',
    surface: '#121420',
    gridColor: 'rgba(0, 255, 204, 0.1)',
    textPrimary: '#00ffcc',
    textSecondary: '#ff007f',
    accent: '#ffe600',
    nodeDefaults: {
      process: { fill: '#121420', stroke: '#ff007f', textColor: '#ffffff' },
      decision: { fill: '#1f132b', stroke: '#ffe600', textColor: '#ffe600' },
      terminal: { fill: '#121420', stroke: '#00ffcc', textColor: '#00ffcc' },
      subroutine: { fill: '#121420', stroke: '#b000ff', textColor: '#df80ff' },
      io: { fill: '#0d2229', stroke: '#00ffcc', textColor: '#00ffcc' },
      display: { fill: '#06282d', stroke: '#00ffff', textColor: '#e6ffff' },
      hexagon: { fill: '#2e1208', stroke: '#ff5500', textColor: '#ffaa80' },
      circle: { fill: '#1a1e30', stroke: '#00ffcc', textColor: '#00ffcc' },
      database: { fill: '#280c26', stroke: '#ff007f', textColor: '#ff80bf' },
      cloud: { fill: '#0a1d29', stroke: '#00ccff', textColor: '#80e5ff' },
      note: { fill: '#2d2407', stroke: '#ffe600', textColor: '#fff066' },
      entity: { fill: '#121420', stroke: '#ff007f', textColor: '#ffffff' },
      relationship: { fill: '#1f132b', stroke: '#ffe600', textColor: '#ffe600' },
      attribute: { fill: '#121420', stroke: '#00ffcc', textColor: '#00ffcc' },
      ellipse: { fill: '#121420', stroke: '#00ffcc', textColor: '#00ffcc' }
    },
    edgeDefault: { stroke: '#00ffcc', textColor: '#ffe600' },
    groupDefault: { fill: 'rgba(18, 20, 32, 0.7)', stroke: '#ff007f', textColor: '#00ffcc' }
  },
  blueprint: {
    background: '#0a2342',
    surface: '#12355b',
    gridColor: 'rgba(255, 255, 255, 0.15)',
    textPrimary: '#ffffff',
    textSecondary: '#a5c4d4',
    accent: '#48cae4',
    nodeDefaults: {
      process: { fill: '#12355b', stroke: '#90e0ef', textColor: '#ffffff' },
      decision: { fill: '#1d4e89', stroke: '#caf0f8', textColor: '#ffffff' },
      terminal: { fill: '#12355b', stroke: '#48cae4', textColor: '#ffffff' },
      subroutine: { fill: '#12355b', stroke: '#caf0f8', textColor: '#ffffff' },
      io: { fill: '#174a7e', stroke: '#00b4d8', textColor: '#ffffff' },
      display: { fill: '#144673', stroke: '#90e0ef', textColor: '#ffffff' },
      hexagon: { fill: '#17426e', stroke: '#00b4d8', textColor: '#ffffff' },
      circle: { fill: '#1a3c61', stroke: '#90e0ef', textColor: '#ffffff' },
      database: { fill: '#1d4e89', stroke: '#48cae4', textColor: '#ffffff' },
      cloud: { fill: '#0f3156', stroke: '#48cae4', textColor: '#ffffff' },
      note: { fill: '#224a73', stroke: '#90e0ef', textColor: '#ffffff' },
      entity: { fill: '#12355b', stroke: '#90e0ef', textColor: '#ffffff' },
      relationship: { fill: '#1d4e89', stroke: '#caf0f8', textColor: '#ffffff' },
      attribute: { fill: '#12355b', stroke: '#48cae4', textColor: '#ffffff' },
      ellipse: { fill: '#12355b', stroke: '#48cae4', textColor: '#ffffff' }
    },
    edgeDefault: { stroke: '#90e0ef', textColor: '#caf0f8' },
    groupDefault: { fill: 'rgba(18, 53, 91, 0.4)', stroke: '#48cae4', textColor: '#caf0f8' }
  },
  emerald: {
    background: '#061c14',
    surface: '#0d3326',
    gridColor: 'rgba(52, 211, 153, 0.1)',
    textPrimary: '#ecfdf5',
    textSecondary: '#6ee7b7',
    accent: '#10b981',
    nodeDefaults: {
      process: { fill: '#0d3326', stroke: '#10b981', textColor: '#ecfdf5' },
      decision: { fill: '#134e3a', stroke: '#6ee7b7', textColor: '#ecfdf5' },
      terminal: { fill: '#0d3326', stroke: '#34d399', textColor: '#ecfdf5' },
      subroutine: { fill: '#0d3326', stroke: '#34d399', textColor: '#ecfdf5' },
      io: { fill: '#0a3f2f', stroke: '#a7f3d0', textColor: '#ecfdf5' },
      display: { fill: '#0b4735', stroke: '#34d399', textColor: '#ecfdf5' },
      hexagon: { fill: '#1e3e2b', stroke: '#34d399', textColor: '#ecfdf5' },
      circle: { fill: '#113c2d', stroke: '#10b981', textColor: '#ecfdf5' },
      database: { fill: '#14532d', stroke: '#4ade80', textColor: '#ecfdf5' },
      cloud: { fill: '#082f22', stroke: '#6ee7b7', textColor: '#ecfdf5' },
      note: { fill: '#2a441e', stroke: '#a3e635', textColor: '#f7fee7' },
      entity: { fill: '#0d3326', stroke: '#10b981', textColor: '#ecfdf5' },
      relationship: { fill: '#134e3a', stroke: '#6ee7b7', textColor: '#ecfdf5' },
      attribute: { fill: '#0d3326', stroke: '#34d399', textColor: '#ecfdf5' },
      ellipse: { fill: '#0d3326', stroke: '#34d399', textColor: '#ecfdf5' }
    },
    edgeDefault: { stroke: '#34d399', textColor: '#a7f3d0' },
    groupDefault: { fill: 'rgba(13, 51, 38, 0.4)', stroke: '#10b981', textColor: '#6ee7b7' }
  },
  nord: {
    background: '#2e3440',
    surface: '#3b4252',
    gridColor: 'rgba(216, 222, 233, 0.08)',
    textPrimary: '#eceff4',
    textSecondary: '#d8dee9',
    accent: '#88c0d0',
    nodeDefaults: {
      process: { fill: '#3b4252', stroke: '#81a1c1', textColor: '#eceff4' },
      decision: { fill: '#434c5e', stroke: '#b48ead', textColor: '#eceff4' },
      terminal: { fill: '#3b4252', stroke: '#88c0d0', textColor: '#eceff4' },
      subroutine: { fill: '#3b4252', stroke: '#5e81ac', textColor: '#eceff4' },
      io: { fill: '#3b4252', stroke: '#a3be8c', textColor: '#eceff4' },
      display: { fill: '#354759', stroke: '#88c0d0', textColor: '#eceff4' },
      hexagon: { fill: '#434c5e', stroke: '#d08770', textColor: '#eceff4' },
      circle: { fill: '#4c566a', stroke: '#88c0d0', textColor: '#eceff4' },
      database: { fill: '#4c566a', stroke: '#ebcb8b', textColor: '#eceff4' },
      cloud: { fill: '#2e3440', stroke: '#8fbcbb', textColor: '#eceff4' },
      note: { fill: '#434c5e', stroke: '#ebcb8b', textColor: '#eceff4' },
      entity: { fill: '#3b4252', stroke: '#81a1c1', textColor: '#eceff4' },
      relationship: { fill: '#434c5e', stroke: '#b48ead', textColor: '#eceff4' },
      attribute: { fill: '#3b4252', stroke: '#88c0d0', textColor: '#eceff4' },
      ellipse: { fill: '#3b4252', stroke: '#88c0d0', textColor: '#eceff4' }
    },
    edgeDefault: { stroke: '#81a1c1', textColor: '#e5e9f0' },
    groupDefault: { fill: 'rgba(59, 66, 82, 0.4)', stroke: '#4c566a', textColor: '#d8dee9' }
  }
};

export const DEFAULT_NODE_DIMENSIONS: Record<NodeShape, { width: number; height: number }> = {
  process: { width: 150, height: 50 },
  decision: { width: 150, height: 50 },
  terminal: { width: 150, height: 50 },
  subroutine: { width: 150, height: 50 },
  io: { width: 150, height: 50 },
  display: { width: 150, height: 50 },
  hexagon: { width: 150, height: 50 },
  circle: { width: 50, height: 50 },
  database: { width: 150, height: 50 },
  cloud: { width: 150, height: 50 },
  note: { width: 150, height: 50 },
  entity: { width: 150, height: 50 },
  relationship: { width: 150, height: 60 },
  attribute: { width: 130, height: 50 },
  ellipse: { width: 130, height: 50 }
};

/**
 * Рекурсивно найти вложенный контейнер { nodes, edges } по цепочке ID сущностей
 */
export function findSubDiagramByPath(
  diagram: FlowDiagram,
  pathIds: string[]
): { nodes: FlowNode[]; edges: FlowEdge[]; parentNode?: FlowNode } {
  if (!pathIds || pathIds.length === 0) {
    return { nodes: diagram.nodes, edges: diagram.edges };
  }

  let currentNodes = diagram.nodes;
  let currentEdges = diagram.edges;
  let lastNode: FlowNode | undefined;

  for (const id of pathIds) {
    const found = currentNodes.find(n => n.id === id);
    if (!found) break;
    lastNode = found;
    if (!found.subDiagram) {
      found.subDiagram = { nodes: [], edges: [] };
    }
    currentNodes = found.subDiagram.nodes;
    currentEdges = found.subDiagram.edges;
  }

  return { nodes: currentNodes, edges: currentEdges, parentNode: lastNode };
}

