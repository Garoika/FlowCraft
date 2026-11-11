import { DiagramStore } from '../server/store.js';
import { renderDiagramToSVG } from '../engine/renderer.js';
import { LayoutDirection, DiagramTheme, NodeShape, PortPosition, EdgeRouting } from '../engine/model.js';
import { sqlToDiagram } from '../engine/sql-parser.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const NODE_SHAPE_ENUM = ['terminal', 'process', 'decision', 'io', 'database', 'subroutine', 'cloud', 'note', 'hexagon', 'circle', 'entity', 'relationship', 'attribute', 'ellipse', 'table'] as const;
const CROWS_FOOT_ENUM = ['one', 'zero-one', 'many', 'zero-many'] as const;

const TABLE_COLUMNS_SCHEMA = {
  type: 'array',
  description: 'Список колонок для таблицы базы данных: { name, type?, isPk?, isFk?, isNullable? }',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      type: { type: 'string', description: 'Тип данных (опционально — можно оставить пустым для логической модели)' },
      isPk: { type: 'boolean' },
      isFk: { type: 'boolean' },
      isNullable: { type: 'boolean' }
    },
    required: ['name']
  }
};

function extractNodeStyle(source: any): Record<string, any> | undefined {
  const style: Record<string, any> = {};
  if (source.fillColor) style.fill = source.fillColor;
  if (source.strokeColor) style.stroke = source.strokeColor;
  if (source.dashed !== undefined) style.dashed = source.dashed;
  if (source.badge !== undefined) style.badge = source.badge;
  if (source.isWeak !== undefined) style.isWeak = source.isWeak;
  if (source.isKey !== undefined) style.isKey = source.isKey;
  if (source.isMultivalued !== undefined) style.isMultivalued = source.isMultivalued;
  if (source.isDerived !== undefined) style.isDerived = source.isDerived;
  return Object.keys(style).length > 0 ? style : undefined;
}

function extractEdgeStyle(source: any): Record<string, any> | undefined {
  const style: Record<string, any> = {};
  if (source.strokeColor) style.stroke = source.strokeColor;
  if (source.routing) style.routing = source.routing as EdgeRouting;
  if (source.animated !== undefined) style.animated = source.animated;
  if (source.dashed !== undefined) style.dashed = source.dashed;
  if (source.isDouble !== undefined) style.isDouble = source.isDouble;
  if (source.cardinality !== undefined) style.cardinality = source.cardinality;
  if (source.cardinalityStart !== undefined) style.cardinalityStart = source.cardinalityStart;
  if (source.cardinalityEnd !== undefined) {
    style.cardinalityEnd = source.cardinalityEnd;
    if (style.cardinality === undefined) style.cardinality = source.cardinalityEnd;
  }
  if (source.arrowEnd !== undefined) style.arrowEnd = source.arrowEnd;
  if (source.arrowStart !== undefined) style.arrowStart = source.arrowStart;
  if (source.crowsFootStart) style.crowsFootStart = source.crowsFootStart;
  if (source.crowsFootEnd) style.crowsFootEnd = source.crowsFootEnd;
  if (source.sourceField !== undefined) style.sourceField = source.sourceField;
  if (source.targetField !== undefined) style.targetField = source.targetField;
  return Object.keys(style).length > 0 ? style : undefined;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'list_diagrams',
    description: 'Получить список всех сохраненных блок-схем в Хабе FlowCraft с их метаданными (ID, название, число блоков, дата изменения).',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'create_diagram',
    description: 'Создать новую блок-схему или ER-диаграмму Чена с заголовком, направлением и темой оформления.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Название блок-схемы / диаграммы' },
        description: { type: 'string', description: 'Краткое описание или подзаголовок' },
        mode: {
          type: 'string',
          enum: ['flowchart', 'chen', 'database'],
          description: 'Режим диаграммы: flowchart (Блок-схема), chen (Нотация Чена / ER-диаграмма) или database (Модель данных / Реляционные таблицы ERD). По умолчанию: flowchart'
        },
        direction: {
          type: 'string',
          enum: ['TB', 'LR', 'BT', 'RL'],
          description: 'Направление раскладки: TB (Сверху вниз), LR (Слева направо), BT (Снизу вверх), RL (Справа налево). По умолчанию: TB'
        },
        theme: {
          type: 'string',
          enum: ['dark', 'light', 'cyberpunk', 'blueprint', 'emerald', 'nord'],
          description: 'Цветовая тема: dark (Тёмная), light (Светлая), cyberpunk (Киберпанк), blueprint (Чертёж), emerald (Изумруд), nord (Северная). По умолчанию: dark'
        }
      },
      required: ['title']
    }
  },
  {
    name: 'add_node',
    description: 'Добавить один блок / узел в диаграмму (поддерживает блок-схемы и нотацию Чена).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Уникальный идентификатор узла (например: "start", "check_auth", "entity_user")' },
        label: { type: 'string', description: 'Текст внутри блока' },
        shape: {
          type: 'string',
          enum: [...NODE_SHAPE_ENUM],
          description: 'Форма блока: terminal, process, decision, io, database, subroutine, cloud, note, hexagon, circle, entity (Сущность), relationship (Связь), attribute (Атрибут/Эллипс), table (Таблица БД).'
        },
        columns: TABLE_COLUMNS_SCHEMA,
        badge: { type: 'string', description: 'Небольшой значок/номер шага в углу' },
        x: { type: 'number', description: 'Координата X (опционально)' },
        y: { type: 'number', description: 'Координата Y (опционально)' },
        width: { type: 'number', description: 'Ширина в пикселях (опционально)' },
        height: { type: 'number', description: 'Высота в пикселях (опционально)' },
        groupId: { type: 'string', description: 'ID группы / контейнера' },
        branchLabels: {
          type: 'object',
          properties: {
            left: { type: 'string' },
            right: { type: 'string' },
            top: { type: 'string' },
            bottom: { type: 'string' },
            mode: { type: 'string' },
            hidden: { type: 'boolean' }
          },
          description: 'Метки веток (Да/Нет) для ромба условий'
        },
        fillColor: { type: 'string', description: 'Пользовательский цвет заливки (HEX)' },
        strokeColor: { type: 'string', description: 'Пользовательский цвет границы (HEX)' },
        dashed: { type: 'boolean', description: 'Пунктирная граница' },
        isWeak: { type: 'boolean', description: 'Нотация Чена: слабая сущность или слабая связь (двойная рамка)' },
        isKey: { type: 'boolean', description: 'Нотация Чена: первичный ключевой атрибут (подчеркнутый текст)' },
        isMultivalued: { type: 'boolean', description: 'Нотация Чена: многозначный атрибут (двойной эллипс)' },
        isDerived: { type: 'boolean', description: 'Нотация Чена: производный атрибут (пунктирный эллипс)' }
      },
      required: ['id', 'label']
    }
  },
  {
    name: 'add_nodes',
    description: 'Пакетное добавление нескольких блоков за один вызов.',
    inputSchema: {
      type: 'object',
      properties: {
        nodes: {
          type: 'array',
          description: 'Список добавляемых узлов',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Уникальный ID узла' },
              label: { type: 'string', description: 'Текст блока' },
              shape: {
                type: 'string',
                enum: [...NODE_SHAPE_ENUM]
              },
              columns: TABLE_COLUMNS_SCHEMA,
              badge: { type: 'string' },
              groupId: { type: 'string' },
              fillColor: { type: 'string' },
              strokeColor: { type: 'string' },
              isWeak: { type: 'boolean' },
              isKey: { type: 'boolean' },
              isMultivalued: { type: 'boolean' },
              isDerived: { type: 'boolean' }
            },
            required: ['id', 'label']
          }
        },
        autoLayout: { type: 'boolean', description: 'Автоматически пересчитать раскладку. По умолчанию: true' }
      },
      required: ['nodes']
    }
  },
  {
    name: 'add_edge',
    description: 'Добавить связь/стрелку между двумя блоками (поддерживает блок-схемы и нотацию Чена).',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'ID исходного узла' },
        target: { type: 'string', description: 'ID целевого узла' },
        label: { type: 'string', description: 'Надпись на связи' },
        sourcePort: {
          type: 'string',
          enum: ['top', 'right', 'bottom', 'left', 'auto'],
          description: 'Точка выхода на исходном узле. По умолчанию: auto'
        },
        targetPort: {
          type: 'string',
          enum: ['top', 'right', 'bottom', 'left', 'auto'],
          description: 'Точка входа на целевом узле. По умолчанию: auto'
        },
        routing: {
          type: 'string',
          enum: ['orthogonal', 'bezier', 'straight'],
          description: 'Стиль трассировки: orthogonal, bezier, straight. По умолчанию: orthogonal'
        },
        animated: { type: 'boolean', description: 'Анимированный поток' },
        dashed: { type: 'boolean', description: 'Пунктирная линия' },
        strokeColor: { type: 'string', description: 'Цвет линии (HEX)' },
        isDouble: { type: 'boolean', description: 'Нотация Чена: двойная линия (полное / обязательное участие сущности в связи)' },
        cardinality: { type: 'string', description: 'Нотация Чена: кратность связи (например: "1", "N", "M", "0..1", "1..1", "0..N", "1..N")' },
        cardinalityStart: { type: 'string', description: 'Нотация Чена: кратность связи у исходного узла (например: "1", "N", "M")' },
        cardinalityEnd: { type: 'string', description: 'Нотация Чена: кратность связи у целевого узла (алиас для cardinality)' },
        arrowEnd: { type: 'boolean', description: 'Стрелка на конце к цели (в нотации Чена обозначает ограничение "не более одного")' },
        arrowStart: { type: 'boolean', description: 'Стрелка на начале у источника' },
        crowsFootStart: { type: 'string', enum: [...CROWS_FOOT_ENUM], description: 'Маркер «Воронья лапка» на начале связи: one (||, 1), zero-one (O|, 0..1), many (|<, 1..N), zero-many (O<, 0..N)' },
        crowsFootEnd: { type: 'string', enum: [...CROWS_FOOT_ENUM], description: 'Маркер «Воронья лапка» на конце связи: one (||, 1), zero-one (O|, 0..1), many (|<, 1..N), zero-many (O<, 0..N)' },
        sourceField: { type: 'string', description: 'Поле исходной таблицы' },
        targetField: { type: 'string', description: 'Поле целевой таблицы' }
      },
      required: ['source', 'target']
    }
  },
  {
    name: 'add_edges',
    description: 'Пакетное добавление нескольких связей / стрелок за один вызов.',
    inputSchema: {
      type: 'object',
      properties: {
        edges: {
          type: 'array',
          description: 'Список связей',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', description: 'ID исходного узла' },
              target: { type: 'string', description: 'ID целевого узла' },
              label: { type: 'string', description: 'Надпись на стрелке' },
              routing: { type: 'string', enum: ['orthogonal', 'bezier', 'straight'] },
              animated: { type: 'boolean' },
              dashed: { type: 'boolean' },
              isDouble: { type: 'boolean', description: 'Нотация Чена: двойная линия' },
              cardinality: { type: 'string', description: 'Нотация Чена: кратность связи' },
              cardinalityStart: { type: 'string', description: 'Нотация Чена: кратность у исходного узла' },
              cardinalityEnd: { type: 'string', description: 'Нотация Чена: кратность у целевого узла' },
              arrowEnd: { type: 'boolean' },
              arrowStart: { type: 'boolean' },
              crowsFootStart: { type: 'string', enum: [...CROWS_FOOT_ENUM] },
              crowsFootEnd: { type: 'string', enum: [...CROWS_FOOT_ENUM] },
              sourceField: { type: 'string' },
              targetField: { type: 'string' }
            },
            required: ['source', 'target']
          }
        },
        autoLayout: { type: 'boolean', description: 'Автоматически пересчитать раскладку. По умолчанию: true' }
      },
      required: ['edges']
    }
  },
  {
    name: 'update_node',
    description: 'Обновить параметры (текст, форму, стиль, координаты) существующего блока.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID обновляемого узла' },
        label: { type: 'string', description: 'Новый текст' },
        shape: {
          type: 'string',
          enum: [...NODE_SHAPE_ENUM]
        },
        columns: TABLE_COLUMNS_SCHEMA,
        badge: { type: 'string' },
        fillColor: { type: 'string' },
        strokeColor: { type: 'string' },
        width: { type: 'number', description: 'Ширина в пикселях' },
        height: { type: 'number', description: 'Высота в пикселях' },
        branchLabels: {
          type: 'object',
          properties: {
            left: { type: 'string' },
            right: { type: 'string' },
            top: { type: 'string' },
            bottom: { type: 'string' },
            mode: { type: 'string' },
            hidden: { type: 'boolean' }
          },
          description: 'Метки веток условия (Да/Нет) и их расположение'
        },
        isWeak: { type: 'boolean' },
        isKey: { type: 'boolean' },
        isMultivalued: { type: 'boolean' },
        isDerived: { type: 'boolean' },
        x: { type: 'number' },
        y: { type: 'number' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_node',
    description: 'Удалить узел и все привязанные к нему стрелки с холста.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID удаляемого узла' }
      },
      required: ['id']
    }
  },
  {
    name: 'update_edge',
    description: 'Обновить существующую связь (надпись, стиль, анимацию, кратность, маркеры «Воронья лапка», привязку к полям таблиц).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID связи' },
        label: { type: 'string', description: 'Новая надпись' },
        routing: { type: 'string', enum: ['orthogonal', 'bezier', 'straight'] },
        animated: { type: 'boolean' },
        dashed: { type: 'boolean' },
        strokeColor: { type: 'string', description: 'Цвет линии (HEX)' },
        isDouble: { type: 'boolean' },
        cardinality: { type: 'string' },
        cardinalityStart: { type: 'string' },
        cardinalityEnd: { type: 'string' },
        arrowEnd: { type: 'boolean' },
        arrowStart: { type: 'boolean' },
        crowsFootStart: { type: 'string', enum: [...CROWS_FOOT_ENUM], description: 'Маркер «Воронья лапка» на начале связи: one (||, 1), zero-one (O|, 0..1), many (|<, 1..N), zero-many (O<, 0..N)' },
        crowsFootEnd: { type: 'string', enum: [...CROWS_FOOT_ENUM], description: 'Маркер «Воронья лапка» на конце связи: one (||, 1), zero-one (O|, 0..1), many (|<, 1..N), zero-many (O<, 0..N)' },
        sourceField: { type: 'string', description: 'Поле исходной таблицы ("" для сброса привязки)' },
        targetField: { type: 'string', description: 'Поле целевой таблицы ("" для сброса привязки)' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_edge',
    description: 'Удалить связь по её ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID удаляемой связи' }
      },
      required: ['id']
    }
  },
  {
    name: 'group_nodes',
    description: 'Сгруппировать несколько узлов в визуальный контейнер / подсистему.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'Уникальный ID группы' },
        label: { type: 'string', description: 'Заголовок группы' },
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Список ID узлов, входящих в группу'
        }
      },
      required: ['groupId', 'label', 'nodeIds']
    }
  },
  {
    name: 'apply_layout',
    description: 'Рассчитать и применить аккуратное автоматическое выравнивание и трассировку линий.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['TB', 'LR', 'BT', 'RL'],
          description: 'Направление (TB, LR, BT, RL)'
        },
        spacingX: { type: 'number', description: 'Горизонтальный отступ между блоками (по умолчанию: 60)' },
        spacingY: { type: 'number', description: 'Вертикальный отступ между блоками (по умолчанию: 70)' }
      }
    }
  },
  {
    name: 'get_diagram',
    description: 'Получить текущее состояние диаграммы в виде JSON и понятного текстового описания (ASCII).',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'render_svg',
    description: 'Сгенерировать готовый автономный SVG-код блок-схемы.',
    inputSchema: {
      type: 'object',
      properties: {
        theme: {
          type: 'string',
          enum: ['dark', 'light', 'cyberpunk', 'blueprint', 'emerald', 'nord'],
          description: 'Тема оформления (опционально)'
        }
      }
    }
  },
  {
    name: 'wait_for_user_feedback',
    description: 'Запросить подтверждение, проверку или обратную связь у пользователя. Приостанавливает выполнение и открывает модальное окно в веб-интерфейсе FlowCraft.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Вопрос или предложение для пользователя' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Варианты ответа (опционально)'
        }
      },
      required: ['message']
    }
  },
  {
    name: 'import_sql',
    description: 'Импортировать SQL DDL скрипт (CREATE TABLE, PRIMARY KEY, FOREIGN KEY, ALTER TABLE ADD CONSTRAINT) и создать диаграмму «Модель данных» со всеми связями.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL DDL текст (содержимое .sql файла или команды CREATE TABLE)' },
        title: { type: 'string', description: 'Название диаграммы (по умолчанию: "Схема базы данных")' },
        direction: {
          type: 'string',
          enum: ['TB', 'LR', 'BT', 'RL'],
          description: 'Направление раскладки (по умолчанию: LR)'
        },
        diagramId: { type: 'string', description: 'ID существующей диаграммы для перезаписи (опционально)' }
      },
      required: ['sql']
    }
  }
];

export async function executeTool(name: string, args: any, store: DiagramStore): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    switch (name) {
      case 'list_diagrams': {
        const list = store.listDiagrams();
        let summary = `Сохраненные блок-схемы в Хабе (${list.length}):\n`;
        list.forEach((d, i) => {
          summary += `${i + 1}. [${d.id}] "${d.title}" (${d.nodeCount} блоков, ${d.edgeCount} связей, обновлено: ${new Date(d.updatedAt).toLocaleString('ru-RU')})\n`;
        });
        return {
          content: [{
            type: 'text',
            text: summary + '\nJSON:\n' + JSON.stringify(list, null, 2)
          }]
        };
      }

      case 'create_diagram': {
        const diagram = store.createDiagram(
          args.title,
          args.description,
          args.direction as LayoutDirection,
          args.theme as DiagramTheme,
          undefined,
          args.mode || 'flowchart'
        );
        const modeLabel = diagram.mode === 'database' ? 'Модель данных (ERD)' : diagram.mode === 'chen' ? 'Нотация Чена (ER)' : 'Блок-схема';
        return {
          content: [{
            type: 'text',
            text: `Успешно создана ${modeLabel} "${diagram.title}". Тема: ${diagram.theme}, Направление: ${diagram.direction}. Интерактивный холст: http://localhost:3344/editor?id=${diagram.id}`
          }]
        };
      }

      case 'add_node': {
        const node = store.addNode({
          id: args.id,
          label: args.label,
          shape: args.shape as NodeShape,
          x: args.x,
          y: args.y,
          width: args.width,
          height: args.height,
          groupId: args.groupId,
          branchLabels: args.branchLabels,
          columns: args.columns,
          style: extractNodeStyle(args)
        });

        return {
          content: [{
            type: 'text',
            text: `Добавлен блок [${node.id}] ("${node.label}", форма: ${node.shape})`
          }]
        };
      }

      case 'add_nodes': {
        const nodesToAdd = (args.nodes || []).map((n: any) => ({
          id: n.id,
          label: n.label,
          shape: n.shape as NodeShape,
          groupId: n.groupId,
          width: n.width,
          height: n.height,
          branchLabels: n.branchLabels,
          columns: n.columns,
          style: extractNodeStyle(n)
        }));

        const added = store.addNodes(nodesToAdd);

        if (args.autoLayout !== false) {
          store.applyLayout();
        }

        return {
          content: [{
            type: 'text',
            text: `Добавлено блоков: ${added.length} (${added.map(n => n.id).join(', ')})${args.autoLayout !== false ? ' с авто-раскладкой' : ''}`
          }]
        };
      }

      case 'add_edge': {
        const edge = store.addEdge({
          source: args.source,
          target: args.target,
          label: args.label,
          sourcePort: args.sourcePort as PortPosition,
          targetPort: args.targetPort as PortPosition,
          style: extractEdgeStyle(args)
        });

        return {
          content: [{
            type: 'text',
            text: `Создана связь [${edge.id}] ${edge.source} → ${edge.target}${edge.label ? ` ("${edge.label}")` : ''}`
          }]
        };
      }

      case 'add_edges': {
        const edgesToAdd = (args.edges || []).map((e: any) => ({
          source: e.source,
          target: e.target,
          label: e.label,
          style: extractEdgeStyle(e)
        }));

        const added = store.addEdges(edgesToAdd);

        if (args.autoLayout !== false) {
          store.applyLayout();
        }

        return {
          content: [{
            type: 'text',
            text: `Добавлено связей: ${added.length}${args.autoLayout !== false ? ' с авто-раскладкой' : ''}`
          }]
        };
      }

      case 'update_node': {
        const updated = store.updateNode(args.id, {
          label: args.label,
          shape: args.shape as NodeShape,
          width: args.width,
          height: args.height,
          x: args.x,
          y: args.y,
          branchLabels: args.branchLabels,
          columns: args.columns,
          style: extractNodeStyle(args)
        });

        if (!updated) {
          return { content: [{ type: 'text', text: `Блок с ID "${args.id}" не найден` }], isError: true };
        }

        return {
          content: [{ type: 'text', text: `Обновлен блок [${updated.id}]` }]
        };
      }

      case 'delete_node': {
        const success = store.deleteNode(args.id);
        return {
          content: [{ type: 'text', text: success ? `Удален блок "${args.id}"` : `Блок "${args.id}" не найден` }]
        };
      }

      case 'update_edge': {
        const updated = store.updateEdge(args.id, {
          label: args.label,
          style: extractEdgeStyle(args)
        });

        if (!updated) {
          return { content: [{ type: 'text', text: `Связь с ID "${args.id}" не найдена` }], isError: true };
        }

        return {
          content: [{ type: 'text', text: `Обновлена связь [${updated.id}]` }]
        };
      }

      case 'delete_edge': {
        const success = store.deleteEdge(args.id);
        return {
          content: [{ type: 'text', text: success ? `Удалена связь "${args.id}"` : `Связь "${args.id}" не найдена` }]
        };
      }

      case 'group_nodes': {
        const group = store.groupNodes(args.groupId, args.nodeIds, args.label);
        return {
          content: [{
            type: 'text',
            text: `Блоки [${args.nodeIds.join(', ')}] объединены в группу "${group.label}" (${group.id})`
          }]
        };
      }

      case 'apply_layout': {
        const diagram = store.applyLayout(args.direction, args.spacingX, args.spacingY);
        return {
          content: [{
            type: 'text',
            text: `Применен авто-лейаут (${diagram.direction}) для ${diagram.nodes.length} блоков и ${diagram.edges.length} связей.`
          }]
        };
      }

      case 'get_diagram': {
        const diagram = store.getDiagram();
        let summary = `Блок-схема: "${diagram.title}" (Тема: ${diagram.theme}, Направление: ${diagram.direction})\n`;
        summary += `Блоки (${diagram.nodes.length}):\n`;
        diagram.nodes.forEach(n => {
          summary += `  - [${n.id}] (${n.shape}) "${n.label}" в (${n.x}, ${n.y})${n.groupId ? ` [Группа: ${n.groupId}]` : ''}\n`;
        });
        summary += `Связи (${diagram.edges.length}):\n`;
        diagram.edges.forEach(e => {
          summary += `  - ${e.source} → ${e.target}${e.label ? ` [Текст: "${e.label}"]` : ''}\n`;
        });
        if (diagram.groups.length > 0) {
          summary += `Группы (${diagram.groups.length}):\n`;
          diagram.groups.forEach(g => {
            summary += `  - [${g.id}] "${g.label}"\n`;
          });
        }

        return {
          content: [{
            type: 'text',
            text: summary + '\nJSON Структура:\n' + JSON.stringify(diagram, null, 2)
          }]
        };
      }

      case 'render_svg': {
        const diagram = store.getDiagram();
        const svg = renderDiagramToSVG(diagram, { theme: args.theme });
        return {
          content: [
            { type: 'text', text: `Сгенерирован SVG (${diagram.nodes.length} блоков, ${diagram.edges.length} связей):\n\n` + svg }
          ]
        };
      }

      case 'wait_for_user_feedback': {
        const approval = await store.requestUserApproval(args.message, args.options);
        return {
          content: [{
            type: 'text',
            text: `Пользователь ${approval.status === 'approved' ? 'ОДОБРИЛ' : 'ОТКЛОНИЛ'} запрос.${approval.userResponse ? `\nОтвет пользователя: "${approval.userResponse}"` : ''}`
          }]
        };
      }

      case 'import_sql': {
        const diagram = sqlToDiagram(
          args.sql,
          args.title || 'Схема базы данных',
          args.direction as LayoutDirection || 'LR',
          args.diagramId,
          'light'
        );
        store.setFullDiagram(diagram);
        return {
          content: [{
            type: 'text',
            text: `Успешно импортирована схема базы данных "${diagram.title}". Создано таблиц: ${diagram.nodes.length}, связей (FK): ${diagram.edges.length}. Интерактивный холст: http://localhost:3344/editor?id=${diagram.id}`
          }]
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Неизвестный инструмент: ${name}` }],
          isError: true
        };
    }
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Ошибка выполнения ${name}: ${err.message || String(err)}` }],
      isError: true
    };
  }
}
