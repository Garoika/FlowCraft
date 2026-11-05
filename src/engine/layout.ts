import { FlowDiagram, FlowNode, FlowEdge, FlowGroup, LayoutDirection, Point, PortPosition } from './model.js';

export interface LayoutConfig {
  direction?: LayoutDirection;
  nodeSpacingX?: number;
  nodeSpacingY?: number;
  groupPadding?: number;
  edgeRouting?: 'orthogonal' | 'bezier' | 'straight';
}

const DEFAULT_CONFIG: Required<LayoutConfig> = {
  direction: 'TB',
  nodeSpacingX: 60,
  nodeSpacingY: 70,
  groupPadding: 30,
  edgeRouting: 'orthogonal'
};

/**
 * Calculates auto-layout coordinates for all nodes and route points for edges in the diagram.
 */
export function applyAutoLayout(diagram: FlowDiagram, options?: LayoutConfig): FlowDiagram {
  const config: Required<LayoutConfig> = {
    direction: options?.direction || diagram.direction || DEFAULT_CONFIG.direction,
    nodeSpacingX: options?.nodeSpacingX || DEFAULT_CONFIG.nodeSpacingX,
    nodeSpacingY: options?.nodeSpacingY || DEFAULT_CONFIG.nodeSpacingY,
    groupPadding: options?.groupPadding || DEFAULT_CONFIG.groupPadding,
    edgeRouting: options?.edgeRouting || DEFAULT_CONFIG.edgeRouting
  };

  if (diagram.nodes.length === 0) {
    return { ...diagram, direction: config.direction };
  }

  const nodes = diagram.nodes.map(n => ({ ...n }));
  const edges = diagram.edges.map(e => ({ ...e }));
  const groups = diagram.groups.map(g => ({ ...g }));
  const nodeMap = new Map<string, FlowNode>();
  nodes.forEach(n => nodeMap.set(n.id, n));

  // 1. Build adjacency graph
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();
  const inEdges = new Map<string, string[]>();

  nodes.forEach(n => {
    inDegree.set(n.id, 0);
    outEdges.set(n.id, []);
    inEdges.set(n.id, []);
  });

  edges.forEach(e => {
    if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
      outEdges.get(e.source)!.push(e.target);
      inEdges.get(e.target)!.push(e.source);
    }
  });

  // 2. Layer Assignment (Longest Path with cycle detection)
  const ranks = new Map<string, number>();
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function assignRank(nodeId: string, currentRank: number) {
    if (inStack.has(nodeId)) return; // Cycle break
    inStack.add(nodeId);

    const existingRank = ranks.get(nodeId) || 0;
    if (currentRank > existingRank || !ranks.has(nodeId)) {
      ranks.set(nodeId, currentRank);
    }

    for (const neighbor of outEdges.get(nodeId) || []) {
      assignRank(neighbor, ranks.get(nodeId)! + 1);
    }

    inStack.delete(nodeId);
    visited.add(nodeId);
  }

  // Start with root nodes (inDegree === 0)
  const rootNodes = nodes.filter(n => (inDegree.get(n.id) || 0) === 0);
  if (rootNodes.length > 0) {
    rootNodes.forEach(n => assignRank(n.id, 0));
  }
  // If disconnected or cycles left unvisited nodes
  nodes.forEach(n => {
    if (!visited.has(n.id)) {
      assignRank(n.id, 0);
    }
  });

  // 3. Group nodes by layer
  let maxRank = 0;
  ranks.forEach(r => {
    if (r > maxRank) maxRank = r;
  });

  const layers: FlowNode[][] = Array.from({ length: maxRank + 1 }, () => []);
  nodes.forEach(node => {
    const r = ranks.get(node.id) || 0;
    layers[r].push(node);
  });

  // 4. Advanced Crossing Minimization (Multi-pass Alternating Sugiyama Sweeps & Transpositions)
  function countLayerCrossings(l1: FlowNode[], l2: FlowNode[]): number {
    const pos1 = new Map<string, number>();
    l1.forEach((n, idx) => pos1.set(n.id, idx));
    const pos2 = new Map<string, number>();
    l2.forEach((n, idx) => pos2.set(n.id, idx));

    const connections: { u: number; v: number }[] = [];
    edges.forEach(e => {
      const u = pos1.get(e.source);
      const v = pos2.get(e.target);
      if (u !== undefined && v !== undefined) {
        connections.push({ u, v });
      }
      const ru = pos1.get(e.target);
      const rv = pos2.get(e.source);
      if (ru !== undefined && rv !== undefined) {
        connections.push({ u: ru, v: rv });
      }
    });

    let xCount = 0;
    const len = connections.length;
    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        const c1 = connections[i];
        const c2 = connections[j];
        if ((c1.u < c2.u && c1.v > c2.v) || (c1.u > c2.u && c1.v < c2.v)) {
          xCount++;
        }
      }
    }
    return xCount;
  }

  function countTotalCrossings(layerConfig: FlowNode[][]): number {
    let sum = 0;
    for (let r = 0; r < layerConfig.length - 1; r++) {
      sum += countLayerCrossings(layerConfig[r], layerConfig[r + 1]);
    }
    return sum;
  }

  let bestLayers = layers.map(layer => [...layer]);
  let minCrossings = countTotalCrossings(bestLayers);

  // Perform alternating barycentric sweeps (forward and backward)
  const SWEEP_ITERATIONS = 10;
  for (let iter = 0; iter < SWEEP_ITERATIONS; iter++) {
    const isDownSweep = iter % 2 === 0;

    if (isDownSweep) {
      // Down sweep: adjust ranks 1 .. maxRank based on previous layers
      for (let r = 1; r <= maxRank; r++) {
        const prevLayer = layers[r - 1];
        const prevPosMap = new Map<string, number>();
        prevLayer.forEach((n, idx) => prevPosMap.set(n.id, idx));

        const nextLayer = r < maxRank ? layers[r + 1] : null;
        const nextPosMap = new Map<string, number>();
        if (nextLayer) nextLayer.forEach((n, idx) => nextPosMap.set(n.id, idx));

        layers[r].sort((a, b) => {
          const aIn = (inEdges.get(a.id) || []).filter(id => prevPosMap.has(id));
          const bIn = (inEdges.get(b.id) || []).filter(id => prevPosMap.has(id));

          let aScore = aIn.length > 0
            ? aIn.reduce((sum, id) => sum + (prevPosMap.get(id) ?? 0), 0) / aIn.length
            : -1;
          let bScore = bIn.length > 0
            ? bIn.reduce((sum, id) => sum + (prevPosMap.get(id) ?? 0), 0) / bIn.length
            : -1;

          // Tie-breaking with out edges if available
          if (aScore === -1 && nextLayer) {
            const aOut = (outEdges.get(a.id) || []).filter(id => nextPosMap.has(id));
            if (aOut.length > 0) aScore = aOut.reduce((sum, id) => sum + (nextPosMap.get(id) ?? 0), 0) / aOut.length;
          }
          if (bScore === -1 && nextLayer) {
            const bOut = (outEdges.get(b.id) || []).filter(id => nextPosMap.has(id));
            if (bOut.length > 0) bScore = bOut.reduce((sum, id) => sum + (nextPosMap.get(id) ?? 0), 0) / bOut.length;
          }

          if (aScore === -1) aScore = 0;
          if (bScore === -1) bScore = 0;
          return aScore - bScore;
        });
      }
    } else {
      // Up sweep: adjust ranks maxRank-1 down to 0 based on next layers
      for (let r = maxRank - 1; r >= 0; r--) {
        const nextLayer = layers[r + 1];
        const nextPosMap = new Map<string, number>();
        nextLayer.forEach((n, idx) => nextPosMap.set(n.id, idx));

        const prevLayer = r > 0 ? layers[r - 1] : null;
        const prevPosMap = new Map<string, number>();
        if (prevLayer) prevLayer.forEach((n, idx) => prevPosMap.set(n.id, idx));

        layers[r].sort((a, b) => {
          const aOut = (outEdges.get(a.id) || []).filter(id => nextPosMap.has(id));
          const bOut = (outEdges.get(b.id) || []).filter(id => nextPosMap.has(id));

          let aScore = aOut.length > 0
            ? aOut.reduce((sum, id) => sum + (nextPosMap.get(id) ?? 0), 0) / aOut.length
            : -1;
          let bScore = bOut.length > 0
            ? bOut.reduce((sum, id) => sum + (nextPosMap.get(id) ?? 0), 0) / bOut.length
            : -1;

          // Tie-breaking with in edges if available
          if (aScore === -1 && prevLayer) {
            const aIn = (inEdges.get(a.id) || []).filter(id => prevPosMap.has(id));
            if (aIn.length > 0) aScore = aIn.reduce((sum, id) => sum + (prevPosMap.get(id) ?? 0), 0) / aIn.length;
          }
          if (bScore === -1 && prevLayer) {
            const bIn = (inEdges.get(b.id) || []).filter(id => prevPosMap.has(id));
            if (bIn.length > 0) bScore = bIn.reduce((sum, id) => sum + (prevPosMap.get(id) ?? 0), 0) / bIn.length;
          }

          if (aScore === -1) aScore = 0;
          if (bScore === -1) bScore = 0;
          return aScore - bScore;
        });
      }
    }

    // Local transposition: try swapping adjacent pairs if it strictly reduces crossings
    for (let r = 0; r <= maxRank; r++) {
      const layer = layers[r];
      if (layer.length <= 1) continue;
      for (let i = 0; i < layer.length - 1; i++) {
        const beforeSwap = (r > 0 ? countLayerCrossings(layers[r - 1], layer) : 0) +
                           (r < maxRank ? countLayerCrossings(layer, layers[r + 1]) : 0);

        // Swap adjacent
        const tmp = layer[i];
        layer[i] = layer[i + 1];
        layer[i + 1] = tmp;

        const afterSwap = (r > 0 ? countLayerCrossings(layers[r - 1], layer) : 0) +
                          (r < maxRank ? countLayerCrossings(layer, layers[r + 1]) : 0);

        if (afterSwap > beforeSwap) {
          // Revert swap
          const rev = layer[i];
          layer[i] = layer[i + 1];
          layer[i + 1] = rev;
        }
      }
    }

    const currentX = countTotalCrossings(layers);
    if (currentX < minCrossings) {
      minCrossings = currentX;
      bestLayers = layers.map(layer => [...layer]);
    }
    if (minCrossings === 0) break; // Perfect planar layout found!
  }

  // Restore the best configuration
  for (let r = 0; r <= maxRank; r++) {
    layers[r] = bestLayers[r];
  }

  // 5. Position Assignment based on Direction
  const isHorizontal = config.direction === 'LR' || config.direction === 'RL';
  const isReversed = config.direction === 'BT' || config.direction === 'RL';

  // Calculate width/height of each layer
  let currentMainOffset = 40; // Top or Left initial padding

  for (let r = 0; r <= maxRank; r++) {
    const actualRank = isReversed ? maxRank - r : r;
    const layer = layers[actualRank];
    if (!layer || layer.length === 0) continue;

    // Calculate maximum cross dimension in this layer
    let maxCrossDim = 0;
    let totalSpan = 0;

    layer.forEach(node => {
      if (isHorizontal) {
        maxCrossDim = Math.max(maxCrossDim, node.width);
        totalSpan += node.height;
      } else {
        maxCrossDim = Math.max(maxCrossDim, node.height);
        totalSpan += node.width;
      }
    });

    totalSpan += (layer.length - 1) * (isHorizontal ? config.nodeSpacingY : config.nodeSpacingX);

    // Center layer nodes around center line (e.g. 400px default center or span-based)
    let currentCrossOffset = -(totalSpan / 2);

    layer.forEach(node => {
      if (isHorizontal) {
        node.x = currentMainOffset;
        node.y = 350 + currentCrossOffset;
        currentCrossOffset += node.height + config.nodeSpacingY;
      } else {
        node.x = 450 + currentCrossOffset;
        node.y = currentMainOffset;
        currentCrossOffset += node.width + config.nodeSpacingX;
      }
    });

    currentMainOffset += maxCrossDim + (isHorizontal ? config.nodeSpacingX : config.nodeSpacingY);
  }

  // Normalize all coordinates so min x >= 40, min y >= 40
  let minX = Infinity;
  let minY = Infinity;
  nodes.forEach(n => {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
  });

  const shiftX = minX < 40 ? 40 - minX : 0;
  const shiftY = minY < 40 ? 40 - minY : 0;

  nodes.forEach(n => {
    n.x = Math.round((n.x + shiftX) / 25) * 25;
    n.y = Math.round((n.y + shiftY) / 25) * 25;
    nodeMap.set(n.id, n);
  });

  // 6. Update Groups to enclose member nodes
  groups.forEach(group => {
    const groupNodes = nodes.filter(n => n.groupId === group.id);
    if (groupNodes.length > 0) {
      let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
      groupNodes.forEach(n => {
        gMinX = Math.min(gMinX, n.x);
        gMinY = Math.min(gMinY, n.y);
        gMaxX = Math.max(gMaxX, n.x + n.width);
        gMaxY = Math.max(gMaxY, n.y + n.height);
      });
      group.x = gMinX - config.groupPadding;
      group.y = gMinY - config.groupPadding;
      group.width = (gMaxX - gMinX) + config.groupPadding * 2;
      group.height = (gMaxY - gMinY) + config.groupPadding * 2;
    }
  });

  // 7. Route Edges & Assign Ports
  edges.forEach(edge => {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) return;

    const srcRank = ranks.get(src.id) ?? 0;
    const tgtRank = ranks.get(tgt.id) ?? 0;
    const isFeedback = tgtRank <= srcRank;

    let srcPort: PortPosition = edge.sourcePort || 'auto';
    let tgtPort: PortPosition = edge.targetPort || 'auto';

    if (srcPort === 'auto') {
      if (isHorizontal) {
        srcPort = isFeedback ? 'top' : 'right';
      } else {
        srcPort = isFeedback ? (src.x > tgt.x ? 'left' : 'right') : 'bottom';
      }
    }

    if (tgtPort === 'auto') {
      if (isHorizontal) {
        tgtPort = isFeedback ? 'top' : 'left';
      } else {
        tgtPort = isFeedback ? (src.x > tgt.x ? 'left' : 'right') : 'top';
      }
    }

    if (src.shape === 'table' || tgt.shape === 'table') {
      const dx = (tgt.x + tgt.width / 2) - (src.x + src.width / 2);
      if (src.shape === 'table') {
        srcPort = dx >= 0 ? 'right' : 'left';
      }
      if (tgt.shape === 'table') {
        tgtPort = dx >= 0 ? 'left' : 'right';
      }
    }

    const startPoint = getNodePortCoordinates(src, srcPort, edge.style?.sourceField, tgt);
    const endPoint = getNodePortCoordinates(tgt, tgtPort, edge.style?.targetField, src);

    edge.sourcePort = srcPort;
    edge.targetPort = tgtPort;
    delete edge.segmentOffset;
    delete edge.segmentOffsets;

    // Compute route waypoints
    const routing = edge.style?.routing || config.edgeRouting;
    edge.points = calculateEdgePoints(startPoint, endPoint, srcPort, tgtPort, routing, isFeedback);
  });

  return {
    ...diagram,
    nodes,
    edges,
    groups,
    direction: config.direction,
    updatedAt: Date.now(),
    version: diagram.version + 1
  };
}

export function getNodePortCoordinates(node: FlowNode, port: PortPosition, fieldName?: string, targetNode?: FlowNode): Point {
  if (node.shape === 'table' && fieldName && node.columns && node.columns.length > 0) {
    const colIdx = node.columns.findIndex(c =>
      (c.name && c.name.toLowerCase() === fieldName.toLowerCase()) ||
      c.id === fieldName
    );
    if (colIdx >= 0) {
      const headerH = 32;
      const rowH = 24;
      const fieldY = node.y + headerH + colIdx * rowH + rowH / 2;

      let effectivePort = port;
      if (targetNode) {
        effectivePort = (targetNode.x + targetNode.width / 2 >= node.x + node.width / 2) ? 'right' : 'left';
      } else if (effectivePort === 'top' || effectivePort === 'bottom' || effectivePort === 'auto') {
        effectivePort = 'right';
      }

      if (effectivePort === 'left') {
        return { x: node.x, y: fieldY };
      } else {
        return { x: node.x + node.width, y: fieldY };
      }
    }
  }

  if (node.shape === 'table' && targetNode) {
    const effectivePort = (targetNode.x + targetNode.width / 2 >= node.x + node.width / 2) ? 'right' : 'left';
    return {
      x: effectivePort === 'left' ? node.x : node.x + node.width,
      y: node.y + node.height / 2
    };
  }

  switch (port) {
    case 'top':
      return { x: node.x + node.width / 2, y: node.y };
    case 'bottom':
      return { x: node.x + node.width / 2, y: node.y + node.height };
    case 'left':
      return { x: node.x, y: node.y + node.height / 2 };
    case 'right':
      return { x: node.x + node.width, y: node.y + node.height / 2 };
    default:
      return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  }
}

export function calculateEdgePoints(
  start: Point,
  end: Point,
  srcPort: PortPosition,
  tgtPort: PortPosition,
  routing: 'orthogonal' | 'bezier' | 'straight' = 'orthogonal',
  isFeedback = false,
  segmentOffsetOrMap?: number | Record<number, number>
): Point[] {
  if (routing === 'straight') {
    return [start, end];
  }

  if (routing === 'bezier') {
    return [start, end];
  }

  const getOffset = (segIdx: number, defaultVal: number): number => {
    if (typeof segmentOffsetOrMap === 'number') {
      return segIdx === 1 || segIdx === 2 ? segmentOffsetOrMap : defaultVal;
    }
    if (segmentOffsetOrMap && typeof segmentOffsetOrMap === 'object') {
      if (segmentOffsetOrMap[segIdx] !== undefined) {
        return segmentOffsetOrMap[segIdx];
      }
    }
    return defaultVal;
  };

  const points: Point[] = [start];
  const MARGIN = 25;

  const srcDir = srcPort === 'top' ? { x: 0, y: -1 } :
                 srcPort === 'bottom' ? { x: 0, y: 1 } :
                 srcPort === 'left' ? { x: -1, y: 0 } : { x: 1, y: 0 };

  const tgtDir = tgtPort === 'top' ? { x: 0, y: -1 } :
                 tgtPort === 'bottom' ? { x: 0, y: 1 } :
                 tgtPort === 'left' ? { x: -1, y: 0 } : { x: 1, y: 0 };

  const isSrcVert = srcPort === 'top' || srcPort === 'bottom';
  const isTgtVert = tgtPort === 'top' || tgtPort === 'bottom';

  // 1. Same side / U-turn loops
  if (srcPort === tgtPort) {
    if (srcPort === 'bottom') {
      const defY = Math.max(start.y, end.y) + MARGIN;
      const maxY = getOffset(1, defY);
      points.push({ x: start.x, y: maxY });
      points.push({ x: end.x, y: maxY });
    } else if (srcPort === 'top') {
      const defY = Math.min(start.y, end.y) - MARGIN;
      const minY = getOffset(1, defY);
      points.push({ x: start.x, y: minY });
      points.push({ x: end.x, y: minY });
    } else if (srcPort === 'right') {
      const defX = Math.max(start.x, end.x) + MARGIN;
      const maxX = getOffset(1, defX);
      points.push({ x: maxX, y: start.y });
      points.push({ x: maxX, y: end.y });
    } else {
      const defX = Math.min(start.x, end.x) - MARGIN;
      const minX = getOffset(1, defX);
      points.push({ x: minX, y: start.y });
      points.push({ x: minX, y: end.y });
    }
  }
  // 2. Both Vertical (e.g. bottom -> top, top -> bottom)
  else if (isSrcVert && isTgtVert) {
    const isDirect = (srcPort === 'bottom' && tgtPort === 'top' && end.y >= start.y + 10) ||
                     (srcPort === 'top' && tgtPort === 'bottom' && start.y >= end.y + 10);
    if (isDirect) {
      const midY = getOffset(1, (start.y + end.y) / 2);
      points.push({ x: start.x, y: midY });
      points.push({ x: end.x, y: midY });
    } else {
      const y1 = getOffset(1, start.y + srcDir.y * MARGIN);
      const midX = getOffset(2, (start.x + end.x) / 2);
      const y2 = getOffset(3, end.y + tgtDir.y * MARGIN);
      points.push({ x: start.x, y: y1 });
      points.push({ x: midX, y: y1 });
      points.push({ x: midX, y: y2 });
      points.push({ x: end.x, y: y2 });
    }
  }
  // 3. Both Horizontal (e.g. right -> left, left -> right)
  else if (!isSrcVert && !isTgtVert) {
    const isDirect = (srcPort === 'right' && tgtPort === 'left' && end.x >= start.x + 10) ||
                     (srcPort === 'left' && tgtPort === 'right' && start.x >= end.x + 10);
    if (isDirect) {
      const midX = getOffset(1, (start.x + end.x) / 2);
      points.push({ x: midX, y: start.y });
      points.push({ x: midX, y: end.y });
    } else {
      const x1 = getOffset(1, start.x + srcDir.x * MARGIN);
      const midY = getOffset(2, (start.y + end.y) / 2);
      const x2 = getOffset(3, end.x + tgtDir.x * MARGIN);
      points.push({ x: x1, y: start.y });
      points.push({ x: x1, y: midY });
      points.push({ x: x2, y: midY });
      points.push({ x: x2, y: end.y });
    }
  }
  // 4. Perpendicular: Vertical Source -> Horizontal Target
  else if (isSrcVert && !isTgtVert) {
    const validSrc = (srcPort === 'bottom' && end.y >= start.y) || (srcPort === 'top' && end.y <= start.y);
    const validTgt = (tgtPort === 'left' && start.x <= end.x) || (tgtPort === 'right' && start.x >= end.x);

    if (validSrc && validTgt) {
      points.push({ x: start.x, y: end.y });
    } else if (validSrc && !validTgt) {
      const tgtX = getOffset(2, end.x + tgtDir.x * MARGIN);
      const midY = getOffset(1, (start.y + end.y) / 2);
      points.push({ x: start.x, y: midY });
      points.push({ x: tgtX, y: midY });
      points.push({ x: tgtX, y: end.y });
    } else if (!validSrc && validTgt) {
      const srcY = getOffset(1, start.y + srcDir.y * MARGIN);
      const midX = getOffset(2, (start.x + end.x) / 2);
      points.push({ x: start.x, y: srcY });
      points.push({ x: midX, y: srcY });
      points.push({ x: midX, y: end.y });
    } else {
      const srcY = getOffset(1, start.y + srcDir.y * MARGIN);
      const tgtX = getOffset(3, end.x + tgtDir.x * MARGIN);
      points.push({ x: start.x, y: srcY });
      points.push({ x: tgtX, y: srcY });
      points.push({ x: tgtX, y: end.y });
    }
  }
  // 5. Perpendicular: Horizontal Source -> Vertical Target
  else {
    const validSrc = (srcPort === 'right' && end.x >= start.x) || (srcPort === 'left' && end.x <= start.x);
    const validTgt = (tgtPort === 'top' && start.y <= end.y) || (tgtPort === 'bottom' && start.y >= end.y);

    if (validSrc && validTgt) {
      points.push({ x: end.x, y: start.y });
    } else if (validSrc && !validTgt) {
      const tgtY = getOffset(2, end.y + tgtDir.y * MARGIN);
      const midX = getOffset(1, (start.x + end.x) / 2);
      points.push({ x: midX, y: start.y });
      points.push({ x: midX, y: tgtY });
      points.push({ x: end.x, y: tgtY });
    } else if (!validSrc && validTgt) {
      const srcX = getOffset(1, start.x + srcDir.x * MARGIN);
      const midY = getOffset(2, (start.y + end.y) / 2);
      points.push({ x: srcX, y: start.y });
      points.push({ x: srcX, y: midY });
      points.push({ x: end.x, y: midY });
    } else {
      const srcX = getOffset(1, start.x + srcDir.x * MARGIN);
      const tgtY = getOffset(3, end.y + tgtDir.y * MARGIN);
      points.push({ x: srcX, y: start.y });
      points.push({ x: srcX, y: tgtY });
      points.push({ x: end.x, y: tgtY });
    }
  }

  points.push(end);
  return simplifyOrthogonalPoints(points);
}

export function simplifyOrthogonalPoints(points: Point[], tolerance = 2): Point[] {
  if (points.length <= 2) return points;

  // 1. Snap nearly aligned adjacent coordinates
  const snapped = points.map(p => ({ x: p.x, y: p.y }));
  for (let i = 0; i < snapped.length - 1; i++) {
    if (Math.abs(snapped[i].x - snapped[i + 1].x) <= tolerance) {
      snapped[i + 1].x = snapped[i].x;
    }
    if (Math.abs(snapped[i].y - snapped[i + 1].y) <= tolerance) {
      snapped[i + 1].y = snapped[i].y;
    }
  }

  // 2. Remove duplicate and collinear points
  const result: Point[] = [snapped[0]];
  for (let i = 1; i < snapped.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = snapped[i];
    const next = snapped[i + 1];

    if (Math.abs(prev.x - curr.x) <= tolerance && Math.abs(prev.y - curr.y) <= tolerance) {
      continue;
    }

    const isCollinearX = Math.abs(prev.x - curr.x) <= tolerance && Math.abs(curr.x - next.x) <= tolerance;
    const isCollinearY = Math.abs(prev.y - curr.y) <= tolerance && Math.abs(curr.y - next.y) <= tolerance;

    if (!isCollinearX && !isCollinearY) {
      result.push(curr);
    }
  }

  const last = snapped[snapped.length - 1];
  const prevToLast = result[result.length - 1];
  if (result.length > 1) {
    const isCollinearX = Math.abs(result[result.length - 2].x - prevToLast.x) <= tolerance && Math.abs(prevToLast.x - last.x) <= tolerance;
    const isCollinearY = Math.abs(result[result.length - 2].y - prevToLast.y) <= tolerance && Math.abs(prevToLast.y - last.y) <= tolerance;
    if (isCollinearX || isCollinearY) {
      result.pop();
    }
  }
  result.push(last);

  return result;
}
