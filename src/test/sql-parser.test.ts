import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSqlDdl, sqlToDiagram } from '../engine/sql-parser.js';

test('FlowCraft Engine - SQL DDL Parser for Relational Database Schemas', () => {
  const sql = `
    -- Таблица городов
    CREATE TABLE city (
      id INT PRIMARY KEY,
      longitude DECIMAL(9, 6),
      latitude DECIMAL(9, 6),
      name VARCHAR(100) NOT NULL
    );

    CREATE TABLE sport_location (
      id INT PRIMARY KEY,
      city_id INT REFERENCES city(id),
      name VARCHAR(150),
      seating_capacity INT,
      levels INT,
      sections INT
    );

    CREATE TABLE sporting_team (
      id INT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      sport_type_name VARCHAR(50),
      sport_league_short_name VARCHAR(20),
      sport_division_short_name VARCHAR(20)
    );

    CREATE TABLE sporting_event (
      id INT PRIMARY KEY,
      sport_location_id INT,
      home_team_id INT,
      away_team_id INT,
      sport_type_name VARCHAR(50),
      start_date_time TIMESTAMP,
      start_date DATE,
      sold_out BOOLEAN,
      CONSTRAINT fk_event_location FOREIGN KEY (sport_location_id) REFERENCES sport_location(id),
      CONSTRAINT fk_event_home FOREIGN KEY (home_team_id) REFERENCES sporting_team(id),
      CONSTRAINT fk_event_away FOREIGN KEY (away_team_id) REFERENCES sporting_team(id)
    );

    CREATE TABLE person (
      id INT PRIMARY KEY,
      full_name VARCHAR(120),
      last_name VARCHAR(60),
      first_name VARCHAR(60)
    );

    CREATE TABLE ticket (
      id INT PRIMARY KEY,
      sporting_event_id INT NOT NULL,
      seat_level VARCHAR(20),
      seat_section VARCHAR(20),
      ticket_price DECIMAL(8, 2),
      seat VARCHAR(10),
      seat_row VARCHAR(10),
      FOREIGN KEY (sporting_event_id) REFERENCES sporting_event(id)
    );

    CREATE TABLE ticket_purchase_hist (
      ticket_id INT,
      purchased_by_id INT,
      transaction_date_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      purchase_price DECIMAL(8, 2),
      PRIMARY KEY (ticket_id, purchased_by_id),
      FOREIGN KEY (ticket_id) REFERENCES ticket(id),
      FOREIGN KEY (purchased_by_id) REFERENCES person(id)
    );
  `;

  const schema = parseSqlDdl(sql);

  // Check Tables parsed
  assert.equal(schema.tables.size, 7, 'Must parse exactly 7 tables');
  assert.ok(schema.tables.has('city'));
  assert.ok(schema.tables.has('sport_location'));
  assert.ok(schema.tables.has('sporting_team'));
  assert.ok(schema.tables.has('sporting_event'));
  assert.ok(schema.tables.has('person'));
  assert.ok(schema.tables.has('ticket'));
  assert.ok(schema.tables.has('ticket_purchase_hist'));

  // Check Foreign Keys parsed
  assert.equal(schema.foreignKeys.length, 7, 'Must parse all 7 foreign keys');

  // Check Composite Primary Key on ticket_purchase_hist
  const hist = schema.tables.get('ticket_purchase_hist')!;
  assert.equal(hist.primaryKeys.length, 2);
  assert.ok(hist.primaryKeys.includes('ticket_id'));
  assert.ok(hist.primaryKeys.includes('purchased_by_id'));

  const ticketIdCol = hist.columns.find(c => c.name === 'ticket_id')!;
  assert.equal(ticketIdCol.isPk, true);
  assert.equal(ticketIdCol.isFk, true);
  assert.equal(ticketIdCol.refTable, 'ticket');

  // Convert to full FlowDiagram
  const diagram = sqlToDiagram(sql, 'Sports Ticketing Database', 'LR');
  assert.equal(diagram.mode, 'database');
  assert.equal(diagram.nodes.length, 7);
  assert.equal(diagram.edges.length, 7);

  // Verify Crow's Foot markers, dashed vs solid (identifying vs non-identifying), and routing
  diagram.edges.forEach(edge => {
    assert.equal(edge.style?.routing, 'orthogonal');
    assert.ok(['many', 'zero-many'].includes(edge.style?.crowsFootStart || ''));
    assert.ok(['one', 'zero-one'].includes(edge.style?.crowsFootEnd || ''));
  });

  // ticket_purchase_hist FKs are part of PK -> identifying (solid line, many -> one)
  const histEdges = diagram.edges.filter(e => e.style?.sourceField === 'ticket_id' || e.style?.sourceField === 'purchased_by_id');
  assert.equal(histEdges.length, 2);
  histEdges.forEach(e => {
    assert.equal(e.style?.dashed, false, 'Identifying PK+FK relationship must be solid');
    assert.equal(e.style?.crowsFootStart, 'many');
  });

  // sport_location.city_id is nullable FK not in PK -> non-identifying dashed line, zero-many -> zero-one
  const cityEdge = diagram.edges.find(e => e.style?.sourceField === 'city_id')!;
  assert.ok(cityEdge);
  assert.equal(cityEdge.style?.dashed, true, 'Non-identifying FK relationship must be dashed');
  assert.equal(cityEdge.style?.crowsFootStart, 'zero-many');
  assert.equal(cityEdge.style?.crowsFootEnd, 'zero-one');

  // ticket.sporting_event_id is NOT NULL FK not in PK -> dashed, zero-many -> one
  const ticketEventEdge = diagram.edges.find(e => e.style?.sourceField === 'sporting_event_id')!;
  assert.ok(ticketEventEdge);
  assert.equal(ticketEventEdge.style?.dashed, true);
  assert.equal(ticketEventEdge.style?.crowsFootEnd, 'one');

  // Check role labels (e.g. Home Team, Away Team)
  const homeEdge = diagram.edges.find(e => e.label === 'Home Team');
  assert.ok(homeEdge, 'Must generate Home Team role label from home_team_id');
  const awayEdge = diagram.edges.find(e => e.label === 'Away Team');
  assert.ok(awayEdge, 'Must generate Away Team role label from away_team_id');
});

test('FlowCraft MCP import_sql tool execution and SVG rendering', async () => {
  const { DiagramStore } = await import('../server/store.js');
  const { executeTool } = await import('../mcp/tools.js');
  const { renderDiagramToSVG } = await import('../engine/renderer.js');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');

  const tmpDir = path.join(os.tmpdir(), `fc_test_db_${Date.now()}`);
  const store = new DiagramStore(tmpDir);

  const sql = `
    CREATE TABLE departments (
      dept_id INT PRIMARY KEY,
      dept_name VARCHAR(50) NOT NULL
    );

    CREATE TABLE employees (
      emp_id INT PRIMARY KEY,
      dept_id INT NOT NULL,
      full_name VARCHAR(100),
      CONSTRAINT fk_emp_dept FOREIGN KEY (dept_id) REFERENCES departments(dept_id)
    );
  `;

  const result = await executeTool('import_sql', { sql, title: 'HR Schema' }, store);
  assert.ok(!result.isError, 'Tool execution should succeed');
  assert.ok(result.content[0].text.includes('Успешно импортирована схема базы данных'));

  const diagram = store.getDiagram();
  assert.strictEqual(diagram.title, 'HR Schema');
  assert.strictEqual(diagram.mode, 'database');
  assert.strictEqual(diagram.nodes.length, 2);
  assert.strictEqual(diagram.edges.length, 1);

  const svg = renderDiagramToSVG(diagram);
  assert.ok(svg.includes('departments'), 'SVG must include table name');
  assert.ok(svg.includes('employees'), 'SVG must include table name');
  assert.ok(svg.includes('(PK)'), 'SVG must include PK badge');
  assert.ok(svg.includes('(FK)'), 'SVG must include FK badge');
  assert.ok(svg.includes('fc-crows-foot-zero-many-start'), 'SVG must include zero-many start marker');
  assert.ok(svg.includes('fc-crows-foot-one'), 'SVG must include one end marker');
  assert.ok(svg.includes('stroke-dasharray="5,5"'), 'Non-identifying FK edge must render as dashed line');
  assert.ok(svg.includes('M 19 2 L 9 8 L 19 14'), 'End Crow\'s Foot prongs must open toward target table');
  assert.ok(svg.includes('M 1 2 L 11 8 L 1 14'), 'Start Crow\'s Foot prongs must open toward source table');
  assert.ok(!svg.includes('class="edge-label"'), 'Database mode edges must not render boxed edge labels');

  // Clean up
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

test('FlowCraft Engine - Database PK Center-Distributed vs FK Row-Pinned Endpoints', async () => {
  const { computeAllEdgeEndpoints } = await import('../engine/layout.js');

  const teamNode = {
    id: 'team',
    label: 'sporting_team',
    shape: 'table' as const,
    x: 100,
    y: 100,
    width: 180,
    height: 120,
    columns: [
      { id: 'c1', name: 'id', type: 'INT', isPk: true },
      { id: 'c2', name: 'name', type: 'TEXT' }
    ]
  };

  const eventNode = {
    id: 'event',
    label: 'sporting_event',
    shape: 'table' as const,
    x: 400,
    y: 80,
    width: 200,
    height: 140,
    columns: [
      { id: 'e1', name: 'id', type: 'INT', isPk: true },
      { id: 'e2', name: 'home_team_id', type: 'INT', isFk: true },
      { id: 'e3', name: 'away_team_id', type: 'INT', isFk: true }
    ]
  };

  const cityNode = {
    id: 'city',
    label: 'city',
    shape: 'table' as const,
    x: 100,
    y: 300,
    width: 160,
    height: 100,
    columns: [
      { id: 'ci1', name: 'id', type: 'INT', isPk: true },
      { id: 'ci2', name: 'name', type: 'TEXT' }
    ]
  };

  const locNode = {
    id: 'loc',
    label: 'sport_location',
    shape: 'table' as const,
    x: 380,
    y: 300,
    width: 180,
    height: 100,
    columns: [
      { id: 'l1', name: 'id', type: 'INT', isPk: true },
      { id: 'l2', name: 'city_id', type: 'INT', isFk: true }
    ]
  };

  const edges = [
    {
      id: 'e_home',
      source: 'event',
      target: 'team',
      style: { routing: 'orthogonal' as const, crowsFootStart: 'zero-many' as const, crowsFootEnd: 'one' as const, sourceField: 'home_team_id', targetField: 'id' }
    },
    {
      id: 'e_away',
      source: 'event',
      target: 'team',
      style: { routing: 'orthogonal' as const, crowsFootStart: 'zero-many' as const, crowsFootEnd: 'one' as const, sourceField: 'away_team_id', targetField: 'id' }
    },
    {
      id: 'e_city',
      source: 'loc',
      target: 'city',
      style: { routing: 'orthogonal' as const, crowsFootStart: 'zero-many' as const, crowsFootEnd: 'zero-one' as const, sourceField: 'city_id', targetField: 'id' }
    }
  ];

  const epMap = computeAllEdgeEndpoints([teamNode, eventNode, cityNode, locNode], edges, true);

  // 1. Single edge on PK table 'city' must hit exact vertical center (300 + 100/2 = 350)
  const epCity = epMap.get('e_city')!;
  assert.equal(epCity.end.y, 350);
  // And FK side 'loc.city_id' (row 1) must pin to row 1: 300 + 32 + 1*24 + 12 = 368
  assert.equal(epCity.start.y, 368);

  // 2. Two edges on PK table 'team' (center = 160) must split symmetrically (160 - 12 = 148, 160 + 12 = 172)
  const epHome = epMap.get('e_home')!;
  const epAway = epMap.get('e_away')!;
  assert.equal(epHome.start.y, 80 + 32 + 1 * 24 + 12); // home_team_id row 1 = 148
  assert.equal(epAway.start.y, 80 + 32 + 2 * 24 + 12); // away_team_id row 2 = 172
  assert.ok(epHome.end.y < epAway.end.y, 'Upper FK target must get upper PK slot');
  assert.equal(epHome.end.y, 148);
  assert.equal(epAway.end.y, 172);
});
