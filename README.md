# ⚡ FlowCraft — Custom Flowchart Engine & MCP Server for AI Agents

> **MCP (Model Context Protocol) сервер и автономный движок блок-схем с нуля с полным ручным контролем пользователя в режиме реального времени.**

FlowCraft позволяет любым ИИ-агентам (Claude, Antigravity, Cursor, Windsurf, LangChain и др.) самостоятельно создавать, дополнять и редактировать блок-схемы и архитектурные диаграммы, в то время как **пользователь видит все изменения в браузере в реальном времени и сохраняет 100% контроль над процессом**.

---

## ✨ Ключевые возможности

- 🚀 **Написан с нуля на чистом TypeScript:** Никаких тяжелых сторонних библиотек диаграмм (без Mermaid, React Flow, GoJS, Graphviz). Собственная модель графа, собственный алгоритм топологической раскладки (DAG auto-layout) и ортогональной трассировки стрелок.
- 🤖 **Полноценный MCP Сервер:** 14 мощных инструментов для нейросетей (`create_diagram`, `add_node`, `add_nodes`, `add_edge`, `add_edges`, `update_node`, `delete_node`, `group_nodes`, `apply_layout`, `render_svg`, `get_diagram`, `wait_for_user_feedback`).
- 🎨 **Интерактивный Live Web UI (`http://localhost:3344`):**
  - Живое полотно на чистом SVG с плавным Zoom (до 400%) и Pan.
  - Drag & Drop перемещение узлов с мгновенной перерисовкой связей.
  - Палитра форм для добавления блоков вручную.
  - Инспектор свойств (текст, цвет, форма, размеры, бейджи, анимация линий).
  - История изменений с поддержкой Undo (Ctrl+Z) и Redo (Ctrl+Y).
  - Экспорт в SVG, PNG, JSON или копирование SVG кода в один клик.
- 🧑‍💻 **Человек в контуре (Human-in-the-loop):** Инструмент `wait_for_user_feedback` открывает модальное окно на экране пользователя, ожидая подтверждения или правок перед продолжением работы агента.
- 🎭 **10 типов блоков и 6 современных тем:**
  - Формы: `terminal` (Start/End), `process` (Задача), `decision` (Условие/Ромб), `io` (Ввод/Вывод), `database` (База данных), `subroutine` (Подпрограмма/Модуль), `cloud` (Облако/API), `note` (Заметка), `hexagon` (Цикл/Подготовка), `circle` (Коннектор).
  - Темы: `Dark Slate`, `Pure Light`, `Cyberpunk`, `Blueprint`, `Emerald`, `Nord Arctic`.

---

## 📦 Быстрый старт

### 1. Установка и запуск

```bash
git clone https://github.com/Garou/FlowCraft.git
cd FlowCraft
npm install
npm run build
npm start
```

После запуска:
- **Web UI:** Откройте в браузере [http://localhost:3344](http://localhost:3344)
- **MCP Server:** Автоматически принимает команды по протоколу `stdio` (JSON-RPC).

---

## 🔌 Подключение к ИИ-агентам и IDE

### Подключение в Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "flowcraft": {
      "command": "node",
      "args": ["f:/github/FlowCraft/dist/index.js"]
    }
  }
}
```

### Подключение в Antigravity / Cursor / Windsurf (`mcp.json`)

```json
{
  "mcpServers": {
    "flowcraft": {
      "command": "node",
      "args": ["f:/github/FlowCraft/dist/index.js"]
    }
  }
}
```

---

## 🛠️ Набор MCP Инструментов

| Инструмент | Описание |
| :--- | :--- |
| `create_diagram(title, description?, direction?, theme?)` | Создать новую диаграмму с направлением (`TB`, `LR`, `BT`, `RL`) и темой |
| `add_node(id, label, shape?, badge?, fillColor?, strokeColor?, ...)` | Добавить отдельный узел |
| `add_nodes(nodes, autoLayout?)` | Пакетное добавление узлов в один вызов |
| `add_edge(source, target, label?, routing?, animated?, dashed?)` | Связать два узла направленной стрелкой |
| `add_edges(edges, autoLayout?)` | Пакетное связывание узлов |
| `update_node(id, label?, shape?, ...)` | Изменить свойства или текст узла |
| `delete_node(id)` | Удалить узел и его связи |
| `update_edge(id, label?, style?)` | Изменить надпись или стиль связи |
| `delete_edge(id)` | Удалить связь |
| `group_nodes(groupId, label, nodeIds)` | Объединить узлы в визуальный контейнер/swimlane |
| `apply_layout(direction?, spacingX?, spacingY?)` | Пересчитать авто-раскладку узлов |
| `get_diagram()` | Получить структуру диаграммы (ASCII + JSON) |
| `render_svg(theme?)` | Сгенерировать чистый SVG код диаграммы |
| `wait_for_user_feedback(message, options?)` | Приостановить генерацию и запросить одобрение пользователя |

---

## 🧪 Тестирование

Запуск встроенного набора тестов:

```bash
npm test
```

---

## 📄 Лицензия

MIT License © 2026 Garou
