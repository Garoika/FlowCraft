// FlowCraft Web UI Client — Русская локализация, бесконечный холст, интерактивные коннекторы (4 стороны), ПКМ панорамирование, ЛКМ множественное выделение и полупрозрачный призрак
(function () {
  function getCurrentDiagramId() {
    const pathname = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('id')) {
      return urlParams.get('id');
    }
    if (pathname.startsWith('/d/')) {
      return decodeURIComponent(pathname.slice(3).replace(/\/$/, ''));
    }
    const clean = pathname.replace(/^\//, '').replace(/\/$/, '');
    if (clean && clean !== 'index.html' && clean !== 'hub.html' && clean !== 'editor') {
      return decodeURIComponent(clean);
    }
    return '';
  }

  let ws = null;
  let diagram = {
    id: getCurrentDiagramId() || 'default',
    title: 'Новая блок-схема',
    theme: 'light',
    direction: 'TB',
    nodes: [],
    edges: [],
    groups: [],
    version: 1
  };

  // Множественное выделение
  const selectedNodes = new Set();
  const selectedEdges = new Set();

  let zoom = 1;
  let panX = 100;
  let panY = 80;
  let isPanning = false;
  let startPanX = 0;
  let startPanY = 0;

  let isSpacePressed = false;
  let isSelecting = false;
  let selectStart = { x: 0, y: 0 };

  let isDraggingNodes = false;
  let dragStartMouse = { x: 0, y: 0 };
  let dragStartNodePositions = new Map(); // id -> { x, y }
  let currentDragDelta = { dx: 0, dy: 0 };

  // Интерактивное создание связей
  let isConnecting = false;
  let connectionSource = null; // { nodeId, port, x, y }

  // Интерактивные маркеры перемещения средних перемычек (Segment Sliders)
  let isDraggingSegment = false;
  let draggingSegmentEdgeId = null;
  let draggingSegmentIndex = null;
  let draggingSegmentDir = null;
  let draggingSegmentInitialPoints = null;

  let currentApprovalId = null;

  // DOM Элементы
  const canvasContainer = document.getElementById('canvasContainer');
  const canvasViewport = document.getElementById('canvasViewport');
  const canvasSvg = document.getElementById('canvasSvg');
  const svgDefs = document.getElementById('svgDefs');
  const viewportGroup = document.getElementById('viewportGroup');
  const selectionBox = document.getElementById('selectionBox');
  const canvasInlineEditor = document.getElementById('canvasInlineEditor');

  let editingNodeId = null;
  let lastNodeClickTime = 0;
  let lastNodeClickId = null;
  let inlineEditOpenTimestamp = 0;

  // Состояние изменения размера узлов (Node Resizing)
  let isResizing = false;
  let resizeNodeId = null;
  let resizeHandleDir = null;
  let resizeIsProportional = false;
  let resizeStartMouse = { x: 0, y: 0 };
  let resizeStartBounds = { x: 0, y: 0, width: 0, height: 0 };
  let resizeCurrentBounds = { x: 0, y: 0, width: 0, height: 0 };
  const diagramTitleInput = document.getElementById('diagramTitleInput');
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  const btnExport = document.getElementById('btnExport');
  const exportMenu = document.getElementById('exportMenu');
  const agentStatus = document.getElementById('agentStatus');
  const agentStatusText = document.getElementById('agentStatusText');
  const floatingActions = document.getElementById('floatingActions');
  const zoomLabel = document.getElementById('zoomLabel');
  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnZoomFit = document.getElementById('btnZoomFit');
  const approvalModal = document.getElementById('approvalModal');
  const approvalMessage = document.getElementById('approvalMessage');
  const approvalComment = document.getElementById('approvalComment');
  const btnApproveApproval = document.getElementById('btnApproveApproval');
  const btnRejectApproval = document.getElementById('btnRejectApproval');

  const defaultBlockWidth = document.getElementById('defaultBlockWidth');
  const defaultBlockHeight = document.getElementById('defaultBlockHeight');

  const SHAPE_DEFAULTS_RU = {
    process: 'Блок действия',
    decision: 'Условие?',
    terminal: 'Начало',
    subroutine: 'Подпрограмма',
    io: 'Ввод',
    display: 'Вывод на дисплей',
    hexagon: 'Цикл N раз',
    circle: 'Ссылка'
  };

  const SHAPE_DIMS = {
    process: { width: 150, height: 50 },
    decision: { width: 150, height: 50 },
    terminal: { width: 150, height: 50 },
    subroutine: { width: 150, height: 50 },
    io: { width: 150, height: 50 },
    display: { width: 150, height: 50 },
    hexagon: { width: 150, height: 50 },
    circle: { width: 50, height: 50 }
  };

  const GRID_STEP = 25;
  const SNAP_STEP = 12.5; // Прилипание по граням клеток (25px) и по их середине (12.5px)

  function snapToGrid(val, step = SNAP_STEP) {
    return Math.round(val / step) * step;
  }

  function getNodePortCoordinates(node, port) {
    if (!node) return { x: 0, y: 0 };
    switch (port) {
      case 'top': return { x: node.x + node.width / 2, y: node.y };
      case 'bottom': return { x: node.x + node.width / 2, y: node.y + node.height };
      case 'left': return { x: node.x, y: node.y + node.height / 2 };
      case 'right': return { x: node.x + node.width, y: node.y + node.height / 2 };
      default: return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
    }
  }

  function escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function getGhostShapeMarkup(node, x, y, w, h) {
    const fill = 'rgba(56, 189, 248, 0.15)';
    const stroke = 'var(--accent)';
    const strokeWidth = '2.5';
    const strokeDash = 'stroke-dasharray="6,4"';
    const cx = x + w / 2;
    const cy = y + h / 2;

    let shapeSvg = '';
    switch (node.shape) {
      case 'process':
        shapeSvg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>`;
        break;
      case 'decision': {
        const pts = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
        shapeSvg = `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>`;
        break;
      }
      case 'terminal':
        shapeSvg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>`;
        break;
      case 'subroutine':
        shapeSvg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/><line x1="${x + 14}" y1="${y}" x2="${x + 14}" y2="${y + h}" stroke="${stroke}" stroke-width="1.5" ${strokeDash}/><line x1="${x + w - 14}" y1="${y}" x2="${x + w - 14}" y2="${y + h}" stroke="${stroke}" stroke-width="1.5" ${strokeDash}/>`;
        break;
      case 'io': {
        const slant = 18;
        const pts = `${x + slant},${y} ${x + w},${y} ${x + w - slant},${y + h} ${x},${y + h}`;
        shapeSvg = `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>`;
        break;
      }
      case 'display': {
        const slant = Math.min(22, w * 0.18);
        const r = h / 2;
        shapeSvg = `<path d="M ${x} ${cy} L ${x + slant} ${y} L ${x + w - r} ${y} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} L ${x + slant} ${y + h} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>`;
        break;
      }
      case 'hexagon': {
        const offset = 18;
        const pts = `${x + offset},${y} ${x + w - offset},${y} ${x + w},${cy} ${x + w - offset},${y + h} ${x + offset},${y + h} ${x},${cy}`;
        shapeSvg = `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>`;
        break;
      }
      case 'circle': {
        const r = Math.min(w, h) / 2;
        shapeSvg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>`;
        break;
      }
      default:
        shapeSvg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash}/>`;
        break;
    }

    let labelText = '';
    if (node.label) {
      const lines = node.label.split('\n');
      const fSize = (node.style && node.style.fontSize) || 14;
      const startY = cy - ((lines.length - 1) * fSize * 1.25) / 2;
      labelText = `<text x="${cx}" y="${startY}" fill="var(--text-primary)" font-size="${fSize}" font-weight="500" text-anchor="middle" dominant-baseline="central" pointer-events="none">\n`;
      lines.forEach((line, idx) => {
        const content = line.length > 0 ? escapeXml(line) : '&#160;';
        labelText += `  <tspan x="${cx}" dy="${idx === 0 ? 0 : `${fSize * 1.25}px`}">${content}</tspan>\n`;
      });
      labelText += `</text>`;
    }

    return `${shapeSvg}${labelText}`;
  }

  function calculateManhattanPoints(start, end, srcPort, tgtPort, segmentOffsetOrMap) {
    const getOffset = (segIdx, defaultVal) => {
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

    const points = [start];
    const MARGIN = 24;

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

  function simplifyOrthogonalPoints(points, tolerance = 2) {
    if (!points || points.length <= 2) return points;

    const snapped = points.map(p => ({ x: p.x, y: p.y }));
    for (let i = 0; i < snapped.length - 1; i++) {
      if (Math.abs(snapped[i].x - snapped[i + 1].x) <= tolerance) {
        snapped[i + 1].x = snapped[i].x;
      }
      if (Math.abs(snapped[i].y - snapped[i + 1].y) <= tolerance) {
        snapped[i + 1].y = snapped[i].y;
      }
    }

    const result = [snapped[0]];
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

  function pointToSegmentDistance(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function buildRoundedPath(points, radius = 0) {
    if (!points || points.length === 0) return '';
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
      const pStart = { x: curr.x - (d1.x / len1) * actualR, y: curr.y - (d1.y / len1) * actualR };
      const pEnd = { x: curr.x + (d2.x / len2) * actualR, y: curr.y + (d2.y / len2) * actualR };
      d += ` L ${pStart.x} ${pStart.y}`;
      d += ` Q ${curr.x} ${curr.y}, ${pEnd.x} ${pEnd.y}`;
    }
    d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
    return d;
  }

  function init() {
    setupDefs();
    const curId = getCurrentDiagramId();
    if (curId) {
      diagram.id = curId;
      fetch(`/api/diagrams/${encodeURIComponent(curId)}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.id) {
            diagram = data;
            syncDiagramUI();
          }
        })
        .catch(() => {});
    }
    setupWebSocket();
    setupCanvasEvents();
    setupToolbarEvents();
    setupPaletteEvents();
    setupKeyboardShortcuts();
    setupInlineEditor();
    setupJsonImport();
    initMcpModal();
    updateTransform();
  }

  function setupDefs() {
    svgDefs.innerHTML = `
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
      <marker id="fc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#38bdf8"/>
      </marker>
      <marker id="fc-arrow-accent" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#38bdf8"/>
      </marker>
    `;
  }

  function getCurrentDiagramId() {
    const pathname = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('id')) {
      return urlParams.get('id');
    }
    if (pathname.startsWith('/d/')) {
      return decodeURIComponent(pathname.slice(3).replace(/\/$/, ''));
    }
    const clean = pathname.replace(/^\//, '').replace(/\/$/, '');
    if (clean && clean !== 'index.html' && clean !== 'hub.html' && clean !== 'editor') {
      return decodeURIComponent(clean);
    }
    return '';
  }

  function setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      const diagId = getCurrentDiagramId();
      if (diagId) {
        sendWs('client:join_diagram', { diagramId: diagId });
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (err) {
        console.error('Ошибка разбора WebSocket сообщения', err);
      }
    };

    ws.onclose = () => {
      setTimeout(setupWebSocket, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  function sendWs(type, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'diagram:init': {
        const curId = getCurrentDiagramId();
        if (curId && msg.payload.diagram?.id && msg.payload.diagram.id !== curId) {
          break;
        }
        diagram = msg.payload.diagram;
        syncDiagramUI();
        if (msg.payload.pendingApprovals && msg.payload.pendingApprovals.length > 0) {
          showApprovalModal(msg.payload.pendingApprovals[0]);
        }
        break;
      }

      case 'diagram:update':
        if (!diagram || !diagram.id || diagram.id === msg.payload.diagram?.id) {
          diagram = msg.payload.diagram;
          syncDiagramUI();
        }
        break;

      case 'agent:activity':
        showAgentActivity(msg.payload.message);
        break;

      case 'approval:requested':
        showApprovalModal(msg.payload);
        break;

      case 'approval:resolved':
        if (currentApprovalId === msg.payload.id) {
          hideApprovalModal();
        }
        break;

      default:
        break;
    }
  }

  function syncDiagramUI() {
    diagramTitleInput.value = diagram.title || 'Новая блок-схема';
    document.title = `${diagram.title || 'Блок-схема'} — FlowCraft`;
    diagram.theme = 'light';

    // Remove legacy edge.labels coming from decision nodes
    if (diagram.edges && diagram.nodes) {
      const decisionIds = new Set(diagram.nodes.filter(n => n.shape === 'decision').map(n => n.id));
      diagram.edges.forEach(e => {
        if (decisionIds.has(e.source) && e.label) {
          delete e.label;
        }
      });
    }

    renderDiagram();
    updateInspector();
  }

  function showAgentActivity(text) {
    agentStatusText.textContent = text;
    agentStatus.classList.remove('hidden');
    clearTimeout(agentStatus._timer);
    agentStatus._timer = setTimeout(() => {
      agentStatus.classList.add('hidden');
    }, 4000);
  }

  function renderDiagram() {
    const diagId = getCurrentDiagramId() || diagram.id || 'default';
    fetch(`/api/export/svg?diagramId=${encodeURIComponent(diagId)}&theme=${diagram.theme}&inline=true&t=${Date.now()}`)
      .then(res => res.text())
      .then(svgInnerMarkup => {
        viewportGroup.innerHTML = svgInnerMarkup;
        attachSvgInteractivity();
        updateSelectionHighlight();
      })
      .catch(err => {
        console.error('Ошибка загрузки SVG', err);
      });
  }

  function attachSvgInteractivity() {
    // 1. Обработка кликов и перетаскивания узлов
    const nodeElements = viewportGroup.querySelectorAll('.flowcraft-node');
    nodeElements.forEach(nodeEl => {
      const id = nodeEl.getAttribute('data-id');

      nodeEl.addEventListener('mousedown', (e) => {
        // Если клик произошел по коннектору или маркеру изменения размера, даем отработать им
        if (e.target.closest('.flowcraft-port-group') || e.target.closest('.flowcraft-resize-handle')) return;

        if (e.button !== 0) return; // Только ЛКМ
        e.stopPropagation();

        // Быстрое определение двойного клика (Click Timer)
        const now = Date.now();
        if (lastNodeClickId === id && now - lastNodeClickTime < 380) {
          lastNodeClickTime = 0;
          lastNodeClickId = null;
          startInlineEditing(id);
          return;
        }
        lastNodeClickTime = now;
        lastNodeClickId = id;

        if (e.shiftKey || e.ctrlKey) {
          if (selectedNodes.has(id)) {
            selectedNodes.delete(id);
          } else {
            selectedNodes.add(id);
          }
        } else {
          if (!selectedNodes.has(id)) {
            selectedNodes.clear();
            selectedEdges.clear();
            selectedNodes.add(id);
          }
        }

        if (e.altKey) {
          copySelected();
          pasteClipboard({ x: 0, y: 0 });
        }

        updateSelectionHighlight();
        updateInspector();

        // Инициализация призрака (Ghost Dragging)
        isDraggingNodes = true;
        dragStartMouse = { x: e.clientX, y: e.clientY };
        currentDragDelta = { dx: 0, dy: 0 };
        dragStartNodePositions.clear();

        const oldOriginGroup = viewportGroup.querySelector('#ghost-origin-group');
        if (oldOriginGroup) oldOriginGroup.remove();

        const originGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        originGroup.setAttribute('id', 'ghost-origin-group');
        originGroup.setAttribute('class', 'ghost-origin-group');

        selectedNodes.forEach(nodeId => {
          const n = diagram.nodes.find(item => item.id === nodeId);
          if (n) {
            dragStartNodePositions.set(nodeId, { x: n.x, y: n.y });

            const originalNodeEl = viewportGroup.querySelector(`#node-${nodeId}`);
            if (originalNodeEl) {
              const clone = originalNodeEl.cloneNode(true);
              clone.removeAttribute('id');
              clone.setAttribute('class', 'flowcraft-node ghost-origin-anchor');
              originGroup.appendChild(clone);

              originalNodeEl.classList.add('ghost-dragging');
            }
          }
        });

        viewportGroup.insertBefore(originGroup, viewportGroup.firstChild);
      });

      nodeEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startInlineEditing(id);
      });
    });

    // 2. Обработка 4 коннекторов на каждом блоке (Top, Right, Bottom, Left)
    const portGroupElements = viewportGroup.querySelectorAll('.flowcraft-port-group');
    portGroupElements.forEach(portGroupEl => {
      portGroupEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();

        const nodeEl = portGroupEl.closest('.flowcraft-node');
        const sourceNodeId = nodeEl.getAttribute('data-id');
        const sourcePort = portGroupEl.getAttribute('data-port');
        const cx = parseFloat(portGroupEl.getAttribute('data-cx'));
        const cy = parseFloat(portGroupEl.getAttribute('data-cy'));

        isConnecting = true;
        connectionSource = { nodeId: sourceNodeId, port: sourcePort, x: cx, y: cy };
        document.body.classList.add('is-connecting-mode');

        let tempEdge = viewportGroup.querySelector('#temp-connecting-edge');
        if (!tempEdge) {
          tempEdge = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          tempEdge.setAttribute('id', 'temp-connecting-edge');
          tempEdge.setAttribute('marker-end', 'url(#fc-arrow-accent)');
          viewportGroup.appendChild(tempEdge);
        }
        tempEdge.setAttribute('d', `M ${cx} ${cy} L ${cx} ${cy}`);
      });
    });

    // 3. Обработка связей: клик, создание точек-перемычек (Waypoints) и перетаскивание линий
    // 3. Обработка связей: выделение кликом
    const edgeElements = viewportGroup.querySelectorAll('.flowcraft-edge');
    edgeElements.forEach(edgeEl => {
      const id = edgeEl.getAttribute('data-id') || edgeEl.id.replace('edge-', '');

      edgeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!e.shiftKey && !e.ctrlKey) {
          selectedNodes.clear();
          selectedEdges.clear();
        }
        if (selectedEdges.has(id) && (e.shiftKey || e.ctrlKey)) {
          selectedEdges.delete(id);
        } else {
          selectedEdges.add(id);
        }
        updateSelectionHighlight();
        updateInspector();
      });
    });

    // 4. Обработка автоматических маркеров перемещения средних перемычек (Segment Sliders)
    const segmentHandles = viewportGroup.querySelectorAll('.flowcraft-edge-segment-handle');
    segmentHandles.forEach(handle => {
      bindSegmentHandleEvents(handle);
    });

    // 5. Обработка маркеров изменения размера (Resize Handles)
    const resizeHandles = viewportGroup.querySelectorAll('.flowcraft-resize-handle');
    resizeHandles.forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();

        const nodeEl = handle.closest('.flowcraft-node');
        const id = nodeEl?.getAttribute('data-id');
        const node = diagram.nodes.find(n => n.id === id);
        if (!node) return;

        isResizing = true;
        resizeNodeId = id;
        resizeHandleDir = handle.getAttribute('data-handle');
        resizeIsProportional = handle.getAttribute('data-proportional') === 'true' || node.shape === 'circle';
        resizeStartMouse = { x: e.clientX, y: e.clientY };
        resizeStartBounds = { x: node.x, y: node.y, width: node.width, height: node.height };
        resizeCurrentBounds = { ...resizeStartBounds };

        // Исходному узлу даем класс anchor
        if (nodeEl) {
          nodeEl.classList.add('ghost-origin-anchor');
        }

        // Создаем / обновляем элемент призрака изменения размера
        let ghostEl = viewportGroup.querySelector('#resize-ghost-preview');
        if (!ghostEl) {
          ghostEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          ghostEl.setAttribute('id', 'resize-ghost-preview');
          ghostEl.setAttribute('class', 'flowcraft-resize-ghost');
          viewportGroup.appendChild(ghostEl);
        }
        ghostEl.innerHTML = getGhostShapeMarkup(node, node.x, node.y, node.width, node.height);
      });
    });
  }

  function bindSegmentHandleEvents(handle) {
    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const edgeId = handle.getAttribute('data-edge-id');
      const segIdx = parseInt(handle.getAttribute('data-seg-idx'), 10) || 1;
      const dir = handle.getAttribute('data-dir');
      const edge = diagram.edges.find(item => item.id === edgeId);
      if (!edge) return;

      isDraggingSegment = true;
      draggingSegmentEdgeId = edgeId;
      draggingSegmentIndex = segIdx;
      draggingSegmentDir = dir;

      selectedNodes.clear();
      selectedEdges.clear();
      selectedEdges.add(edgeId);
      updateSelectionHighlight();
      updateInspector();
    });

    handle.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const edgeId = handle.getAttribute('data-edge-id');
      const edge = diagram.edges.find(item => item.id === edgeId);
      if (edge) {
        delete edge.segmentOffset;
        delete edge.segmentOffsets;
        delete edge.points;
        sendWs('client:update_diagram', diagram);
        renderDiagram();
      }
    });
  }

  function updateEdgeHandlesInDOM(edgeEl, edgeId, points) {
    if (!edgeEl) return;
    const existingHandles = edgeEl.querySelectorAll('.flowcraft-edge-segment-handle');
    existingHandles.forEach(h => h.remove());

    if (points && points.length >= 4) {
      for (let i = 1; i < points.length - 2; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        if (segLen >= 12) {
          const isHoriz = Math.abs(p0.y - p1.y) < 1;
          const dir = isHoriz ? 'v' : 'h';
          const mx = (p0.x + p1.x) / 2;
          const my = (p0.y + p1.y) / 2;

          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          g.setAttribute('class', 'flowcraft-edge-segment-handle');
          g.setAttribute('data-edge-id', edgeId);
          g.setAttribute('data-seg-idx', String(i));
          g.setAttribute('data-dir', dir);
          g.setAttribute('transform', `translate(${mx}, ${my})`);

          g.innerHTML = `
            <rect x="-8" y="-8" width="16" height="16" rx="4" class="flowcraft-segment-handle-bg"/>
            <circle cx="0" cy="0" r="3.5" class="flowcraft-segment-handle-dot"/>
          `;

          bindSegmentHandleEvents(g);
          edgeEl.appendChild(g);
        }
      }
    }
  }

  function updateSelectionHighlight() {
    viewportGroup.querySelectorAll('.flowcraft-node').forEach(el => {
      const id = el.getAttribute('data-id');
      if (selectedNodes.has(id)) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });

    viewportGroup.querySelectorAll('.flowcraft-edge').forEach(el => {
      const id = el.id.replace('edge-', '');
      if (selectedEdges.has(id)) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  }

  // Infinite Canvas: ПКМ (Перемещение), ЛКМ (Выделение/Перетягивание), Коннекторы
  function setupCanvasEvents() {
    canvasContainer.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    canvasContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(Math.max(0.15, zoom * zoomFactor), 4);

      const rect = canvasContainer.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      panX = mouseX - (mouseX - panX) * (newZoom / zoom);
      panY = mouseY - (mouseY - panY) * (newZoom / zoom);
      zoom = newZoom;

      updateTransform();
    }, { passive: false });

    if (floatingActions) {
      floatingActions.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
    }

    canvasContainer.addEventListener('mousedown', (e) => {
      // 1. ПКМ ИЛИ Средняя кнопка ИЛИ Пробел + ЛКМ -> ПАНОРАМИРОВАНИЕ
      if (e.button === 2 || e.button === 1 || (e.button === 0 && isSpacePressed)) {
        isPanning = true;
        canvasViewport.classList.add('panning');
        startPanX = e.clientX - panX;
        startPanY = e.clientY - panY;
        return;
      }

      // 2. ЛКМ по пустому месту -> ВЫДЕЛЕНИЕ РАМКОЙ
      if (e.button === 0) {
        if (e.target.closest('.flowcraft-node') || e.target.closest('.flowcraft-edge') || e.target.closest('#floatingActions') || e.target.closest('.floating-actions')) {
          return;
        }

        if (!e.shiftKey && !e.ctrlKey) {
          selectedNodes.clear();
          selectedEdges.clear();
          updateSelectionHighlight();
          updateInspector();
        }

        isSelecting = true;
        selectStart = { x: e.clientX, y: e.clientY };

        const rect = canvasContainer.getBoundingClientRect();
        selectionBox.style.left = `${e.clientX - rect.left}px`;
        selectionBox.style.top = `${e.clientY - rect.top}px`;
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
        selectionBox.style.display = 'block';
        selectionBox.classList.remove('hidden');
      }
    });

    canvasContainer.addEventListener('dblclick', (e) => {
      const nodeEl = e.target.closest('.flowcraft-node');
      if (nodeEl) {
        const id = nodeEl.getAttribute('data-id');
        if (id) {
          e.preventDefault();
          e.stopPropagation();
          startInlineEditing(id);
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      // 1. Панорамирование
      if (isPanning) {
        panX = e.clientX - startPanX;
        panY = e.clientY - startPanY;
        updateTransform();
        return;
      }

      // 2. Интерактивная протяжка связи от коннектора к курсору с геометрическим захватом порта
      if (isConnecting && connectionSource) {
        const rect = canvasContainer.getBoundingClientRect();
        const worldX = (e.clientX - rect.left - panX) / zoom;
        const worldY = (e.clientY - rect.top - panY) / zoom;

        // Поиск ближайшего порта для магнитного притяжения (Snap Zone 32px)
        const targetPortInfo = findTargetPortUnderCursor(worldX, worldY, connectionSource.nodeId, 32);

        // Подсветка активного порта зеленым цветом с увеличением (+60%)
        viewportGroup.querySelectorAll('.flowcraft-port-group.port-target-active').forEach(el => el.classList.remove('port-target-active'));

        let targetX = worldX;
        let targetY = worldY;

        if (targetPortInfo) {
          targetX = targetPortInfo.x;
          targetY = targetPortInfo.y;
          const targetNodeEl = viewportGroup.querySelector(`#node-${targetPortInfo.nodeId}`);
          if (targetNodeEl) {
            const portGroup = targetNodeEl.querySelector(`.flowcraft-port-group[data-port="${targetPortInfo.port}"]`);
            if (portGroup) portGroup.classList.add('port-target-active');
          }
        }

        const tempEdge = viewportGroup.querySelector('#temp-connecting-edge');
        if (tempEdge) {
          const sx = connectionSource.x;
          const sy = connectionSource.y;
          const midX = (sx + targetX) / 2;
          const midY = (sy + targetY) / 2;

          if (connectionSource.port === 'bottom' || connectionSource.port === 'top') {
            tempEdge.setAttribute('d', `M ${sx} ${sy} L ${sx} ${midY} L ${targetX} ${midY} L ${targetX} ${targetY}`);
          } else {
            tempEdge.setAttribute('d', `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${targetY} L ${targetX} ${targetY}`);
          }
        }
        return;
      }

      // 2.5. Перемещение автоматического маркера средней перемычки (Segment Slider Dragging)
      if (isDraggingSegment && draggingSegmentEdgeId && draggingSegmentIndex !== null) {
        const edge = diagram.edges.find(item => item.id === draggingSegmentEdgeId);
        const src = diagram.nodes.find(n => n.id === edge?.source);
        const tgt = diagram.nodes.find(n => n.id === edge?.target);
        if (edge && src && tgt) {
          const rect = canvasContainer.getBoundingClientRect();
          const worldX = (e.clientX - rect.left - panX) / zoom;
          const worldY = (e.clientY - rect.top - panY) / zoom;

          edge.segmentOffsets = edge.segmentOffsets || {};
          if (draggingSegmentDir === 'v') {
            edge.segmentOffsets[draggingSegmentIndex] = snapToGrid(worldY);
          } else {
            edge.segmentOffsets[draggingSegmentIndex] = snapToGrid(worldX);
          }

          const start = getNodePortCoordinates(src, edge.sourcePort || 'bottom');
          const end = getNodePortCoordinates(tgt, edge.targetPort || 'top');
          const points = calculateManhattanPoints(start, end, edge.sourcePort || 'bottom', edge.targetPort || 'top', edge.segmentOffsets);

          const edgeEl = viewportGroup.querySelector(`#edge-${edge.id}`);
          if (edgeEl) {
            const newPathData = buildRoundedPath(points, 0);
            const pathEl = edgeEl.querySelector('.flowcraft-edge-path');
            const hitEl = edgeEl.querySelector('.flowcraft-edge-hit');
            if (pathEl) pathEl.setAttribute('d', newPathData);
            if (hitEl) hitEl.setAttribute('d', newPathData);

            updateEdgeHandlesInDOM(edgeEl, edge.id, points);
          }

          // Мгновенное 60fps обновление стрелки слияния ГОСТ при движении перемычки
          updateLiveMergeArrowsInDOM();
        }
        return;
      }

      // 2.8. Изменение размера узла (Призрачная фигура / Ghost Resizing)
      if (isResizing && resizeNodeId) {
        const node = diagram.nodes.find(n => n.id === resizeNodeId);
        if (node) {
          const rawDx = (e.clientX - resizeStartMouse.x) / zoom;
          const rawDy = (e.clientY - resizeStartMouse.y) / zoom;

          let newX = resizeStartBounds.x;
          let newY = resizeStartBounds.y;
          let newW = resizeStartBounds.width;
          let newH = resizeStartBounds.height;

          const minW = 50;
          const minH = 25;

          if (resizeIsProportional) {
            let delta = 0;
            if (resizeHandleDir === 'e' || resizeHandleDir === 'se') delta = rawDx;
            else if (resizeHandleDir === 'w' || resizeHandleDir === 'sw') delta = -rawDx;
            else if (resizeHandleDir === 's') delta = rawDy;
            else if (resizeHandleDir === 'n') delta = -rawDy;
            else delta = Math.max(rawDx, rawDy);

            const baseSize = resizeStartBounds.width;
            let targetSize = snapToGrid(Math.max(50, baseSize + delta));

            if (resizeHandleDir === 'w') {
              newX = resizeStartBounds.x + (baseSize - targetSize);
            } else if (resizeHandleDir === 'n') {
              newY = resizeStartBounds.y + (baseSize - targetSize);
            }
            newW = targetSize;
            newH = targetSize;
          } else {
            if (resizeHandleDir.includes('e')) {
              newW = Math.max(minW, snapToGrid(resizeStartBounds.width + rawDx));
            }
            if (resizeHandleDir.includes('w')) {
              const targetX = snapToGrid(resizeStartBounds.x + rawDx);
              const rightEdge = resizeStartBounds.x + resizeStartBounds.width;
              if (rightEdge - targetX >= minW) {
                newX = targetX;
                newW = rightEdge - targetX;
              }
            }
            if (resizeHandleDir.includes('s')) {
              newH = Math.max(minH, snapToGrid(resizeStartBounds.height + rawDy));
            }
            if (resizeHandleDir.includes('n')) {
              const targetY = snapToGrid(resizeStartBounds.y + rawDy);
              const bottomEdge = resizeStartBounds.y + resizeStartBounds.height;
              if (bottomEdge - targetY >= minH) {
                newY = targetY;
                newH = bottomEdge - targetY;
              }
            }
          }

          resizeCurrentBounds = { x: newX, y: newY, width: newW, height: newH };

          const ghostEl = viewportGroup.querySelector('#resize-ghost-preview');
          if (ghostEl) {
            ghostEl.innerHTML = getGhostShapeMarkup(node, newX, newY, newW, newH);
          }
        }
        return;
      }

      // 3. Перемещение призраков узлов (Ghost Dragging по клеточкам)
      if (isDraggingNodes) {
        const rawDx = (e.clientX - dragStartMouse.x) / zoom;
        const rawDy = (e.clientY - dragStartMouse.y) / zoom;

        let dx = snapToGrid(rawDx);
        let dy = snapToGrid(rawDy);

        const firstNodeId = selectedNodes.values().next().value;
        const initPos = firstNodeId ? dragStartNodePositions.get(firstNodeId) : null;
        if (initPos) {
          dx = snapToGrid(initPos.x + rawDx) - initPos.x;
          dy = snapToGrid(initPos.y + rawDy) - initPos.y;
        }

        currentDragDelta = { dx, dy };

        selectedNodes.forEach(nodeId => {
          const el = viewportGroup.querySelector(`#node-${nodeId}`);
          if (el) {
            el.setAttribute('transform', `translate(${dx}, ${dy})`);
          }
        });

        updateLiveEdgePreview(dx, dy);
        return;
      }

      // 4. Выделение рамкой
      if (isSelecting) {
        const rect = canvasContainer.getBoundingClientRect();

        const curX = e.clientX;
        const curY = e.clientY;

        const boxLeft = Math.min(selectStart.x, curX);
        const boxTop = Math.min(selectStart.y, curY);
        const boxWidth = Math.abs(curX - selectStart.x);
        const boxHeight = Math.abs(curY - selectStart.y);

        selectionBox.style.left = `${boxLeft - rect.left}px`;
        selectionBox.style.top = `${boxTop - rect.top}px`;
        selectionBox.style.width = `${boxWidth}px`;
        selectionBox.style.height = `${boxHeight}px`;

        const worldMinX = (boxLeft - rect.left - panX) / zoom;
        const worldMaxX = (boxLeft + boxWidth - rect.left - panX) / zoom;
        const worldMinY = (boxTop - rect.top - panY) / zoom;
        const worldMaxY = (boxTop + boxHeight - rect.top - panY) / zoom;

        diagram.nodes.forEach(n => {
          const nRight = n.x + n.width;
          const nBottom = n.y + n.height;

          const isIntersecting = !(n.x > worldMaxX || nRight < worldMinX || n.y > worldMaxY || nBottom < worldMinY);

          if (isIntersecting) {
            selectedNodes.add(n.id);
          } else if (!e.shiftKey && !e.ctrlKey) {
            selectedNodes.delete(n.id);
          }
        });

        updateSelectionHighlight();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (isPanning) {
        isPanning = false;
        canvasViewport.classList.remove('panning');
      }

      // Фиксация изменения размера узла (Ghost Resizing Commit)
      if (isResizing) {
        isResizing = false;

        const ghostEl = viewportGroup.querySelector('#resize-ghost-preview');
        if (ghostEl) ghostEl.remove();

        viewportGroup.querySelectorAll('.ghost-origin-anchor').forEach(el => {
          el.classList.remove('ghost-origin-anchor');
        });

        if (resizeNodeId && resizeCurrentBounds && (resizeCurrentBounds.width > 0)) {
          const node = diagram.nodes.find(n => n.id === resizeNodeId);
          if (node) {
            node.x = resizeCurrentBounds.x;
            node.y = resizeCurrentBounds.y;
            node.width = resizeCurrentBounds.width;
            node.height = resizeCurrentBounds.height;
            sendWs('client:update_diagram', diagram);
          }
        }

        resizeNodeId = null;
        resizeHandleDir = null;
        renderDiagram();
        updateSelectionHighlight();
      }

      // Фиксация перемещения средней перемычки связи
      if (isDraggingSegment) {
        isDraggingSegment = false;
        draggingSegmentEdgeId = null;
        draggingSegmentIndex = null;
        draggingSegmentDir = null;
        draggingSegmentInitialPoints = null;
        sendWs('client:update_diagram', diagram);
        renderDiagram();
      }

      // Завершение создания связи (Геометрический Snap + Fallback)
      if (isConnecting && connectionSource) {
        document.body.classList.remove('is-connecting-mode');
        viewportGroup.querySelectorAll('.flowcraft-port-group.port-target-active').forEach(el => el.classList.remove('port-target-active'));
        const tempEdge = viewportGroup.querySelector('#temp-connecting-edge');
        if (tempEdge) tempEdge.remove();

        const rect = canvasContainer.getBoundingClientRect();
        const worldX = (e.clientX - rect.left - panX) / zoom;
        const worldY = (e.clientY - rect.top - panY) / zoom;

        // 1. Точный геометрический захват ближайшего порта (34px зона комфортного захвата)
        let targetPortInfo = findTargetPortUnderCursor(worldX, worldY, connectionSource.nodeId, 34);

        // 2. DOM fallback
        if (!targetPortInfo) {
          const elemUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
          const targetPortGroup = elemUnderMouse?.closest('.flowcraft-port-group');
          const targetNodeEl = elemUnderMouse?.closest('.flowcraft-node');

          if (targetPortGroup) {
            const targetNode = targetPortGroup.closest('.flowcraft-node');
            const targetNodeId = targetNode?.getAttribute('data-id');
            const targetPort = targetPortGroup.getAttribute('data-port');
            if (targetNodeId && targetNodeId !== connectionSource.nodeId) {
              targetPortInfo = { nodeId: targetNodeId, port: targetPort };
            }
          } else if (targetNodeEl) {
            const targetNodeId = targetNodeEl.getAttribute('data-id');
            if (targetNodeId && targetNodeId !== connectionSource.nodeId) {
              targetPortInfo = findTargetPortUnderCursor(worldX, worldY, connectionSource.nodeId, Infinity);
            }
          }
        }

        if (targetPortInfo && targetPortInfo.nodeId !== connectionSource.nodeId) {
          const newEdge = {
            id: `edge_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`,
            source: connectionSource.nodeId,
            target: targetPortInfo.nodeId,
            sourcePort: connectionSource.port,
            targetPort: targetPortInfo.port,
            style: { routing: 'orthogonal' }
          };
          diagram.edges.push(newEdge);
          sendWs('client:update_diagram', diagram);
          renderDiagram();
        }

        isConnecting = false;
        connectionSource = null;
      }

      // Фиксация перемещения узлов (Ghost Dragging)
      if (isDraggingNodes) {
        isDraggingNodes = false;
        const oldOriginGroup = viewportGroup.querySelector('#ghost-origin-group');
        if (oldOriginGroup) oldOriginGroup.remove();

        viewportGroup.querySelectorAll('.flowcraft-node.ghost-dragging').forEach(el => {
          el.classList.remove('ghost-dragging');
          el.removeAttribute('transform');
        });

        if (currentDragDelta.dx !== 0 || currentDragDelta.dy !== 0) {
          selectedNodes.forEach(nodeId => {
            const node = diagram.nodes.find(item => item.id === nodeId);
            const originalPos = dragStartNodePositions.get(nodeId);
            if (node && originalPos) {
              node.x = snapToGrid(originalPos.x + currentDragDelta.dx);
              node.y = snapToGrid(originalPos.y + currentDragDelta.dy);
            }
          });

          // Сдвиг промежуточных перемычек линий при совместном перемещении связанных блоков
          diagram.edges.forEach(edge => {
            if (selectedNodes.has(edge.source) && selectedNodes.has(edge.target) && edge.segmentOffsets) {
              const srcPort = edge.sourcePort || 'bottom';
              const tgtPort = edge.targetPort || 'top';
              edge.segmentOffsets = getShiftedSegmentOffsets(edge, srcPort, tgtPort, currentDragDelta.dx, currentDragDelta.dy);
            }
          });

          sendWs('client:update_diagram', diagram);
          renderDiagram();
        }

        dragStartNodePositions.clear();
        currentDragDelta = { dx: 0, dy: 0 };
      }

      // Завершение выделения рамкой
      if (isSelecting) {
        isSelecting = false;
        selectionBox.style.display = 'none';
        selectionBox.classList.add('hidden');
        updateSelectionHighlight();
        updateInspector();
      }
    });
  }

  function getShiftedSegmentOffsets(edge, srcPort, tgtPort, dx, dy) {
    if (!edge || !edge.segmentOffsets) return undefined;
    const isSrcVert = srcPort === 'top' || srcPort === 'bottom';
    const isTgtVert = tgtPort === 'top' || tgtPort === 'bottom';
    const shifted = {};

    Object.keys(edge.segmentOffsets).forEach(k => {
      const idx = parseInt(k, 10);
      const val = edge.segmentOffsets[idx];
      let isX = false;

      if (srcPort === tgtPort) {
        isX = (srcPort === 'left' || srcPort === 'right');
      } else if (isSrcVert && isTgtVert) {
        isX = (idx === 2);
      } else if (!isSrcVert && !isTgtVert) {
        isX = (idx === 1 || idx === 3);
      } else if (isSrcVert && !isTgtVert) {
        isX = (idx === 2 || idx === 3);
      } else {
        isX = (idx === 1 || idx === 3);
      }

      shifted[idx] = val + (isX ? dx : dy);
    });

    return shifted;
  }

  function findTargetPortUnderCursor(worldX, worldY, excludeNodeId, maxSnapDistance = 28) {
    let best = null;
    let minD = maxSnapDistance;

    diagram.nodes.forEach(node => {
      if (node.id === excludeNodeId) return;

      const ports = [
        { port: 'top', x: node.x + node.width / 2, y: node.y - 12 },
        { port: 'bottom', x: node.x + node.width / 2, y: node.y + node.height + 12 },
        { port: 'left', x: node.x - 12, y: node.y + node.height / 2 },
        { port: 'right', x: node.x + node.width + 12, y: node.y + node.height / 2 },
      ];

      ports.forEach(p => {
        const d = Math.hypot(p.x - worldX, p.y - worldY);
        if (d < minD) {
          minD = d;
          best = { nodeId: node.id, port: p.port, x: p.x, y: p.y };
        }
      });
    });

    return best;
  }

  function findMergeJunctionArrows(allEdges, edgePointsMap) {
    const arrows = [];
    const EPSILON = 2.5;

    for (let i = 0; i < allEdges.length; i++) {
      const edgeA = allEdges[i];
      const ptsA = edgePointsMap.get(edgeA.id);
      if (!ptsA || ptsA.length < 3) continue;

      for (let k = 1; k < ptsA.length - 1; k++) {
        const P_prev = ptsA[k - 1];
        const P_curr = ptsA[k];

        const inDx = P_curr.x - P_prev.x;
        const inDy = P_curr.y - P_prev.y;
        const inLen = Math.hypot(inDx, inDy);
        if (inLen < 4) continue;

        const uInX = inDx / inLen;
        const uInY = inDy / inLen;

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

  function updateLiveMergeArrowsInDOM() {
    const edgePointsMap = new Map();
    diagram.edges.forEach(e => {
      const src = diagram.nodes.find(n => n.id === e.source);
      const tgt = diagram.nodes.find(n => n.id === e.target);
      if (!src || !tgt) return;

      const srcMoved = selectedNodes.has(e.source) && isDraggingNodes;
      const tgtMoved = selectedNodes.has(e.target) && isDraggingNodes;
      const srcPos = dragStartNodePositions.get(e.source) || { x: src.x, y: src.y };
      const tgtPos = dragStartNodePositions.get(e.target) || { x: tgt.x, y: tgt.y };

      const curSrcNode = { ...src, x: srcMoved ? srcPos.x + currentDragDelta.dx : src.x, y: srcMoved ? srcPos.y + currentDragDelta.dy : src.y };
      const curTgtNode = { ...tgt, x: tgtMoved ? tgtPos.x + currentDragDelta.dx : tgt.x, y: tgtMoved ? tgtPos.y + currentDragDelta.dy : tgt.y };

      const srcPort = e.sourcePort || 'bottom';
      const tgtPort = e.targetPort || 'top';
      const start = getNodePortCoordinates(curSrcNode, srcPort);
      const end = getNodePortCoordinates(curTgtNode, tgtPort);
      const pts = calculateManhattanPoints(start, end, srcPort, tgtPort, e.segmentOffsets || e.segmentOffset);
      edgePointsMap.set(e.id, pts);
    });

    const mergeArrows = findMergeJunctionArrows(diagram.edges, edgePointsMap);

    viewportGroup.querySelectorAll('.flowcraft-merge-arrow').forEach(el => el.remove());

    mergeArrows.forEach(ma => {
      const edgeEl = viewportGroup.querySelector(`#edge-${ma.edgeId}`);
      if (!edgeEl) return;

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

      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('class', 'flowcraft-merge-arrow');
      poly.setAttribute('points', `${p1} ${p2} ${p3}`);

      const edge = diagram.edges.find(e => e.id === ma.edgeId);
      const stroke = edge?.style?.stroke || '#0ea5e9';
      poly.setAttribute('fill', stroke);

      edgeEl.appendChild(poly);
    });
  }

  function getPortPos(node, port, posX, posY) {
    switch (port) {
      case 'top': return { x: posX + node.width / 2, y: posY };
      case 'bottom': return { x: posX + node.width / 2, y: posY + node.height };
      case 'left': return { x: posX, y: posY + node.height / 2 };
      case 'right': return { x: posX + node.width, y: posY + node.height / 2 };
      default: return { x: posX + node.width / 2, y: posY + node.height };
    }
  }

  function updateLiveEdgePreview(dx, dy) {
    diagram.edges.forEach(edge => {
      const srcMoved = selectedNodes.has(edge.source);
      const tgtMoved = selectedNodes.has(edge.target);
      if (!srcMoved && !tgtMoved) return;

      const edgeEl = viewportGroup.querySelector(`#edge-${edge.id}`);
      if (!edgeEl) return;

      const pathEl = edgeEl.querySelector('.flowcraft-edge-path');
      const hitEl = edgeEl.querySelector('.flowcraft-edge-hit');
      if (!pathEl) return;

      const srcNode = diagram.nodes.find(n => n.id === edge.source);
      const tgtNode = diagram.nodes.find(n => n.id === edge.target);
      if (!srcNode || !tgtNode) return;

      const srcPos = dragStartNodePositions.get(edge.source) || { x: srcNode.x, y: srcNode.y };
      const tgtPos = dragStartNodePositions.get(edge.target) || { x: tgtNode.x, y: tgtNode.y };

      const curSrcNode = { ...srcNode, x: srcMoved ? srcPos.x + dx : srcNode.x, y: srcMoved ? srcPos.y + dy : srcNode.y };
      const curTgtNode = { ...tgtNode, x: tgtMoved ? tgtPos.x + dx : tgtNode.x, y: tgtMoved ? tgtPos.y + dy : tgtNode.y };

      const srcPort = edge.sourcePort || 'bottom';
      const tgtPort = edge.targetPort || 'top';

      const start = getNodePortCoordinates(curSrcNode, srcPort);
      const end = getNodePortCoordinates(curTgtNode, tgtPort);

      const effectiveOffsets = (srcMoved && tgtMoved)
        ? getShiftedSegmentOffsets(edge, srcPort, tgtPort, dx, dy)
        : (edge.segmentOffsets || edge.segmentOffset);

      const points = calculateManhattanPoints(start, end, srcPort, tgtPort, effectiveOffsets);
      const d = buildRoundedPath(points, 0);

      pathEl.setAttribute('d', d);
      if (hitEl) hitEl.setAttribute('d', d);

      updateEdgeHandlesInDOM(edgeEl, edge.id, points);
    });

    updateLiveMergeArrowsInDOM();
  }

  function updateTransform() {
    viewportGroup.setAttribute('transform', `translate(${panX}, ${panY}) scale(${zoom})`);
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;

    const gridSize = GRID_STEP * zoom;
    canvasContainer.style.backgroundPosition = `${panX}px ${panY}px`;
    canvasContainer.style.backgroundSize = `${gridSize}px ${gridSize}px`;

    repositionInlineEditor();
  }

  function setupInlineEditor() {
    if (!canvasInlineEditor) return;

    canvasInlineEditor.addEventListener('mousedown', (e) => e.stopPropagation());
    canvasInlineEditor.addEventListener('click', (e) => e.stopPropagation());
    canvasInlineEditor.addEventListener('dblclick', (e) => e.stopPropagation());

    canvasInlineEditor.addEventListener('input', () => {
      repositionInlineEditor();
    });

    canvasInlineEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.ctrlKey || e.shiftKey) {
          // Ctrl+Enter или Shift+Enter -> вставка новой строки \n
          e.preventDefault();
          const start = canvasInlineEditor.selectionStart;
          const end = canvasInlineEditor.selectionEnd;
          const val = canvasInlineEditor.value;
          canvasInlineEditor.value = val.substring(0, start) + '\n' + val.substring(end);
          canvasInlineEditor.selectionStart = canvasInlineEditor.selectionEnd = start + 1;
          repositionInlineEditor();
        } else {
          // Обычный Enter -> сохранение и выход
          e.preventDefault();
          commitInlineEditing();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelInlineEditing();
      }
    });

    canvasInlineEditor.addEventListener('blur', () => {
      if (Date.now() - inlineEditOpenTimestamp < 350) return;
      commitInlineEditing();
    });
  }

  function startInlineEditing(nodeId) {
    const node = diagram.nodes.find(n => n.id === nodeId);
    if (!node || !canvasInlineEditor) return;

    inlineEditOpenTimestamp = Date.now();
    editingNodeId = nodeId;
    canvasInlineEditor.value = node.label || '';

    // Скрываем SVG-текст пока идет ввод и копируем точный цвет текста
    const nodeEl = viewportGroup.querySelector(`#node-${nodeId}`);
    if (nodeEl) {
      const textEl = nodeEl.querySelector('text');
      if (textEl) {
        const textColor = textEl.getAttribute('fill') || '#f8fafc';
        canvasInlineEditor.style.color = textColor;
        textEl.style.opacity = '0';
      }
    }

    repositionInlineEditor();
    canvasInlineEditor.classList.remove('hidden');

    setTimeout(() => {
      canvasInlineEditor.focus();
      canvasInlineEditor.select();
    }, 20);
  }

  function repositionInlineEditor() {
    if (!editingNodeId || !canvasInlineEditor) return;
    const node = diagram.nodes.find(n => n.id === editingNodeId);
    if (!node) {
      cancelInlineEditing();
      return;
    }

    const baseSize = (node.style && node.style.fontSize) || 14;
    const fontSize = Math.max(1, Math.round(baseSize * zoom));
    const lineHeight = Math.round(fontSize * 1.35);

    canvasInlineEditor.style.fontSize = `${fontSize}px`;
    canvasInlineEditor.style.lineHeight = `${lineHeight}px`;

    const lines = (canvasInlineEditor.value || ' ').split('\n');
    let maxLineLength = 0;
    lines.forEach(l => {
      if (l.length > maxLineLength) maxLineLength = l.length;
    });
    maxLineLength = Math.max(maxLineLength, 4);

    // Точная высота равна количеству строк * lineHeight для идеального центрирования
    const exactTextHeight = lines.length * lineHeight;
    const calculatedWidth = Math.max(node.width * zoom, Math.round(maxLineLength * fontSize * 0.72 + 24 * zoom));

    const screenCenterX = panX + (node.x + node.width / 2) * zoom;
    const screenCenterY = panY + (node.y + node.height / 2) * zoom;

    canvasInlineEditor.style.width = `${calculatedWidth}px`;
    canvasInlineEditor.style.height = `${exactTextHeight}px`;
    canvasInlineEditor.style.left = `${Math.round(screenCenterX - calculatedWidth / 2)}px`;
    canvasInlineEditor.style.top = `${Math.round(screenCenterY - exactTextHeight / 2)}px`;
  }

  function commitInlineEditing() {
    if (!editingNodeId || !canvasInlineEditor) return;
    const currentId = editingNodeId;
    const node = diagram.nodes.find(n => n.id === currentId);
    const newVal = canvasInlineEditor.value;
    editingNodeId = null;
    canvasInlineEditor.classList.add('hidden');

    const nodeEl = viewportGroup.querySelector(`#node-${currentId}`);
    if (nodeEl) {
      const textEl = nodeEl.querySelector('text');
      if (textEl) textEl.style.opacity = '1';
    }

    if (node && node.label !== newVal) {
      node.label = newVal;
      sendWs('client:update_diagram', diagram);
      renderDiagram();
    }
  }

  function cancelInlineEditing() {
    const currentId = editingNodeId;
    editingNodeId = null;
    if (canvasInlineEditor) {
      canvasInlineEditor.classList.add('hidden');
    }
    if (currentId) {
      const nodeEl = viewportGroup.querySelector(`#node-${currentId}`);
      if (nodeEl) {
        const textEl = nodeEl.querySelector('text');
        if (textEl) textEl.style.opacity = '1';
      }
    }
  }

  let currentDraggedPaletteShape = null;

  function getCurrentDefaultDims(shape) {
    const customWidth = parseInt(defaultBlockWidth?.value, 10) || 150;
    const customHeight = parseInt(defaultBlockHeight?.value, 10) || 48;

    if (shape === 'circle') {
      const size = Math.min(customWidth, customHeight);
      return { width: size, height: size };
    }
    return { width: customWidth, height: customHeight };
  }

  function setupPaletteEvents() {
    if (defaultBlockWidth) {
      const savedW = localStorage.getItem('flowcraft_default_width');
      if (savedW) defaultBlockWidth.value = savedW;
      defaultBlockWidth.addEventListener('input', () => {
        localStorage.setItem('flowcraft_default_width', defaultBlockWidth.value);
      });
    }
    if (defaultBlockHeight) {
      const savedH = localStorage.getItem('flowcraft_default_height');
      if (savedH) defaultBlockHeight.value = savedH;
      defaultBlockHeight.addEventListener('input', () => {
        localStorage.setItem('flowcraft_default_height', defaultBlockHeight.value);
      });
    }

    const emptyDragImage = new Image();
    emptyDragImage.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

    const shapeItems = document.querySelectorAll('.shape-item');
    shapeItems.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        const shape = item.getAttribute('data-shape') || 'process';
        currentDraggedPaletteShape = shape;
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', shape);
          e.dataTransfer.effectAllowed = 'copy';
          if (e.dataTransfer.setDragImage) {
            e.dataTransfer.setDragImage(emptyDragImage, 0, 0);
          }
        }
      });

      item.addEventListener('dragend', () => {
        currentDraggedPaletteShape = null;
        const paletteGhost = viewportGroup.querySelector('#palette-drop-ghost');
        if (paletteGhost) paletteGhost.remove();
      });

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const shape = item.getAttribute('data-shape') || 'process';
        addNewNodeAtCenter(shape);
      });
    });

    const handleCanvasDragOver = (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }

      const shape = currentDraggedPaletteShape || 'process';
      const dims = getCurrentDefaultDims(shape);

      const rect = canvasContainer.getBoundingClientRect();
      const worldX = (e.clientX - rect.left - panX) / zoom;
      const worldY = (e.clientY - rect.top - panY) / zoom;

      let paletteGhost = viewportGroup.querySelector('#palette-drop-ghost');
      if (!paletteGhost) {
        paletteGhost = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        paletteGhost.setAttribute('id', 'palette-drop-ghost');
        paletteGhost.setAttribute('class', 'flowcraft-resize-ghost');
        viewportGroup.appendChild(paletteGhost);
      }
      paletteGhost.innerHTML = getGhostShapeMarkup(
        { shape, label: SHAPE_DEFAULTS_RU[shape] || 'Новый блок' },
        0,
        0,
        dims.width,
        dims.height
      );

      const snappedX = snapToGrid(worldX - dims.width / 2);
      const snappedY = snapToGrid(worldY - dims.height / 2);
      paletteGhost.setAttribute('transform', `translate(${snappedX}, ${snappedY})`);
    };

    const handleCanvasDrop = (e) => {
      e.preventDefault();
      const paletteGhost = viewportGroup.querySelector('#palette-drop-ghost');
      if (paletteGhost) paletteGhost.remove();

      let shape = currentDraggedPaletteShape;
      if (!shape && e.dataTransfer) {
        shape = e.dataTransfer.getData('text/plain');
      }
      shape = shape || 'process';
      currentDraggedPaletteShape = null;

      const rect = canvasContainer.getBoundingClientRect();
      const worldX = (e.clientX - rect.left - panX) / zoom;
      const worldY = (e.clientY - rect.top - panY) / zoom;

      const dims = getCurrentDefaultDims(shape);
      const nodeId = `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const newNode = {
        id: nodeId,
        label: SHAPE_DEFAULTS_RU[shape] || 'Новый блок',
        shape: shape,
        x: snapToGrid(worldX - dims.width / 2),
        y: snapToGrid(worldY - dims.height / 2),
        width: dims.width,
        height: dims.height
      };

      diagram.nodes.push(newNode);
      sendWs('client:update_diagram', diagram);
      renderDiagram();

      selectedNodes.clear();
      selectedEdges.clear();
      selectedNodes.add(nodeId);
      updateSelectionHighlight();
      updateInspector();
    };

    canvasContainer.addEventListener('dragover', handleCanvasDragOver);
    canvasContainer.addEventListener('dragleave', () => {
      const paletteGhost = viewportGroup.querySelector('#palette-drop-ghost');
      if (paletteGhost) paletteGhost.remove();
    });
    canvasContainer.addEventListener('drop', handleCanvasDrop);
  }

  function addNewNodeAtCenter(shape) {
    shape = shape || 'process';
    const rect = canvasContainer.getBoundingClientRect();
    const centerX = (rect.width / 2 - panX) / zoom;
    const centerY = (rect.height / 2 - panY) / zoom;

    const dims = getCurrentDefaultDims(shape);
    const nodeId = `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const newNode = {
      id: nodeId,
      label: SHAPE_DEFAULTS_RU[shape] || 'Новый блок',
      shape: shape,
      x: snapToGrid(centerX - dims.width / 2),
      y: snapToGrid(centerY - dims.height / 2),
      width: dims.width,
      height: dims.height
    };

    diagram.nodes.push(newNode);
    sendWs('client:update_diagram', diagram);
    renderDiagram();

    selectedNodes.clear();
    selectedEdges.clear();
    selectedNodes.add(nodeId);
    updateSelectionHighlight();
    updateInspector();
  }

  function setupToolbarEvents() {
    const saveTitle = () => {
      diagram.title = diagramTitleInput.value.trim() || 'Новая блок-схема';
      document.title = `${diagram.title} — FlowCraft`;
      sendWs('client:update_diagram', diagram);
    };

    diagramTitleInput.addEventListener('change', saveTitle);
    diagramTitleInput.addEventListener('blur', saveTitle);
    diagramTitleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveTitle();
        diagramTitleInput.blur();
      }
    });

    btnUndo.addEventListener('click', () => sendWs('client:undo'));
    btnRedo.addEventListener('click', () => sendWs('client:redo'));

    btnZoomIn.addEventListener('click', () => {
      zoom = Math.min(4, zoom * 1.2);
      updateTransform();
    });
    btnZoomOut.addEventListener('click', () => {
      zoom = Math.max(0.15, zoom / 1.2);
      updateTransform();
    });
    btnZoomFit.addEventListener('click', () => {
      zoom = 1;
      panX = 100;
      panY = 80;
      updateTransform();
    });

    btnExport.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu.parentElement.classList.toggle('open');
    });

    window.addEventListener('click', () => {
      exportMenu.parentElement.classList.remove('open');
    });

    document.getElementById('exportSvg').addEventListener('click', () => {
      const diagId = diagram.id || getCurrentDiagramId();
      fetch(`/api/export/svg?diagramId=${encodeURIComponent(diagId)}&theme=${diagram.theme}&transparent=true&t=${Date.now()}`)
        .then(res => res.text())
        .then(svgText => {
          const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${diagram.title || 'diagram'}.svg`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        });
    });

    document.getElementById('exportJson').addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(diagram, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `${diagram.title || 'diagram'}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });

    document.getElementById('exportPng').addEventListener('click', () => {
      exportPngImage();
    });
  }

  function exportPngImage() {
    const diagId = diagram.id || getCurrentDiagramId();
    fetch(`/api/export/svg?diagramId=${encodeURIComponent(diagId)}&theme=${diagram.theme}&transparent=true&t=${Date.now()}`)
      .then(res => res.text())
      .then(svgText => {
        const img = new Image();
        img.onload = () => {
          const scale = 2;
          const svgW = img.naturalWidth || img.width || 1200;
          const svgH = img.naturalHeight || img.height || 800;

          const canvas = document.createElement('canvas');
          canvas.width = svgW * scale;
          canvas.height = svgH * scale;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);

          const a = document.createElement('a');
          a.download = `${diagram.title || 'diagram'}.png`;
          a.href = canvas.toDataURL('image/png');
          a.click();
        };
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
      });
  }

  const DECISION_POSITION_PRESETS = [
    {
      id: 'side-top',
      title: 'Положение: Боковые (Обе сверху)',
      apply: (bl, lText, rText) => ({
        hidden: false,
        mode: 'side-top',
        left: { text: lText, position: 'top' },
        right: { text: rText, position: 'top' },
        top: undefined,
        bottom: undefined
      })
    },
    {
      id: 'side-bottom',
      title: 'Положение: Боковые (Обе снизу)',
      apply: (bl, lText, rText) => ({
        hidden: false,
        mode: 'side-bottom',
        left: { text: lText, position: 'bottom' },
        right: { text: rText, position: 'bottom' },
        top: undefined,
        bottom: undefined
      })
    },
    {
      id: 'side-diag-1',
      title: 'Положение: Слева сверху / Справа снизу',
      apply: (bl, lText, rText) => ({
        hidden: false,
        mode: 'side-diag-1',
        left: { text: lText, position: 'top' },
        right: { text: rText, position: 'bottom' },
        top: undefined,
        bottom: undefined
      })
    },
    {
      id: 'side-diag-2',
      title: 'Положение: Слева снизу / Справа сверху',
      apply: (bl, lText, rText) => ({
        hidden: false,
        mode: 'side-diag-2',
        left: { text: lText, position: 'bottom' },
        right: { text: rText, position: 'top' },
        top: undefined,
        bottom: undefined
      })
    },
    {
      id: 'down-right-1',
      title: 'Положение: Вниз (слева) / Вправо (сверху)',
      apply: (bl, lText, rText) => ({
        hidden: false,
        mode: 'down-right-1',
        bottom: { text: lText, position: 'left' },
        right: { text: rText, position: 'top' },
        left: undefined,
        top: undefined
      })
    },
    {
      id: 'down-right-2',
      title: 'Положение: Вниз (справа) / Вправо (снизу)',
      apply: (bl, lText, rText) => ({
        hidden: false,
        mode: 'down-right-2',
        bottom: { text: lText, position: 'right' },
        right: { text: rText, position: 'bottom' },
        left: undefined,
        top: undefined
      })
    },
    {
      id: 'down-left-1',
      title: 'Положение: Вниз (справа) / Влево (сверху)',
      apply: (bl, lText, rText) => ({
        hidden: false,
        mode: 'down-left-1',
        bottom: { text: rText, position: 'right' },
        left: { text: lText, position: 'top' },
        right: undefined,
        top: undefined
      })
    },
    {
      id: 'down-left-2',
      title: 'Положение: Вниз (слева) / Влево (снизу)',
      apply: (bl, lText, rText) => ({
        hidden: false,
        mode: 'down-left-2',
        bottom: { text: rText, position: 'left' },
        left: { text: lText, position: 'bottom' },
        right: undefined,
        top: undefined
      })
    },
    {
      id: 'vert-right',
      title: 'Положение: Вверх (справа) / Вниз (справа)',
      apply: (bl, lText, rText) => ({
        hidden: false,
        mode: 'vert-right',
        top: { text: lText, position: 'right' },
        bottom: { text: rText, position: 'right' },
        left: undefined,
        right: undefined
      })
    },
    {
      id: 'vert-left',
      title: 'Положение: Вверх (слева) / Вниз (слева)',
      apply: (bl, lText, rText) => ({
        hidden: false,
        mode: 'vert-left',
        top: { text: lText, position: 'left' },
        bottom: { text: rText, position: 'left' },
        left: undefined,
        right: undefined
      })
    },
    {
      id: 'none',
      title: 'Положение: Без меток (Скрыты)',
      apply: (bl, lText, rText) => ({
        hidden: true,
        mode: 'none',
        left: { text: lText, position: 'top' },
        right: { text: rText, position: 'top' },
        top: undefined,
        bottom: undefined
      })
    }
  ];

  function getDecisionTexts(bl) {
    let t1 = 'нет';
    let t2 = 'да';
    if (bl) {
      const activeTexts = [];
      if (bl.left) activeTexts.push(typeof bl.left === 'string' ? bl.left : bl.left.text);
      if (bl.right) activeTexts.push(typeof bl.right === 'string' ? bl.right : bl.right.text);
      if (bl.bottom) activeTexts.push(typeof bl.bottom === 'string' ? bl.bottom : bl.bottom.text);
      if (bl.top) activeTexts.push(typeof bl.top === 'string' ? bl.top : bl.top.text);
      if (activeTexts.length >= 2) {
        t1 = activeTexts[0] || 'нет';
        t2 = activeTexts[1] || 'да';
      } else if (activeTexts.length === 1) {
        t1 = activeTexts[0] || 'нет';
      }
    }
    return { t1, t2 };
  }

  function getDecisionMode(bl) {
    if (!bl) return 'side-top';
    if (bl.hidden) return 'none';
    if (bl.mode) return bl.mode;
    if (bl.top && bl.bottom) {
      const tP = typeof bl.top === 'object' ? bl.top.position : 'right';
      return tP === 'left' ? 'vert-left' : 'vert-right';
    }
    if (bl.bottom && bl.right) {
      const bP = typeof bl.bottom === 'object' ? bl.bottom.position : 'left';
      return bP === 'left' ? 'down-right-1' : 'down-right-2';
    }
    if (bl.bottom && bl.left) {
      const bP = typeof bl.bottom === 'object' ? bl.bottom.position : 'right';
      return bP === 'right' ? 'down-left-1' : 'down-left-2';
    }
    const lPos = (typeof bl.left === 'object' ? bl.left.position : bl.positionMode) || 'top';
    const rPos = (typeof bl.right === 'object' ? bl.right.position : bl.positionMode) || 'top';
    if (lPos === 'top' && rPos === 'top') return 'side-top';
    if (lPos === 'bottom' && rPos === 'bottom') return 'side-bottom';
    if (lPos === 'top' && rPos === 'bottom') return 'side-diag-1';
    if (lPos === 'bottom' && rPos === 'top') return 'side-diag-2';
    return 'side-top';
  }

  function swapDecisionTexts(node) {
    const bl = node.branchLabels || {};
    const corners = [];
    if (bl.left) corners.push('left');
    if (bl.right) corners.push('right');
    if (bl.top) corners.push('top');
    if (bl.bottom) corners.push('bottom');

    if (corners.length === 2) {
      const c1 = corners[0];
      const c2 = corners[1];
      const t1 = typeof bl[c1] === 'string' ? bl[c1] : bl[c1]?.text ?? 'нет';
      const t2 = typeof bl[c2] === 'string' ? bl[c2] : bl[c2]?.text ?? 'да';
      const pos1 = typeof bl[c1] === 'object' ? bl[c1]?.position : undefined;
      const pos2 = typeof bl[c2] === 'object' ? bl[c2]?.position : undefined;

      bl[c1] = { text: t2, position: pos1 };
      bl[c2] = { text: t1, position: pos2 };
    } else {
      const rawLeft = bl.left;
      const rawRight = bl.right;
      const leftText = typeof rawLeft === 'string' ? rawLeft : rawLeft?.text ?? 'нет';
      const rightText = typeof rawRight === 'string' ? rawRight : rawRight?.text ?? 'да';
      const leftPos = (typeof rawLeft === 'object' ? rawLeft?.position : bl.positionMode) || 'top';
      const rightPos = (typeof rawRight === 'object' ? rawRight?.position : bl.positionMode) || 'top';
      bl.left = { text: rightText, position: leftPos };
      bl.right = { text: leftText, position: rightPos };
    }

    diagram.edges.forEach(e => {
      if (e.source === node.id) {
        delete e.label;
      }
    });
  }

  function updateInspector() {
    updateFloatingActions();
  }

  function changeSelectedFontSize(delta) {
    if (selectedNodes.size === 0) return;
    let changed = false;
    selectedNodes.forEach(nodeId => {
      const node = diagram.nodes.find(n => n.id === nodeId);
      if (node) {
        if (!node.style) node.style = {};
        const curSize = node.style.fontSize ?? 14;
        const newSize = Math.max(1, curSize + delta);
        if (newSize !== curSize) {
          node.style.fontSize = newSize;
          changed = true;
        }
      }
    });

    if (changed) {
      sendWs('client:update_diagram', diagram);
      renderDiagram();
      updateInspector();
    }
  }

  function updateFloatingActions() {
    if (!floatingActions) return;

    if (selectedNodes.size === 0 && selectedEdges.size === 0) {
      floatingActions.innerHTML = '';
      floatingActions.classList.add('hidden');
      return;
    }

    floatingActions.classList.remove('hidden');

    let buttonsHtml = '';

    // Кнопки размера шрифта для любых выделенных блоков
    if (selectedNodes.size > 0) {
      buttonsHtml += `
        <button id="btnFontSizeInc" class="btn-floating" title="Увеличить шрифт (+1 пт)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19L9.5 5L15 19"/>
            <path d="M6 14H13"/>
            <path d="M19 8V14"/>
            <path d="M16 11H22"/>
          </svg>
        </button>
        <button id="btnFontSizeDec" class="btn-floating" title="Уменьшить шрифт (-1 пт)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19L9.5 5L15 19"/>
            <path d="M6 14H13"/>
            <path d="M16 11H22"/>
          </svg>
        </button>
      `;
    }

    // Специфические кнопки для одиночного выделения
    if (selectedNodes.size === 1) {
      const singleId = Array.from(selectedNodes)[0];
      const node = diagram.nodes.find(n => n.id === singleId);

      if (node) {
        if (node.shape === 'decision') {
          const curMode = getDecisionMode(node.branchLabels);
          const curPreset = DECISION_POSITION_PRESETS.find(p => p.id === curMode) || DECISION_POSITION_PRESETS[0];
          const posTitle = curPreset.title;
          buttonsHtml += `
            <button id="btnToggleDecisionPos" class="btn-floating" title="${posTitle}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>
              </svg>
            </button>
            <button id="btnSwapDecisionBranches" class="btn-floating" title="Поменять «Да» и «Нет» местами">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>
              </svg>
            </button>
          `;
        } else if (node.shape === 'terminal') {
          const isStart = (node.label || '').trim() === 'Начало';
          const nextLabel = isStart ? 'Конец' : 'Начало';
          buttonsHtml += `
            <button id="btnToggleTerminalText" class="btn-floating" title="Сменить на «${nextLabel}»">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>
              </svg>
            </button>
          `;
        } else if (node.shape === 'io') {
          const isInput = (node.label || '').trim() === 'Ввод';
          const nextLabel = isInput ? 'Вывод' : 'Ввод';
          buttonsHtml += `
            <button id="btnToggleIoText" class="btn-floating" title="Сменить на «${nextLabel}»">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>
              </svg>
            </button>
          `;
        }
      }
    }

    const isEdge = selectedEdges.size > 0 && selectedNodes.size === 0;
    const titleText = isEdge ? 'Удалить связь (Del)' : 'Удалить (Del)';
    buttonsHtml += `
      <button id="btnDeleteSelected" class="btn-floating btn-floating-danger" title="${titleText}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
        </svg>
      </button>
    `;

    floatingActions.innerHTML = buttonsHtml;

    // Attach event handlers
    const btnInc = document.getElementById('btnFontSizeInc');
    if (btnInc) {
      btnInc.addEventListener('click', () => changeSelectedFontSize(1));
    }
    const btnDec = document.getElementById('btnFontSizeDec');
    if (btnDec) {
      btnDec.addEventListener('click', () => changeSelectedFontSize(-1));
    }

    const btnPos = document.getElementById('btnToggleDecisionPos');
    if (btnPos) {
      btnPos.addEventListener('click', () => {
        const singleId = Array.from(selectedNodes)[0];
        const node = diagram.nodes.find(n => n.id === singleId);
        if (!node) return;
        const curIdx = DECISION_POSITION_PRESETS.findIndex(p => p.id === getDecisionMode(node.branchLabels));
        const nextIdx = (curIdx + 1) % DECISION_POSITION_PRESETS.length;
        const nextPreset = DECISION_POSITION_PRESETS[nextIdx];
        const { t1, t2 } = getDecisionTexts(node.branchLabels);
        node.branchLabels = nextPreset.apply(node.branchLabels, t1, t2);
        sendWs('client:update_diagram', diagram);
        renderDiagram();
        updateInspector();
      });
    }

    const btnSwap = document.getElementById('btnSwapDecisionBranches');
    if (btnSwap) {
      btnSwap.addEventListener('click', () => {
        const singleId = Array.from(selectedNodes)[0];
        const node = diagram.nodes.find(n => n.id === singleId);
        if (!node) return;
        swapDecisionTexts(node);
        sendWs('client:update_diagram', diagram);
        renderDiagram();
        updateInspector();
      });
    }

    const btnTerm = document.getElementById('btnToggleTerminalText');
    if (btnTerm) {
      btnTerm.addEventListener('click', () => {
        const singleId = Array.from(selectedNodes)[0];
        const node = diagram.nodes.find(n => n.id === singleId);
        if (!node) return;
        const cur = (node.label || '').trim();
        if (cur === 'Начало' || cur === 'Начало / конец') {
          node.label = 'Конец';
        } else if (cur === 'Конец') {
          node.label = 'Начало';
        } else if (cur.toLowerCase().includes('начало')) {
          node.label = cur.replace(/начало/i, 'Конец');
        } else if (cur.toLowerCase().includes('конец')) {
          node.label = cur.replace(/конец/i, 'Начало');
        } else {
          node.label = 'Конец';
        }
        sendWs('client:update_diagram', diagram);
        renderDiagram();
        updateInspector();
      });
    }

    const btnIo = document.getElementById('btnToggleIoText');
    if (btnIo) {
      btnIo.addEventListener('click', () => {
        const singleId = Array.from(selectedNodes)[0];
        const node = diagram.nodes.find(n => n.id === singleId);
        if (!node) return;
        const cur = (node.label || '').trim();
        if (cur === 'Ввод' || cur === 'Ввод / вывод') {
          node.label = 'Вывод';
        } else if (cur === 'Вывод') {
          node.label = 'Ввод';
        } else if (cur.toLowerCase().includes('ввод') && !cur.toLowerCase().includes('вывод')) {
          node.label = cur.replace(/ввод/i, 'Вывод');
        } else if (cur.toLowerCase().includes('вывод')) {
          node.label = cur.replace(/вывод/i, 'Ввод');
        } else {
          node.label = 'Вывод';
        }
        sendWs('client:update_diagram', diagram);
        renderDiagram();
        updateInspector();
      });
    }

    const btnDel = document.getElementById('btnDeleteSelected');
    if (btnDel) {
      btnDel.addEventListener('click', () => {
        deleteSelected();
      });
    }
  }

  function deleteSelected() {
    if (selectedNodes.size === 0 && selectedEdges.size === 0) return;

    if (selectedNodes.size > 0) {
      diagram.nodes = diagram.nodes.filter(n => !selectedNodes.has(n.id));
      diagram.edges = diagram.edges.filter(e => !selectedNodes.has(e.source) && !selectedNodes.has(e.target));
    }

    if (selectedEdges.size > 0) {
      diagram.edges = diagram.edges.filter(e => !selectedEdges.has(e.id));
    }

    selectedNodes.clear();
    selectedEdges.clear();
    sendWs('client:update_diagram', diagram);
    renderDiagram();
    updateInspector();
  }

  let internalClipboard = null;

  function copySelected() {
    if (selectedNodes.size === 0) return;
    const nodesToCopy = diagram.nodes
      .filter(n => selectedNodes.has(n.id))
      .map(n => JSON.parse(JSON.stringify(n)));

    const edgesToCopy = diagram.edges
      .filter(e => selectedNodes.has(e.source) && selectedNodes.has(e.target))
      .map(e => JSON.parse(JSON.stringify(e)));

    internalClipboard = { nodes: nodesToCopy, edges: edgesToCopy };

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(JSON.stringify(internalClipboard));
      }
    } catch (_) {}
  }

  function pasteClipboard(offset = { x: 25, y: 25 }) {
    if (!internalClipboard || !internalClipboard.nodes || internalClipboard.nodes.length === 0) return;

    const idMap = new Map();
    const newNodes = [];

    internalClipboard.nodes.forEach(node => {
      const newId = `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      idMap.set(node.id, newId);
      const clonedNode = {
        ...JSON.parse(JSON.stringify(node)),
        id: newId,
        x: snapToGrid(node.x + offset.x),
        y: snapToGrid(node.y + offset.y)
      };
      newNodes.push(clonedNode);
    });

    const newEdges = [];
    if (internalClipboard.edges) {
      internalClipboard.edges.forEach(edge => {
        const newSrc = idMap.get(edge.source);
        const newTgt = idMap.get(edge.target);
        if (newSrc && newTgt) {
          const newEdgeId = `edge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          const clonedEdge = {
            ...JSON.parse(JSON.stringify(edge)),
            id: newEdgeId,
            source: newSrc,
            target: newTgt
          };
          newEdges.push(clonedEdge);
        }
      });
    }

    diagram.nodes.push(...newNodes);
    diagram.edges.push(...newEdges);

    selectedNodes.clear();
    selectedEdges.clear();
    newNodes.forEach(n => selectedNodes.add(n.id));

    // Сдвиг координат в буфере, чтобы повторный Ctrl+V создавал каскад
    internalClipboard.nodes.forEach(n => {
      n.x += offset.x;
      n.y += offset.y;
    });

    sendWs('client:update_diagram', diagram);
    renderDiagram();
    updateSelectionHighlight();
    updateInspector();
  }

  function cutSelected() {
    if (selectedNodes.size === 0) return;
    copySelected();
    deleteSelected();
  }

  function duplicateSelected() {
    if (selectedNodes.size === 0) return;
    copySelected();
    pasteClipboard({ x: 25, y: 25 });
  }

  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        isSpacePressed = true;
      }

      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'c' || k === 'с') {
          e.preventDefault();
          copySelected();
        } else if (k === 'x' || k === 'ч') {
          e.preventDefault();
          cutSelected();
        } else if (k === 'v' || k === 'м') {
          e.preventDefault();
          pasteClipboard();
        } else if (k === 'd' || k === 'в') {
          e.preventDefault();
          duplicateSelected();
        } else if (k === 'a' || k === 'ф') {
          e.preventDefault();
          diagram.nodes.forEach(n => selectedNodes.add(n.id));
          updateSelectionHighlight();
          updateInspector();
        } else if (k === 'z' || k === 'я') {
          e.preventDefault();
          if (e.shiftKey) {
            sendWs('client:redo');
          } else {
            sendWs('client:undo');
          }
        } else if (k === 'y' || k === 'н') {
          e.preventDefault();
          sendWs('client:redo');
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      } else if (e.key === 'Escape') {
        selectedNodes.clear();
        selectedEdges.clear();
        updateSelectionHighlight();
        updateInspector();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        isSpacePressed = false;
      }
    });
  }

  function showApprovalModal(request) {
    currentApprovalId = request.id;
    approvalMessage.textContent = request.message;
    approvalComment.value = '';
    approvalModal.classList.add('active');
  }

  function hideApprovalModal() {
    currentApprovalId = null;
    approvalModal.classList.remove('active');
  }

  btnApproveApproval.addEventListener('click', () => {
    if (currentApprovalId) {
      sendWs('client:resolve_approval', {
        id: currentApprovalId,
        approved: true,
        userResponse: approvalComment.value
      });
    }
    hideApprovalModal();
  });

  btnRejectApproval.addEventListener('click', () => {
    if (currentApprovalId) {
      sendWs('client:resolve_approval', {
        id: currentApprovalId,
        approved: false,
        userResponse: approvalComment.value
      });
    }
    hideApprovalModal();
  });

  approvalModal.addEventListener('click', (e) => {
    if (e.target === approvalModal) {
      hideApprovalModal();
    }
  });

  let pendingImportDiagram = null;

  function setupJsonImport() {
    const btnImport = document.getElementById('btnImport');
    const fileInputJson = document.getElementById('fileInputJson');
    const importConfirmModal = document.getElementById('importConfirmModal');
    const btnImportReplace = document.getElementById('btnImportReplace');
    const btnImportCancel = document.getElementById('btnImportCancel');
    const btnCloseImportModal = document.getElementById('btnCloseImportModal');
    const dropZoneOverlay = document.getElementById('dropZoneOverlay');

    if (btnImport && fileInputJson) {
      btnImport.addEventListener('click', () => {
        fileInputJson.value = '';
        fileInputJson.click();
      });

      fileInputJson.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) handleJsonFile(file);
      });
    }

    function openImportModal(parsed) {
      pendingImportDiagram = parsed;
      if (importConfirmModal) {
        importConfirmModal.classList.add('active');
      }
    }

    function closeImportModal() {
      pendingImportDiagram = null;
      if (importConfirmModal) {
        importConfirmModal.classList.remove('active');
      }
    }

    if (btnImportCancel) btnImportCancel.addEventListener('click', closeImportModal);
    if (btnCloseImportModal) btnCloseImportModal.addEventListener('click', closeImportModal);

    if (importConfirmModal) {
      importConfirmModal.addEventListener('click', (e) => {
        if (e.target === importConfirmModal) closeImportModal();
      });
    }

    if (btnImportReplace) {
      btnImportReplace.addEventListener('click', () => {
        if (pendingImportDiagram) {
          applyImportedDiagram(pendingImportDiagram);
        }
        closeImportModal();
      });
    }

    // Drag & Drop JSON files onto the canvas / window
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
        dragCounter++;
        if (dropZoneOverlay) dropZoneOverlay.classList.add('active');
      }
    });

    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });

    window.addEventListener('dragleave', (e) => {
      if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
        dragCounter--;
        if (dragCounter <= 0) {
          dragCounter = 0;
          if (dropZoneOverlay) dropZoneOverlay.classList.remove('active');
        }
      }
    });

    window.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        e.preventDefault();
        dragCounter = 0;
        if (dropZoneOverlay) dropZoneOverlay.classList.remove('active');
        const file = e.dataTransfer.files[0];
        if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
          handleJsonFile(file);
        } else {
          alert('Пожалуйста, выберите файл в формате .json');
        }
      }
    });

    function handleJsonFile(file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.nodes)) {
            alert('Ошибка: выбранный файл не содержит корректную структуру блок-схемы FlowCraft (отсутствует список узлов "nodes").');
            return;
          }

          // Check if diagram has existing nodes
          const hasExisting = diagram.nodes && diagram.nodes.length > 0;
          if (hasExisting) {
            openImportModal(parsed);
          } else {
            applyImportedDiagram(parsed);
          }
        } catch (err) {
          alert('Ошибка чтения JSON: ' + err.message);
        }
      };
      reader.readAsText(file);
    }

    function applyImportedDiagram(imported) {
      diagram = {
        ...diagram,
        id: imported.id || ('diagram-' + Date.now()),
        title: imported.title || 'Импортированная блок-схема',
        description: imported.description || '',
        theme: imported.theme || diagram.theme || 'light',
        direction: imported.direction || diagram.direction || 'TB',
        nodes: imported.nodes || [],
        edges: imported.edges || [],
        groups: imported.groups || [],
        version: (diagram.version || 0) + 1,
        updatedAt: Date.now()
      };

      selectedNodes.clear();
      selectedEdge = null;
      updateSelectionHighlight();
      updateInspector();

      sendWs('client:update_diagram', diagram);
      renderDiagram();

      if (diagramTitleInput) {
        diagramTitleInput.value = diagram.title;
      }
      showAgentActivity('Блок-схема успешно загружена из JSON!');
    }
  }

  function initMcpModal() {
    const btnMcpStatus = document.getElementById('btnMcpStatus');
    const mcpModal = document.getElementById('mcpModal');
    const btnCloseMcpModal = document.getElementById('btnCloseMcpModal');
    const mcpToolsTags = document.getElementById('mcpToolsTags');
    const mcpToolsCount = document.getElementById('mcpToolsCount');
    const mcpConfigCode = document.getElementById('mcpConfigCode');

    async function loadMcpInfo() {
      try {
        const res = await fetch('/api/mcp/info');
        if (!res.ok) return;
        const info = await res.json();

        // 1. Динамический рендеринг всех инструментов
        if (Array.isArray(info.tools) && mcpToolsTags) {
          if (mcpToolsCount) mcpToolsCount.textContent = info.tools.length;
          mcpToolsTags.innerHTML = info.tools.map(t => {
            return `<span class="mcp-tag" title="${escapeHtml(t.description || '')}"><code>${escapeHtml(t.name)}</code></span>`;
          }).join('');
        }

        // 2. Динамическая генерация правильного конфига под текущий запуск (node или exe)
        if (mcpConfigCode && info.scriptPath) {
          const normScript = info.scriptPath.replace(/\\/g, '/');
          const isExe = info.isPkg || (info.execPath && info.execPath.endsWith('.exe') && !info.execPath.toLowerCase().includes('node.exe'));
          
          let cfg;
          if (isExe) {
            const normExe = info.execPath.replace(/\\/g, '/');
            cfg = {
              mcpServers: {
                flowcraft: {
                  command: normExe,
                  args: ["--mcp"]
                }
              }
            };
          } else {
            cfg = {
              mcpServers: {
                flowcraft: {
                  command: "node",
                  args: [normScript]
                }
              }
            };
          }
          mcpConfigCode.textContent = JSON.stringify(cfg, null, 2);
        }
      } catch (err) {
        console.warn('Could not load MCP info:', err);
      }
    }

    if (btnMcpStatus && mcpModal) {
      btnMcpStatus.addEventListener('click', () => {
        loadMcpInfo();
        mcpModal.classList.add('active');
      });

      const closeMcp = () => {
        mcpModal.classList.remove('active');
      };

      if (btnCloseMcpModal) {
        btnCloseMcpModal.addEventListener('click', closeMcp);
      }

      mcpModal.addEventListener('click', (e) => {
        if (e.target === mcpModal) {
          closeMcp();
        }
      });

      document.querySelectorAll('.btn-copy-code').forEach(btn => {
        btn.addEventListener('click', () => {
          const targetId = btn.getAttribute('data-target');
          const codeEl = document.getElementById(targetId);
          if (codeEl) {
            navigator.clipboard.writeText(codeEl.textContent.trim());
            const origText = btn.textContent;
            btn.textContent = 'Скопировано!';
            setTimeout(() => { btn.textContent = origText; }, 1800);
          }
        });
      });

      loadMcpInfo();
    }
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  init();
})();
