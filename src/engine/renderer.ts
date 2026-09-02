import { FlowDiagram, FlowNode, FlowEdge, FlowGroup, THEMES, DiagramTheme, NodeShape, Point } from './model.js';
import { getNodePortCoordinates, calculateEdgePoints } from './layout.js';

export interface RenderOptions {
  theme?: DiagramTheme;
  showGrid?: boolean;
  transparentBg?: boolean;
  inlineOnly?: boolean;
  padding?: number;
  scale?: number;
  interactive?: boolean;
}

export function renderDiagramToSVG(diagram: FlowDiagram, options?: RenderOptions): string {
  const themeName = options?.theme || diagram.theme || 'dark';
  const theme = THEMES[themeName] || THEMES.dark;
  const padding = options?.padding ?? 12.5;
  const showGrid = options?.showGrid ?? false;
  const transparentBg = options?.transparentBg ?? true;

  // Calculate diagram bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const groups = diagram.groups || [];
  const nodes = diagram.nodes || [];
  const edges = diagram.edges || [];

  if (nodes.length === 0 && groups.length === 0) {
    minX = 0; minY = 0; maxX = 200; maxY = 150;
  } else {
    nodes.forEach(n => {
      let nxMin = n.x;
      let nyMin = n.y;
      let nxMax = n.x + n.width;
      let nyMax = n.y + n.height;
      if (n.shape === 'decision' && !n.branchLabels?.hidden) {
        if (n.branchLabels?.left) nxMin -= 24;
        if (n.branchLabels?.right) nxMax += 24;
        if (n.branchLabels?.top) nyMin -= 14;
        if (n.branchLabels?.bottom) nyMax += 14;
      }
      minX = Math.min(minX, nxMin);
      minY = Math.min(minY, nyMin);
      maxX = Math.max(maxX, nxMax);
      maxY = Math.max(maxY, nyMax);
    });

    groups.forEach(g => {
      minX = Math.min(minX, g.x);
      minY = Math.min(minY, g.y);
      maxX = Math.max(maxX, g.x + g.width);
      maxY = Math.max(maxY, g.y + g.height);
    });

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    diagram.edges.forEach(e => {
      const src = nodeMap.get(e.source);
      const tgt = nodeMap.get(e.target);
      if (!src || !tgt) return;
      const srcPort = e.sourcePort || 'bottom';
      const tgtPort = e.targetPort || 'top';
      const routing = e.style?.routing || 'orthogonal';
      const start = getNodePortCoordinates(src, srcPort);
      const end = getNodePortCoordinates(tgt, tgtPort);
      const points = calculateEdgePoints(start, end, srcPort, tgtPort, routing, false, e.segmentOffsets || e.segmentOffset);
      points.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
    });
  }

  const viewBoxX = Math.floor(minX - padding);
  const viewBoxY = Math.floor(minY - padding);
  const viewBoxWidth = Math.ceil(maxX - minX + padding * 2);
  const viewBoxHeight = Math.ceil(maxY - minY + padding * 2);

  const isInteractive = options?.interactive ?? false;

  // If inlineOnly is requested (for live canvas), render inner elements without viewBox / outer svg
  if (options?.inlineOnly) {
    return renderInnerElements(diagram, theme, isInteractive);
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}" width="${viewBoxWidth}" height="${viewBoxHeight}" class="flowcraft-diagram theme-${themeName}">\n`;

  // Defs
  svg += getSvgDefs(theme);

  // Background only if not transparent
  if (!transparentBg) {
    svg += `  <rect x="${viewBoxX}" y="${viewBoxY}" width="${viewBoxWidth}" height="${viewBoxHeight}" fill="${theme.background}"/>\n`;
    if (showGrid) {
      svg += `  <rect x="${viewBoxX}" y="${viewBoxY}" width="${viewBoxWidth}" height="${viewBoxHeight}" fill="url(#fc-grid-pattern)"/>\n`;
    }
  }

  svg += renderInnerElements(diagram, theme, isInteractive);
  svg += `</svg>`;
  return svg;
}

export function getSvgDefs(theme: typeof THEMES['dark']): string {
  return `  <defs>
    <filter id="fc-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
    <filter id="fc-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <pattern id="fc-grid-pattern" width="25" height="25" patternUnits="userSpaceOnUse">
      <path d="M 25 0 L 0 0 0 25" fill="none" stroke="${theme.gridColor}" stroke-width="1"/>
    </pattern>
    <marker id="fc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="${theme.edgeDefault.stroke}"/>
    </marker>
    <marker id="fc-arrow-accent" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="${theme.accent}"/>
    </marker>
  </defs>\n`;
}

export function renderInnerElements(diagram: FlowDiagram, theme: typeof THEMES['dark'], interactive: boolean = false): string {
  let svg = '';

  // Render Groups
  diagram.groups.forEach(group => {
    svg += renderGroupSVG(group, theme);
  });

  // Render Nodes
  svg += `  <g class="flowcraft-nodes">\n`;
  diagram.nodes.forEach(node => {
    svg += renderNodeSVG(node, theme, interactive);
  });
  svg += `  </g>\n`;

  // Precompute edge points for all edges to detect T-junctions
  const nodeMap = new Map(diagram.nodes.map(n => [n.id, n]));
  const edgePointsMap = new Map<string, Point[]>();
  diagram.edges.forEach(edge => {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) return;
    const srcPort = edge.sourcePort || 'bottom';
    const tgtPort = edge.targetPort || 'top';
    const routing = edge.style?.routing || 'orthogonal';
    const start = getNodePortCoordinates(src, srcPort);
    const end = getNodePortCoordinates(tgt, tgtPort);
    const points = calculateEdgePoints(start, end, srcPort, tgtPort, routing, false, edge.segmentOffsets || edge.segmentOffset);
    edgePointsMap.set(edge.id, points);
  });

  const allMergeArrows = findMergeJunctionArrows(diagram.edges, edgePointsMap);

  // Render Edges (with arrowheads visible on top of nodes)
  svg += `  <g class="flowcraft-edges">\n`;
  diagram.edges.forEach(edge => {
    const points = edgePointsMap.get(edge.id);
    const edgeMergeArrows = allMergeArrows.filter(a => a.edgeId === edge.id);
    svg += renderEdgeSVG(edge, diagram, theme, points, edgeMergeArrows, interactive);
  });
  svg += `  </g>\n`;

  return svg;
}

function renderGroupSVG(group: FlowGroup, theme: typeof THEMES['dark']): string {
  const fill = group.fill || theme.groupDefault.fill;
  const stroke = group.stroke || theme.groupDefault.stroke;
  const strokeDash = group.dashed ? 'stroke-dasharray="6,4"' : '';

  return `  <g class="flowcraft-group" id="group-${group.id}">
    <rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="1.5" ${strokeDash}/>
    <rect x="${group.x + 12}" y="${group.y - 12}" width="${Math.min(group.width - 24, group.label.length * 9 + 20)}" height="24" rx="6" fill="${theme.surface}" stroke="${stroke}" stroke-width="1"/>
    <text x="${group.x + 22}" y="${group.y + 4}" fill="${theme.groupDefault.textColor}" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600">${escapeXml(group.label)}</text>
  </g>\n`;
}

function renderDecisionCornerLabels(node: FlowNode, fontFamily: string, textColor: string): string {
  if (node.branchLabels?.hidden) {
    return '';
  }

  const { x, y, width: w, height: h } = node;
  const cx = x + w / 2;
  const cy = y + h / 2;

  const rawLeft = node.branchLabels?.left;
  const rawRight = node.branchLabels?.right;
  const rawTop = node.branchLabels?.top;
  const rawBottom = node.branchLabels?.bottom;

  let items = '';

  // 1. Left corner (x, cy)
  if (rawLeft) {
    const leftText = typeof rawLeft === 'string' ? rawLeft : rawLeft?.text;
    const leftPos = (typeof rawLeft === 'object' && rawLeft?.position) ? rawLeft.position : (node.branchLabels?.positionMode || 'top');
    if (leftText) {
      let lx: number, ly: number, anchor: string;
      if (leftPos === 'bottom') {
        lx = x - 6; ly = cy + 18; anchor = 'end';
      } else if (leftPos === 'inside') {
        lx = x + 24; ly = cy - 6; anchor = 'start';
      } else {
        lx = x - 6; ly = cy - 8; anchor = 'end';
      }
      items += `<text x="${lx}" y="${ly}" text-anchor="${anchor}" class="flowcraft-branch-label flowcraft-branch-left" data-side="left" data-pos="${leftPos}">${escapeXml(leftText)}</text>`;
    }
  }

  // 2. Right corner (x + w, cy)
  if (rawRight) {
    const rightText = typeof rawRight === 'string' ? rawRight : rawRight?.text;
    const rightPos = (typeof rawRight === 'object' && rawRight?.position) ? rawRight.position : (node.branchLabels?.positionMode || 'top');
    if (rightText) {
      let rx: number, ry: number, anchor: string;
      if (rightPos === 'bottom') {
        rx = x + w + 6; ry = cy + 18; anchor = 'start';
      } else if (rightPos === 'inside') {
        rx = x + w - 24; ry = cy - 6; anchor = 'end';
      } else {
        rx = x + w + 6; ry = cy - 8; anchor = 'start';
      }
      items += `<text x="${rx}" y="${ry}" text-anchor="${anchor}" class="flowcraft-branch-label flowcraft-branch-right" data-side="right" data-pos="${rightPos}">${escapeXml(rightText)}</text>`;
    }
  }

  // 3. Top corner (cx, y) — Верхний выход
  if (rawTop) {
    const topText = typeof rawTop === 'string' ? rawTop : rawTop?.text;
    const topPos = typeof rawTop === 'object' ? rawTop?.position : 'right';
    if (topText) {
      let tx: number, ty: number, anchor: string;
      if (topPos === 'left') {
        tx = cx - 8; ty = y - 6; anchor = 'end';
      } else {
        tx = cx + 8; ty = y - 6; anchor = 'start';
      }
      items += `<text x="${tx}" y="${ty}" text-anchor="${anchor}" class="flowcraft-branch-label flowcraft-branch-top" data-side="top" data-pos="${topPos}">${escapeXml(topText)}</text>`;
    }
  }

  // 4. Bottom corner (cx, y + h) — Нижний выход
  if (rawBottom) {
    const bottomText = typeof rawBottom === 'string' ? rawBottom : rawBottom?.text;
    const bottomPos = typeof rawBottom === 'object' ? rawBottom?.position : 'right';
    if (bottomText) {
      let bx: number, by: number, anchor: string;
      if (bottomPos === 'left') {
        bx = cx - 8; by = y + h + 18; anchor = 'end';
      } else {
        bx = cx + 8; by = y + h + 18; anchor = 'start';
      }
      items += `<text x="${bx}" y="${by}" text-anchor="${anchor}" class="flowcraft-branch-label flowcraft-branch-bottom" data-side="bottom" data-pos="${bottomPos}">${escapeXml(bottomText)}</text>`;
    }
  }

  if (!items) return '';

  return `
    <g class="flowcraft-decision-branches" font-family="${fontFamily}" font-size="12" font-weight="600" fill="${textColor}">
      ${items}
    </g>
  `;
}

function renderNodeSVG(node: FlowNode, theme: typeof THEMES['dark'], interactive: boolean = false): string {
  const defaults = theme.nodeDefaults[node.shape] || theme.nodeDefaults.process;
  const fill = node.style?.fill || defaults.fill;
  const stroke = node.style?.stroke || defaults.stroke;
  const strokeWidth = node.style?.strokeWidth ?? 2;
  const textColor = node.style?.textColor || defaults.textColor;
  const fontSize = node.style?.fontSize ?? 14;
  const fontFamily = node.style?.fontFamily || 'system-ui, -apple-system, sans-serif';
  const strokeDash = node.style?.dashed ? 'stroke-dasharray="5,4"' : '';

  const { x, y, width: w, height: h } = node;
  const cx = x + w / 2;
  const cy = y + h / 2;

  let shapeMarkup = '';

  switch (node.shape) {
    // 1. Блок (прямоугольник с прямыми углами)
    case 'process':
      shapeMarkup = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>`;
      break;

    // 2. Условие (горизонтальный ромб)
    case 'decision': {
      const points = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
      const branchMarkup = renderDecisionCornerLabels(node, fontFamily, textColor);

      shapeMarkup = `
        <polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>
        ${branchMarkup}
      `;
      break;
    }

    // 3. Начало / конец (полностью скруглённый прямоугольник - капсула)
    case 'terminal':
      shapeMarkup = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>`;
      break;

    // 4. Подпрограмма (прямоугольник с прямыми углами и линиями по краям)
    case 'subroutine': {
      const sidePadding = 14;
      shapeMarkup = `
        <g>
          <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>
          <line x1="${x + sidePadding}" y1="${y}" x2="${x + sidePadding}" y2="${y + h}" stroke="${stroke}" stroke-width="1.5"/>
          <line x1="${x + w - sidePadding}" y1="${y}" x2="${x + w - sidePadding}" y2="${y + h}" stroke="${stroke}" stroke-width="1.5"/>
        </g>
      `;
      break;
    }

    // 5. Ввод / вывод (параллелограмм)
    case 'io': {
      const slant = 18;
      const points = `${x + slant},${y} ${x + w},${y} ${x + w - slant},${y + h} ${x},${y + h}`;
      shapeMarkup = `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>`;
      break;
    }

    // 6. Дисплей (слева острый угол <, справа полукруг ))
    case 'display': {
      const slant = Math.min(22, w * 0.18);
      const r = h / 2;
      shapeMarkup = `
        <path d="M ${x} ${cy}
                 L ${x + slant} ${y}
                 L ${x + w - r} ${y}
                 A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}
                 L ${x + slant} ${y + h}
                 Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>
      `;
      break;
    }

    // 7. Цикл (6-гранный ромб / шестиугольник)
    case 'hexagon': {
      const offset = 18;
      const points = `${x + offset},${y} ${x + w - offset},${y} ${x + w},${cy} ${x + w - offset},${y + h} ${x + offset},${y + h} ${x},${cy}`;
      shapeMarkup = `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>`;
      break;
    }

    // 8. Ссылка (круг)
    case 'circle': {
      const r = Math.min(w, h) / 2;
      shapeMarkup = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>`;
      break;
    }

    case 'database': {
      const ry = 10;
      shapeMarkup = `
        <g>
          <path d="M ${x} ${y + ry} L ${x} ${y + h - ry} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + h - ry} L ${x + w} ${y + ry} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>
          <ellipse cx="${cx}" cy="${y + h - ry}" rx="${w / 2}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
          <ellipse cx="${cx}" cy="${y + ry}" rx="${w / 2}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        </g>
      `;
      break;
    }

    case 'cloud': {
      shapeMarkup = `
        <path d="M ${x + 25} ${y + h - 10}
                 A 20 20 0 0 1 ${x + 15} ${y + 25}
                 A 25 25 0 0 1 ${cx} ${y + 10}
                 A 25 25 0 0 1 ${x + w - 15} ${y + 20}
                 A 20 20 0 0 1 ${x + w - 25} ${y + h - 10}
                 Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>
      `;
      break;
    }

    case 'note': {
      const fold = 14;
      const points = `${x},${y} ${x + w - fold},${y} ${x + w},${y + fold} ${x + w},${y + h} ${x},${y + h}`;
      shapeMarkup = `
        <g>
          <polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>
          <polygon points="${x + w - fold},${y} ${x + w},${y + fold} ${x + w - fold},${y + fold}" fill="${stroke}" opacity="0.4"/>
        </g>
      `;
      break;
    }

    default:
      shapeMarkup = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>`;
      break;
  }

  // Multi-line Text
  const lines = wrapText(node.label || '');
  const totalTextHeight = lines.length * (fontSize * 1.25);
  const startY = cy - totalTextHeight / 2 + (fontSize * 0.6);

  let textMarkup = `<text x="${cx}" y="${startY}" fill="${textColor}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="500" text-anchor="middle" dominant-baseline="central">\n`;
  lines.forEach((line, idx) => {
    const content = line.length > 0 ? escapeXml(line) : '&#160;';
    textMarkup += `      <tspan x="${cx}" dy="${idx === 0 ? 0 : `${fontSize * 1.25}px`}">${content}</tspan>\n`;
  });
  textMarkup += `    </text>`;

  // Badge
  let badgeMarkup = '';
  if (node.style?.badge) {
    const badgeColor = node.style.badgeColor || theme.accent;
    const badgeX = x + w - 8;
    const badgeY = y + 8;
    badgeMarkup = `
      <g class="node-badge" transform="translate(${badgeX}, ${badgeY})">
        <circle r="9" fill="${badgeColor}"/>
        <text y="3" fill="#ffffff" font-family="${fontFamily}" font-size="10" font-weight="700" text-anchor="middle">${escapeXml(node.style.badge)}</text>
      </g>
    `;
  }

  // 4 Connection Ports (Top, Right, Bottom, Left) — только для интерактивного режима холста
  let portsMarkup = '';
  if (interactive) {
    const portOffset = 12;
    portsMarkup = `
      <g class="flowcraft-ports">
        <g class="flowcraft-port-group" data-port="top" data-cx="${cx}" data-cy="${y - portOffset}">
          <circle class="flowcraft-port-hit" cx="${cx}" cy="${y - portOffset}" r="16" fill="transparent"/>
          <circle class="flowcraft-port" cx="${cx}" cy="${y - portOffset}" r="4.5"/>
        </g>
        <g class="flowcraft-port-group" data-port="right" data-cx="${x + w + portOffset}" data-cy="${cy}">
          <circle class="flowcraft-port-hit" cx="${x + w + portOffset}" cy="${cy}" r="16" fill="transparent"/>
          <circle class="flowcraft-port" cx="${x + w + portOffset}" cy="${cy}" r="4.5"/>
        </g>
        <g class="flowcraft-port-group" data-port="bottom" data-cx="${cx}" data-cy="${y + h + portOffset}">
          <circle class="flowcraft-port-hit" cx="${cx}" cy="${y + h + portOffset}" r="16" fill="transparent"/>
          <circle class="flowcraft-port" cx="${cx}" cy="${y + h + portOffset}" r="4.5"/>
        </g>
        <g class="flowcraft-port-group" data-port="left" data-cx="${x - portOffset}" data-cy="${cy}">
          <circle class="flowcraft-port-hit" cx="${x - portOffset}" cy="${cy}" r="16" fill="transparent"/>
          <circle class="flowcraft-port" cx="${x - portOffset}" cy="${cy}" r="4.5"/>
        </g>
      </g>
    `;
  }

  // Маркеры изменения размера (Resize Handles) — только для интерактивного режима холста
  let handlesMarkup = '';
  if (interactive) {
    handlesMarkup = '<g class="flowcraft-resize-handles">';
    const hSize = 8;
    const hHalf = hSize / 2;

    if (node.shape === 'circle') {
      handlesMarkup += `
        <rect class="flowcraft-resize-handle" data-handle="n" data-proportional="true" x="${cx - hHalf}" y="${y - hHalf}" width="${hSize}" height="${hSize}"/>
        <rect class="flowcraft-resize-handle" data-handle="e" data-proportional="true" x="${x + w - hHalf}" y="${cy - hHalf}" width="${hSize}" height="${hSize}"/>
        <rect class="flowcraft-resize-handle" data-handle="s" data-proportional="true" x="${cx - hHalf}" y="${y + h - hHalf}" width="${hSize}" height="${hSize}"/>
        <rect class="flowcraft-resize-handle" data-handle="w" data-proportional="true" x="${x - hHalf}" y="${cy - hHalf}" width="${hSize}" height="${hSize}"/>
      `;
    } else {
      handlesMarkup += `
        <rect class="flowcraft-resize-handle" data-handle="nw" x="${x - hHalf}" y="${y - hHalf}" width="${hSize}" height="${hSize}"/>
        <rect class="flowcraft-resize-handle" data-handle="ne" x="${x + w - hHalf}" y="${y - hHalf}" width="${hSize}" height="${hSize}"/>
        <rect class="flowcraft-resize-handle" data-handle="se" x="${x + w - hHalf}" y="${y + h - hHalf}" width="${hSize}" height="${hSize}"/>
        <rect class="flowcraft-resize-handle" data-handle="sw" x="${x - hHalf}" y="${y + h - hHalf}" width="${hSize}" height="${hSize}"/>
        <rect class="flowcraft-resize-handle" data-handle="n" x="${cx - hHalf}" y="${y - hHalf}" width="${hSize}" height="${hSize}"/>
        <rect class="flowcraft-resize-handle" data-handle="e" x="${x + w - hHalf}" y="${cy - hHalf}" width="${hSize}" height="${hSize}"/>
        <rect class="flowcraft-resize-handle" data-handle="s" x="${cx - hHalf}" y="${y + h - hHalf}" width="${hSize}" height="${hSize}"/>
        <rect class="flowcraft-resize-handle" data-handle="w" x="${x - hHalf}" y="${cy - hHalf}" width="${hSize}" height="${hSize}"/>
      `;
    }
    handlesMarkup += '</g>';
  }

  return `  <g class="flowcraft-node" id="node-${node.id}" data-id="${node.id}" data-shape="${node.shape}" style="cursor: pointer;">
    ${shapeMarkup}
    ${textMarkup}
    ${badgeMarkup}
    ${portsMarkup}
    ${handlesMarkup}
  </g>\n`;
}

function buildTrimmedHitPath(points: Point[]): string {
  if (points.length < 2) return '';
  const trimDist = 12;
  const pts = points.map(p => ({ ...p }));

  const d0 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  if (d0 > trimDist) {
    pts[0] = {
      x: pts[0].x + ((pts[1].x - pts[0].x) / d0) * trimDist,
      y: pts[0].y + ((pts[1].y - pts[0].y) / d0) * trimDist
    };
  }

  const last = pts.length - 1;
  const dEnd = Math.hypot(pts[last].x - pts[last - 1].x, pts[last].y - pts[last - 1].y);
  if (dEnd > trimDist) {
    pts[last] = {
      x: pts[last].x - ((pts[last].x - pts[last - 1].x) / dEnd) * trimDist,
      y: pts[last].y - ((pts[last].y - pts[last - 1].y) / dEnd) * trimDist
    };
  }

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

export interface MergeArrow {
  edgeId: string;
  tip: Point;
  dir: Point;
}

export function findMergeJunctionArrows(allEdges: FlowEdge[], edgePointsMap: Map<string, Point[]>): MergeArrow[] {
  const arrows: MergeArrow[] = [];
  const EPSILON = 2.5;

  for (let i = 0; i < allEdges.length; i++) {
    const edgeA = allEdges[i];
    const ptsA = edgePointsMap.get(edgeA.id);
    if (!ptsA || ptsA.length < 3) continue;

    // Check each corner / intermediate point P_k in edgeA (except start P_0 and end P_{last})
    for (let k = 1; k < ptsA.length - 1; k++) {
      const P_prev = ptsA[k - 1];
      const P_curr = ptsA[k];

      const inDx = P_curr.x - P_prev.x;
      const inDy = P_curr.y - P_prev.y;
      const inLen = Math.hypot(inDx, inDy);
      if (inLen < 4) continue;

      const uInX = inDx / inLen;
      const uInY = inDy / inLen;

      // Check against all other edges B that lead to the SAME target node (слияние в один поток)
      for (let j = 0; j < allEdges.length; j++) {
        if (i === j) continue;
        const edgeB = allEdges[j];
        if (edgeA.target !== edgeB.target) continue;

        const ptsB = edgePointsMap.get(edgeB.id);
        if (!ptsB || ptsB.length < 2) continue;

        let foundMerge = false;

        for (let m = 0; m < ptsB.length - 1; m++) {
          const Q1 = ptsB[m];
          const Q2 = ptsB[m + 1];

          const segDx = Q2.x - Q1.x;
          const segDy = Q2.y - Q1.y;
          const segLen = Math.hypot(segDx, segDy);
          if (segLen < 4) continue;

          const isQVert = Math.abs(segDx) < EPSILON;
          const isQHoriz = Math.abs(segDy) < EPSILON;

          const isPInVert = Math.abs(inDx) < EPSILON;
          const isPInHoriz = Math.abs(inDy) < EPSILON;

          if (isQVert && isPInHoriz) {
            if (Math.abs(P_curr.x - Q1.x) < EPSILON) {
              const minY = Math.min(Q1.y, Q2.y) - EPSILON;
              const maxY = Math.max(Q1.y, Q2.y) + EPSILON;
              if (P_curr.y >= minY && P_curr.y <= maxY) {
                arrows.push({
                  edgeId: edgeA.id,
                  tip: { x: Q1.x, y: P_curr.y },
                  dir: { x: uInX, y: uInY }
                });
                foundMerge = true;
                break;
              }
            }
          } else if (isQHoriz && isPInVert) {
            if (Math.abs(P_curr.y - Q1.y) < EPSILON) {
              const minX = Math.min(Q1.x, Q2.x) - EPSILON;
              const maxX = Math.max(Q1.x, Q2.x) + EPSILON;
              if (P_curr.x >= minX && P_curr.x <= maxX) {
                arrows.push({
                  edgeId: edgeA.id,
                  tip: { x: P_curr.x, y: Q1.y },
                  dir: { x: uInX, y: uInY }
                });
                foundMerge = true;
                break;
              }
            }
          }
        }

        if (foundMerge) break;
      }
    }
  }

  return arrows;
}

function renderEdgeSVG(
  edge: FlowEdge,
  diagram: FlowDiagram,
  theme: typeof THEMES['dark'],
  precomputedPoints?: Point[],
  mergeArrows?: MergeArrow[],
  interactive: boolean = false
): string {
  const nodeMap = new Map(diagram.nodes.map(n => [n.id, n]));
  const src = nodeMap.get(edge.source);
  const tgt = nodeMap.get(edge.target);
  if (!src || !tgt) return '';

  const stroke = edge.style?.stroke || theme.edgeDefault.stroke;
  const strokeWidth = edge.style?.strokeWidth ?? 2;
  const strokeDash = edge.style?.dashed ? 'stroke-dasharray="5,5"' : '';
  const animatedClass = edge.style?.animated ? 'class="flowcraft-edge-animated"' : '';

  const srcPort = edge.sourcePort || 'bottom';
  const tgtPort = edge.targetPort || 'top';
  const routing = edge.style?.routing || 'orthogonal';

  const start = getNodePortCoordinates(src, srcPort);
  const end = getNodePortCoordinates(tgt, tgtPort);
  const points = precomputedPoints || calculateEdgePoints(start, end, srcPort, tgtPort, routing, false, edge.segmentOffsets || edge.segmentOffset);
  let pathData = '';

  if (routing === 'bezier' && points.length === 2) {
    const [p0, p1] = points;
    const dy = (p1.y - p0.y) / 2;
    const c1 = { x: p0.x, y: p0.y + dy };
    const c2 = { x: p1.x, y: p1.y - dy };
    pathData = `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p1.x} ${p1.y}`;
  } else {
    pathData = buildRoundedPath(points, 0);
  }

  const hitPathData = routing === 'bezier' ? pathData : buildTrimmedHitPath(points);
  const markerId = stroke === theme.accent ? 'fc-arrow-accent' : 'fc-arrow';

  let mergeArrowsMarkup = '';
  (mergeArrows || []).forEach(ma => {
    const L = 8;
    const W = 4.5;
    const tipX = ma.tip.x;
    const tipY = ma.tip.y;
    const ux = ma.dir.x;
    const uy = ma.dir.y;
    const bx = tipX - L * ux;
    const by = tipY - L * uy;
    const nx = -uy;
    const ny = ux;
    const p1 = `${tipX},${tipY}`;
    const p2 = `${(bx + W * nx).toFixed(1)},${(by + W * ny).toFixed(1)}`;
    const p3 = `${(bx - W * nx).toFixed(1)},${(by - W * ny).toFixed(1)}`;
    mergeArrowsMarkup += `      <polygon class="flowcraft-merge-arrow" points="${p1} ${p2} ${p3}" fill="${stroke}"/>\n`;
  });

  const hitMarkup = interactive
    ? `      <path class="flowcraft-edge-hit" d="${hitPathData}" fill="none" stroke="transparent" stroke-width="14" stroke-linecap="butt" stroke-linejoin="round"/>\n`
    : '';

  let edgeMarkup = `    <g class="flowcraft-edge" id="edge-${edge.id}" data-id="${edge.id}" data-source="${edge.source}" data-target="${edge.target}">
${hitMarkup}      <path class="flowcraft-edge-path" d="${pathData}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash} marker-end="url(#${markerId})" ${animatedClass}/>
${mergeArrowsMarkup}`;

  // Skip edge labels for edges coming from decision nodes — labels are on the diamond corners
  const isFromDecision = src.shape === 'decision';
  if (edge.label && !isFromDecision) {
    const midIdx = Math.floor(points.length / 2);
    const midPoint = points.length % 2 === 0
      ? { x: (points[midIdx - 1].x + points[midIdx].x) / 2, y: (points[midIdx - 1].y + points[midIdx].y) / 2 }
      : points[midIdx];

    const labelTextColor = edge.style?.textColor || theme.edgeDefault.textColor;
    const labelFontSize = edge.style?.fontSize ?? 11;
    const labelWidth = edge.label.length * 7 + 16;
    const labelHeight = 20;

    edgeMarkup += `      <g class="edge-label" transform="translate(${midPoint.x}, ${midPoint.y})">
        <rect x="${-labelWidth / 2}" y="${-labelHeight / 2}" width="${labelWidth}" height="${labelHeight}" rx="5" fill="${theme.surface}" stroke="${stroke}" stroke-width="1" opacity="0.95"/>
        <text y="3.5" fill="${labelTextColor}" font-family="system-ui, -apple-system, sans-serif" font-size="${labelFontSize}" font-weight="600" text-anchor="middle">${escapeXml(edge.label)}</text>
      </g>\n`;
  }

  // Segment handles for intermediate lines (маркеры перемещения средних перемычек) — только для интерактивного режима
  if (interactive && routing === 'orthogonal' && points.length >= 4) {
    for (let i = 1; i < points.length - 2; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      if (segLen >= 12) {
        const isHoriz = Math.abs(p0.y - p1.y) < 1;
        const dir = isHoriz ? 'v' : 'h';
        const mx = (p0.x + p1.x) / 2;
        const my = (p0.y + p1.y) / 2;
        edgeMarkup += `      <g class="flowcraft-edge-segment-handle" data-edge-id="${edge.id}" data-seg-idx="${i}" data-dir="${dir}" transform="translate(${mx}, ${my})">
        <rect x="-8" y="-8" width="16" height="16" rx="4" class="flowcraft-segment-handle-bg"/>
        <circle cx="0" cy="0" r="3.5" class="flowcraft-segment-handle-dot"/>
      </g>\n`;
      }
    }
  }

  edgeMarkup += `    </g>\n`;
  return edgeMarkup;
}

function buildRoundedPath(points: Point[], radius = 0): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (radius <= 0 || points.length <= 2) {
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  }

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const d1 = { x: curr.x - prev.x, y: curr.y - prev.y };
    const d2 = { x: next.x - curr.x, y: next.y - curr.y };

    const len1 = Math.hypot(d1.x, d1.y);
    const len2 = Math.hypot(d2.x, d2.y);

    const actualR = Math.min(radius, len1 / 2, len2 / 2);
    if (actualR <= 0.5) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    const pStart = {
      x: curr.x - (d1.x / len1) * actualR,
      y: curr.y - (d1.y / len1) * actualR
    };

    const pEnd = {
      x: curr.x + (d2.x / len2) * actualR,
      y: curr.y + (d2.y / len2) * actualR
    };

    d += ` L ${pStart.x} ${pStart.y}`;
    d += ` Q ${curr.x} ${curr.y}, ${pEnd.x} ${pEnd.y}`;
  }

  d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
  return d;
}

function wrapText(text: string, maxCharsPerLine?: number): string[] {
  if (!text) return [''];
  return text.split('\n');
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
