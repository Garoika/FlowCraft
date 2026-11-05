import { FlowDiagram, FlowNode, FlowEdge, TableColumn, LayoutDirection, DiagramTheme } from './model.js';
import { applyAutoLayout } from './layout.js';

export interface ParsedForeignKey {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  constraintName?: string;
}

export interface ParsedTable {
  name: string;
  columns: TableColumn[];
  primaryKeys: string[];
  foreignKeys: ParsedForeignKey[];
}

export interface ParsedSchema {
  tables: Map<string, ParsedTable>;
  foreignKeys: ParsedForeignKey[];
}

/**
 * Removes single-line and multi-line SQL comments.
 */
export function stripSqlComments(sql: string): string {
  return sql
    // Remove multi-line comments /* ... */
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove single-line comments -- ... or # ...
    .replace(/(?:--|#)[^\r\n]*/g, '');
}

/**
 * Cleans identifier from quotes, backticks and schema prefixes.
 * e.g. "public"."users" -> users, `ticket_purchase_hist` -> ticket_purchase_hist
 */
export function cleanIdentifier(raw: string): string {
  const parts = raw.trim().split('.');
  const last = parts[parts.length - 1];
  return last.replace(/^["'`\[]|["'`\]]$/g, '').trim();
}

/**
 * Splits comma-separated items inside a table definition, respecting parentheses.
 */
function splitDefinitionsRespectingParentheses(content: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = '';

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth = Math.max(0, depth - 1);
      current += char;
    } else if (char === ',' && depth === 0) {
      if (current.trim()) {
        items.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    items.push(current.trim());
  }

  return items;
}

/**
 * Parses SQL DDL text into a structured database schema.
 */
export function parseSqlDdl(sqlText: string): ParsedSchema {
  const cleanedSql = stripSqlComments(sqlText);
  const tables = new Map<string, ParsedTable>();
  const foreignKeys: ParsedForeignKey[] = [];

  // 1. Find all CREATE TABLE statements using parenthesis balance
  const createTableRegex = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([^\s(]+)\s*\(/gi;
  let match: RegExpExecArray | null;

  while ((match = createTableRegex.exec(cleanedSql)) !== null) {
    const rawTableName = match[1];
    const tableName = cleanIdentifier(rawTableName);
    const startIndex = match.index + match[0].length;

    let depth = 1;
    let endIndex = startIndex;

    while (endIndex < cleanedSql.length && depth > 0) {
      const char = cleanedSql[endIndex];
      if (char === '(') depth++;
      else if (char === ')') depth--;
      endIndex++;
    }

    const tableBody = cleanedSql.substring(startIndex, endIndex - 1);
    const definitions = splitDefinitionsRespectingParentheses(tableBody);

    const parsedTable: ParsedTable = {
      name: tableName,
      columns: [],
      primaryKeys: [],
      foreignKeys: []
    };

    for (const def of definitions) {
      const trimmed = def.trim();
      const upper = trimmed.toUpperCase();

      // Check Table-level PRIMARY KEY constraint
      const pkMatch = trimmed.match(/^(?:CONSTRAINT\s+[^\s]+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) {
        const pkCols = pkMatch[1].split(',').map(s => cleanIdentifier(s));
        parsedTable.primaryKeys.push(...pkCols);
        continue;
      }

      // Check Table-level FOREIGN KEY constraint
      const fkMatch = trimmed.match(/(?:CONSTRAINT\s+([^\s]+)\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+([^\s(]+)\s*\(([^)]+)\)/i);
      if (fkMatch) {
        const constraintName = fkMatch[1] ? cleanIdentifier(fkMatch[1]) : undefined;
        const sourceCols = fkMatch[2].split(',').map(s => cleanIdentifier(s));
        const targetTable = cleanIdentifier(fkMatch[3]);
        const targetCols = fkMatch[4].split(',').map(s => cleanIdentifier(s));

        sourceCols.forEach((sourceCol, idx) => {
          const targetCol = targetCols[idx] || targetCols[0];
          const fkObj: ParsedForeignKey = {
            sourceTable: tableName,
            sourceColumn: sourceCol,
            targetTable,
            targetColumn: targetCol,
            constraintName
          };
          parsedTable.foreignKeys.push(fkObj);
          foreignKeys.push(fkObj);
        });
        continue;
      }

      // Skip other table constraints like UNIQUE, CHECK, KEY index
      if (/^(?:CONSTRAINT\s+[^\s]+\s+)?(?:UNIQUE|CHECK|KEY|INDEX)\s*\(/i.test(trimmed)) {
        continue;
      }

      // Column Definition: col_name data_type [modifiers...]
      // Example: "id INT PRIMARY KEY", "ticket_price DECIMAL(10,2) NOT NULL", "city_id INT REFERENCES city(id)"
      const colMatch = trimmed.match(/^([^\s]+)\s+([a-zA-Z0-9_]+(?:\s*\([^)]*\))?)([\s\S]*)$/);
      if (colMatch) {
        const colName = cleanIdentifier(colMatch[1]);
        const colType = colMatch[2].trim().toUpperCase();
        const modifiers = colMatch[3] || '';
        const modUpper = modifiers.toUpperCase();

        const isPk = /\bPRIMARY\s+KEY\b/i.test(modUpper);
        if (isPk) {
          parsedTable.primaryKeys.push(colName);
        }

        const isNullable = !/\bNOT\s+NULL\b/i.test(modUpper) && !isPk;

        // Check for inline REFERENCES target_table(target_col)
        const inlineFkMatch = modifiers.match(/\bREFERENCES\s+([^\s(]+)\s*\(([^)]+)\)/i);
        let refTable: string | undefined;
        let refColumn: string | undefined;

        if (inlineFkMatch) {
          refTable = cleanIdentifier(inlineFkMatch[1]);
          refColumn = cleanIdentifier(inlineFkMatch[2]);
          const fkObj: ParsedForeignKey = {
            sourceTable: tableName,
            sourceColumn: colName,
            targetTable: refTable,
            targetColumn: refColumn
          };
          parsedTable.foreignKeys.push(fkObj);
          foreignKeys.push(fkObj);
        }

        const column: TableColumn = {
          id: `col_${tableName}_${colName}`,
          name: colName,
          type: colType,
          isPk,
          isFk: Boolean(inlineFkMatch),
          isNullable,
          refTable,
          refColumn
        };

        parsedTable.columns.push(column);
      }
    }

    tables.set(tableName.toLowerCase(), parsedTable);
  }

  // 2. Parse ALTER TABLE ... ADD [CONSTRAINT ...] FOREIGN KEY
  const alterFkRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?([^\s;]+)\s+ADD\s+(?:CONSTRAINT\s+([^\s]+)\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+([^\s(]+)\s*\(([^)]+)\)/gi;
  let alterMatch: RegExpExecArray | null;

  while ((alterMatch = alterFkRegex.exec(cleanedSql)) !== null) {
    const sourceTable = cleanIdentifier(alterMatch[1]);
    const constraintName = alterMatch[2] ? cleanIdentifier(alterMatch[2]) : undefined;
    const sourceCols = alterMatch[3].split(',').map(s => cleanIdentifier(s));
    const targetTable = cleanIdentifier(alterMatch[4]);
    const targetCols = alterMatch[5].split(',').map(s => cleanIdentifier(s));

    sourceCols.forEach((sourceCol, idx) => {
      const targetCol = targetCols[idx] || targetCols[0];
      const fkObj: ParsedForeignKey = {
        sourceTable,
        sourceColumn: sourceCol,
        targetTable,
        targetColumn: targetCol,
        constraintName
      };
      foreignKeys.push(fkObj);

      const tbl = tables.get(sourceTable.toLowerCase());
      if (tbl) {
        tbl.foreignKeys.push(fkObj);
      }
    });
  }

  // 3. Mark isPk and isFk on table columns
  for (const table of tables.values()) {
    const pkSet = new Set(table.primaryKeys.map(k => k.toLowerCase()));
    const fkMap = new Map<string, ParsedForeignKey>();
    table.foreignKeys.forEach(fk => fkMap.set(fk.sourceColumn.toLowerCase(), fk));

    for (const col of table.columns) {
      if (pkSet.has(col.name.toLowerCase())) {
        col.isPk = true;
      }
      const fkInfo = fkMap.get(col.name.toLowerCase());
      if (fkInfo) {
        col.isFk = true;
        col.refTable = fkInfo.targetTable;
        col.refColumn = fkInfo.targetColumn;
      }
    }
  }

  return { tables, foreignKeys };
}

export const LIGHT_TABLE_PALETTE = [
  '#dbeafe', // Soft Sky Blue
  '#ccfbf1', // Soft Mint / Teal
  '#e0e7ff', // Soft Indigo
  '#fef3c7', // Soft Amber / Warm Cream
  '#d1fae5', // Soft Emerald
  '#ffedd5', // Soft Peach
  '#fce7f3', // Soft Rose Pink
  '#f3e8ff', // Soft Purple
  '#cffafe', // Soft Cyan
  '#ede9fe', // Soft Lavender
  '#fee2e2', // Soft Coral
  '#e2e8f0'  // Soft Slate
];

/**
 * Converts SQL DDL schema into a ready-to-render FlowDiagram in 'database' mode.
 */
export function sqlToDiagram(
  sqlText: string,
  title: string = 'Схема базы данных',
  direction: LayoutDirection = 'LR',
  id?: string,
  theme: DiagramTheme = 'light'
): FlowDiagram {
  const schema = parseSqlDdl(sqlText);

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  const tableList = Array.from(schema.tables.values());

  tableList.forEach((table, idx) => {
    let maxNameLen = table.name.length;
    let maxTypeLen = 0;

    table.columns.forEach(col => {
      const nameTag = col.name + (col.isPk && col.isFk ? ' (PK, FK)' : col.isPk ? ' (PK)' : col.isFk ? ' (FK)' : '');
      maxNameLen = Math.max(maxNameLen, nameTag.length);
      const t = (col.type || '').trim();
      if (t) maxTypeLen = Math.max(maxTypeLen, t.length);
    });

    const calculatedWidth = maxTypeLen > 0
      ? Math.min(360, Math.max(220, Math.round(maxNameLen * 8 + maxTypeLen * 7 + 42)))
      : Math.min(320, Math.max(160, Math.round(maxNameLen * 8.5 + 36)));
    const calculatedHeight = Math.max(70, 42 + table.columns.length * 24 + 10);
    const color = LIGHT_TABLE_PALETTE[idx % LIGHT_TABLE_PALETTE.length];

    nodes.push({
      id: `table_${table.name.toLowerCase()}`,
      label: table.name,
      shape: 'table',
      x: 0,
      y: 0,
      width: calculatedWidth,
      height: calculatedHeight,
      columns: table.columns,
      style: {
        fill: color
      }
    });
  });

  const nodeMap = new Map(nodes.map(n => [n.label.toLowerCase(), n]));

  // Generate Edges for each Foreign Key with Crow's Foot markers
  schema.foreignKeys.forEach((fk, idx) => {
    const srcNode = nodeMap.get(fk.sourceTable.toLowerCase());
    const tgtNode = nodeMap.get(fk.targetTable.toLowerCase());

    if (srcNode && tgtNode) {
      // Clean readable label for relationship role (e.g. "home_team_id" -> "Home Team")
      let roleLabel = '';
      const cleanCol = fk.sourceColumn.replace(/_id$/i, '').replace(/_/g, ' ');
      if (cleanCol && cleanCol.toLowerCase() !== fk.targetTable.toLowerCase()) {
        roleLabel = cleanCol.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }

      edges.push({
        id: `fk_${srcNode.id}_${tgtNode.id}_${idx}`,
        source: srcNode.id,
        target: tgtNode.id,
        sourcePort: 'left',
        targetPort: 'right',
        label: roleLabel || undefined,
        style: {
          routing: 'orthogonal',
          crowsFootStart: 'many',
          crowsFootEnd: 'one',
          sourceField: fk.sourceColumn,
          targetField: fk.targetColumn
        }
      });
    }
  });

  const rawDiagram: FlowDiagram = {
    id: id || `db_${Date.now().toString(36)}`,
    title,
    mode: 'database',
    theme,
    direction,
    nodes,
    edges,
    groups: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1
  };

  // Apply automatic layout so tables are positioned with optimal flow
  const laidOut = applyAutoLayout(rawDiagram, {
    direction,
    nodeSpacingX: 100,
    nodeSpacingY: 90,
    edgeRouting: 'orthogonal'
  });

  return laidOut;
}
