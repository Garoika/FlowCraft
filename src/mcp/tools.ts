import { DiagramStore } from '../server/store.js';
import { renderDiagramToSVG } from '../engine/renderer.js';
import { LayoutDirection, DiagramTheme, NodeShape, PortPosition, EdgeRouting } from '../engine/model.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
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
          enum: ['flowchart', 'chen'],
          description: 'Режим диаграммы: flowchart (Блок-схема) или chen (Нотация Чена / ER-диаграмма сущностей и связей). По умолчанию: flowchart'
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
          enum: ['terminal', 'process', 'decision', 'io', 'database', 'subroutine', 'cloud', 'note', 'hexagon', 'circle', 'entity', 'relationship', 'attribute', 'ellipse'],
          description: 'Форма блока: terminal, process, decision, io, database, subroutine, cloud, note, hexagon, circle, entity (Сущность), relationship (Связь), attribute (Атрибут/Эллипс).'
        },
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
                enum: ['terminal', 'process', 'decision', 'io', 'database', 'subroutine', 'cloud', 'note', 'hexagon', 'circle', 'entity', 'relationship', 'attribute', 'ellipse']
              },
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
        arrowEnd: { type: 'boolean', description: 'Стрелка на конце к цели (в нотации Чена обозначает ограничение "не более одного")' },
        arrowStart: { type: 'boolean', description: 'Стрелка на начале у источника' }
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
              arrowEnd: { type: 'boolean' },
              arrowStart: { type: 'boolean' }
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
          enum: ['terminal', 'process', 'decision', 'io', 'database', 'subroutine', 'cloud', 'note', 'hexagon', 'circle', 'entity', 'relationship', 'attribute', 'ellipse']
        },
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
    description: 'Обновить существующую связь (надпись, стиль, анимацию, кратность, двойную линию).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID связи' },
        label: { type: 'string', description: 'Новая надпись' },
        routing: { type: 'string', enum: ['orthogonal', 'bezier', 'straight'] },
        animated: { type: 'boolean' },
        dashed: { type: 'boolean' },
        isDouble: { type: 'boolean' },
        cardinality: { type: 'string' },
        arrowEnd: { type: 'boolean' },
        arrowStart: { type: 'boolean' }
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
        const modeLabel = diagram.mode === 'chen' ? 'Нотация Чена (ER)' : 'Блок-схема';
        return {
          content: [{
            type: 'text',
            text: `Успешно создана ${modeLabel} "${diagram.title}". Тема: ${diagram.theme}, Направление: ${diagram.direction}. Интерактивный холст доступен: http://localhost:3344`
          }]
        };
      }

      case 'add_node': {
        const style: Record<string, any> = {};
        if (args.fillColor) style.fill = args.fillColor;
        if (args.strokeColor) style.stroke = args.strokeColor;
        if (args.dashed !== undefined) style.dashed = args.dashed;
        if (args.badge) style.badge = args.badge;
        if (args.isWeak !== undefined) style.isWeak = args.isWeak;
        if (args.isKey !== undefined) style.isKey = args.isKey;
        if (args.isMultivalued !== undefined) style.isMultivalued = args.isMultivalued;
        if (args.isDerived !== undefined) style.isDerived = args.isDerived;

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
          style: Object.keys(style).length > 0 ? style : undefined
        });

        return {
          content: [{
            type: 'text',
            text: `Добавлен блок [${node.id}] ("${node.label}", форма: ${node.shape})`
          }]
        };
      }

      case 'add_nodes': {
        const nodesToAdd = (args.nodes || []).map((n: any) => {
          const style: Record<string, any> = {};
          if (n.fillColor) style.fill = n.fillColor;
          if (n.strokeColor) style.stroke = n.strokeColor;
          if (n.badge) style.badge = n.badge;
          if (n.isWeak !== undefined) style.isWeak = n.isWeak;
          if (n.isKey !== undefined) style.isKey = n.isKey;
          if (n.isMultivalued !== undefined) style.isMultivalued = n.isMultivalued;
          if (n.isDerived !== undefined) style.isDerived = n.isDerived;

          return {
            id: n.id,
            label: n.label,
            shape: n.shape as NodeShape,
            groupId: n.groupId,
            width: n.width,
            height: n.height,
            branchLabels: n.branchLabels,
            style: Object.keys(style).length > 0 ? style : undefined
          };
        });

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
        const style: Record<string, any> = {};
        if (args.strokeColor) style.stroke = args.strokeColor;
        if (args.routing) style.routing = args.routing as EdgeRouting;
        if (args.animated !== undefined) style.animated = args.animated;
        if (args.dashed !== undefined) style.dashed = args.dashed;
        if (args.isDouble !== undefined) style.isDouble = args.isDouble;
        if (args.cardinality !== undefined) style.cardinality = args.cardinality;
        if (args.arrowEnd !== undefined) style.arrowEnd = args.arrowEnd;
        if (args.arrowStart !== undefined) style.arrowStart = args.arrowStart;

        const edge = store.addEdge({
          source: args.source,
          target: args.target,
          label: args.label,
          sourcePort: args.sourcePort as PortPosition,
          targetPort: args.targetPort as PortPosition,
          style: Object.keys(style).length > 0 ? style : undefined
        });

        return {
          content: [{
            type: 'text',
            text: `Создана связь ${edge.source} → ${edge.target}${edge.label ? ` ("${edge.label}")` : ''}`
          }]
        };
      }

      case 'add_edges': {
        const edgesToAdd = (args.edges || []).map((e: any) => {
          const style: Record<string, any> = {};
          if (e.routing) style.routing = e.routing as EdgeRouting;
          if (e.animated !== undefined) style.animated = e.animated;
          if (e.dashed !== undefined) style.dashed = e.dashed;
          if (e.isDouble !== undefined) style.isDouble = e.isDouble;
          if (e.cardinality !== undefined) style.cardinality = e.cardinality;
          if (e.arrowEnd !== undefined) style.arrowEnd = e.arrowEnd;
          if (e.arrowStart !== undefined) style.arrowStart = e.arrowStart;

          return {
            source: e.source,
            target: e.target,
            label: e.label,
            style: Object.keys(style).length > 0 ? style : undefined
          };
        });

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
        const style: Record<string, any> = {};
        if (args.fillColor) style.fill = args.fillColor;
        if (args.strokeColor) style.stroke = args.strokeColor;
        if (args.badge) style.badge = args.badge;
        if (args.isWeak !== undefined) style.isWeak = args.isWeak;
        if (args.isKey !== undefined) style.isKey = args.isKey;
        if (args.isMultivalued !== undefined) style.isMultivalued = args.isMultivalued;
        if (args.isDerived !== undefined) style.isDerived = args.isDerived;

        const updated = store.updateNode(args.id, {
          label: args.label,
          shape: args.shape as NodeShape,
          width: args.width,
          height: args.height,
          x: args.x,
          y: args.y,
          branchLabels: args.branchLabels,
          style: Object.keys(style).length > 0 ? style : undefined
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
        const style: Record<string, any> = {};
        if (args.routing) style.routing = args.routing;
        if (args.animated !== undefined) style.animated = args.animated;
        if (args.dashed !== undefined) style.dashed = args.dashed;
        if (args.isDouble !== undefined) style.isDouble = args.isDouble;
        if (args.cardinality !== undefined) style.cardinality = args.cardinality;
        if (args.arrowEnd !== undefined) style.arrowEnd = args.arrowEnd;
        if (args.arrowStart !== undefined) style.arrowStart = args.arrowStart;

        const updated = store.updateEdge(args.id, {
          label: args.label,
          style: Object.keys(style).length > 0 ? style : undefined
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
