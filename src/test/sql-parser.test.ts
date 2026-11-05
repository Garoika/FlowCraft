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

  // Verify Crow's Foot markers and routing on edges
  diagram.edges.forEach(edge => {
    assert.equal(edge.style?.routing, 'orthogonal');
    assert.equal(edge.style?.crowsFootStart, 'many');
    assert.equal(edge.style?.crowsFootEnd, 'one');
  });

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
  assert.ok(svg.includes('fc-crows-foot'), 'SVG must include crows foot marker');

  // Clean up
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});
