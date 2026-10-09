# ⚡ FlowCraft — Custom Flowchart Engine & MCP Server for AI Agents

> **MCP (Model Context Protocol) сервер и автономный движок блок-схем с нуля с полным ручным контролем пользователя в режиме реального времени.**

FlowCraft позволяет любым ИИ-агентам (Claude, Antigravity, Cursor, Windsurf, LangChain и др.) самостоятельно создавать, дополнять и редактировать блок-схемы и архитектурные диаграммы, в то время как **пользователь видит все изменения в браузере в реальном времени и сохраняет 100% контроль над процессом**.

---

## ✨ Ключевые возможности

- 🚀 **Написан с нуля на чистом TypeScript:** Никаких тяжелых сторонних библиотек диаграмм (без Mermaid, React Flow, GoJS, Graphviz). Собственная модель графа, собственный алгоритм топологической раскладки (DAG auto-layout), ортогональной и прямой трассировки стрелок.
- 🤖 **Полноценный MCP Сервер (15 инструментов):** Богатый API для нейросетей (`list_diagrams`, `create_diagram`, `add_node`, `add_nodes`, `add_edge`, `add_edges`, `update_node`, `delete_node`, `update_edge`, `delete_edge`, `group_nodes`, `apply_layout`, `get_diagram`, `render_svg`, `wait_for_user_feedback`).
- 📊 **Два специализированных режима (`mode: 'flowchart' | 'chen'`):**
  - **Блок-схемы (Flowchart):** Ортогональные линии под 90°, стрелки слияния ГОСТ в тройниках, ручки сегментов.
  - **Нотация Чена (ER-диаграммы):** Сущности, ромбы связей, овалы атрибутов, кардинальности (`1`, `N`, `M`), двойные линии полного участия, прямая трассировка и двунаправленные стрелки.
- 🔍 **Многоуровневая декомпозиция (Entity Drill-Down):** Погружение внутрь сущностей по кнопке `⤢`, вложенные суб-диаграммы атрибутов, навигация по хлебным крошкам (Breadcrumbs) без потери контекста.
- 🎨 **Интерактивный Live Web UI (`http://localhost:3344`):**
  - Живое полотно на чистом SVG с плавным Zoom (до 400%) и Pan.
  - Drag & Drop перемещение узлов с мгновенной перерисовкой связей на 60fps.
  - Палитра форм для добавления блоков вручную (адаптируется под выбранный режим).
  - Инспектор свойств (текст, цвет, форма, размеры, бейджи, кардинальности, анимация линий).
  - История изменений с поддержкой Undo (Ctrl+Z) и Redo (Ctrl+Y).
  - Экспорт в SVG, PNG, JSON в один клик.
- 🧑‍💻 **Человек в контуре (Human-in-the-loop):** Инструмент `wait_for_user_feedback` открывает модальное окно на экране пользователя, ожидая подтверждения или правок перед продолжением работы агента.
- 🎭 **14 типов блоков и 6 современных тем:**
  - **Блок-схемы:** `terminal` (Start/End), `process` (Задача), `decision` (Условие/Ромб), `io` (Ввод/Вывод), `display` (Дисплей), `database` (БД), `subroutine` (Подпрограмма), `cloud` (Облако/API), `note` (Заметка), `hexagon` (Цикл), `circle` (Коннектор).
  - **Нотация Чена:** `entity` (Сущность), `relationship` (Связь), `attribute` / `ellipse` (Атрибут).
  - **Темы:** `Dark Slate` (`dark`), `Pure Light` (`light`), `Cyberpunk` (`cyberpunk`), `Blueprint` (`blueprint`), `Emerald` (`emerald`), `Nord Arctic` (`nord`).

---

## 📦 Быстрый старт

### 1. Установка и запуск

```bash
git clone https://github.com/Garoika/FlowCraft.git
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
      "args": ["/path/to/FlowCraft/dist/index.js"]
    }
  }
}
```
> **Для Windows:** укажите абсолютный путь к вашему клонированному репозиторию, например `"C:/path/to/FlowCraft/dist/index.js"`.

### Подключение в Antigravity / Cursor / Windsurf (`mcp.json`)

```json
{
  "mcpServers": {
    "flowcraft": {
      "command": "node",
      "args": ["/path/to/FlowCraft/dist/index.js"]
    }
  }
}
```

---

## 🛠️ Набор MCP Инструментов

| Инструмент | Описание |
| :--- | :--- |
| `list_diagrams()` | Получить список всех сохраненных диаграмм в Хабе FlowCraft с их метаданными |
| `create_diagram(title, description?, mode?, direction?, theme?)` | Создать новую диаграмму (`flowchart` или `chen`) с направлением (`TB`, `LR`, `BT`, `RL`) и темой |
| `add_node(id, label, shape?, badge?, fillColor?, strokeColor?, ...)` | Добавить отдельный узел (блок-схема или элемент Чена) |
| `add_nodes(nodes, autoLayout?)` | Пакетное добавление узлов в один вызов |
| `add_edge(source, target, label?, routing?, animated?, dashed?, isDouble?, cardinality?, ...)` | Связать два узла стрелкой (с поддержкой прямого начертания и нотации Чена) |
| `add_edges(edges, autoLayout?)` | Пакетное связывание узлов |
| `update_node(id, label?, shape?, ...)` | Изменить свойства, форму или текст узла |
| `delete_node(id)` | Удалить узел и связанные с ним ребра |
| `update_edge(id, label?, style?)` | Изменить надпись, стиль, кардинальность или стрелки связи |
| `delete_edge(id)` | Удалить связь |
| `group_nodes(groupId, label, nodeIds)` | Объединить узлы в визуальный контейнер/swimlane |
| `apply_layout(direction?, spacingX?, spacingY?)` | Пересчитать авто-раскладку узлов |
| `get_diagram()` | Получить текущую структуру диаграммы (ASCII + JSON) |
| `render_svg(theme?)` | Сгенерировать готовый автономный SVG-код диаграммы |
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
