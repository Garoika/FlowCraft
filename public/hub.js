// FlowCraft Hub Controller
(function() {
  let diagrams = [];
  let deleteTargetId = null;
  let ws = null;

  // DOM Elements
  const diagramsGrid = document.getElementById('diagramsGrid');
  const cardCreateNew = document.getElementById('cardCreateNew');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const btnNewDiagram = document.getElementById('btnNewDiagram');
  const btnEmptyCreate = document.getElementById('btnEmptyCreate');
  const btnImportJson = document.getElementById('btnImportJson');
  const hubFileInput = document.getElementById('hubFileInput');
  const diagramsCountBadge = document.getElementById('diagramsCountBadge');
  const deleteModal = document.getElementById('deleteModal');
  const deleteModalText = document.getElementById('deleteModalText');
  const btnCloseDeleteModal = document.getElementById('btnCloseDeleteModal');
  const btnCancelDelete = document.getElementById('btnCancelDelete');
  const btnConfirmDelete = document.getElementById('btnConfirmDelete');
  const hubDropZone = document.getElementById('hubDropZone');

  // Initialize
  init();

  function init() {
    setupWebSocket();
    fetchDiagrams();
    setupEventListeners();
    setupDragAndDrop();
  }

  function setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'diagrams:list_updated' && msg.payload?.diagrams) {
          diagrams = msg.payload.diagrams;
          renderGrid();
        } else if (msg.type === 'diagram:deleted' || (msg.type === 'diagram:update' && msg.payload?.action === 'create_diagram')) {
          fetchDiagrams();
        }
      } catch (e) {}
    };

    ws.onclose = () => {
      setTimeout(setupWebSocket, 3000);
    };
  }

  async function fetchDiagrams() {
    try {
      const res = await fetch('/api/diagrams');
      if (res.ok) {
        diagrams = await res.json();
        renderGrid();
      }
    } catch (err) {
      console.error('[Hub] Failed to fetch diagrams:', err);
    }
  }

  function setupEventListeners() {
    // Search filter
    searchInput.addEventListener('input', () => {
      renderGrid();
    });

    // Create modal
    const createModal = document.getElementById('createModal');
    const newDiagramTitleInput = document.getElementById('newDiagramTitleInput');
    const btnCloseCreateModal = document.getElementById('btnCloseCreateModal');
    const btnCancelCreate = document.getElementById('btnCancelCreate');
    const btnConfirmCreate = document.getElementById('btnConfirmCreate');
    const modeCards = document.querySelectorAll('.mode-card');

    let selectedCreateMode = 'flowchart';

    modeCards.forEach(card => {
      card.addEventListener('click', () => {
        modeCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        selectedCreateMode = card.dataset.mode;
        if (newDiagramTitleInput.value === 'Новая блок-схема' || newDiagramTitleInput.value === 'Новая ER-диаграмма' || newDiagramTitleInput.value === 'Новая схема') {
          newDiagramTitleInput.value = selectedCreateMode === 'chen' ? 'Новая ER-диаграмма' : 'Новая блок-схема';
        }
      });
    });

    function openCreateModal() {
      newDiagramTitleInput.value = selectedCreateMode === 'chen' ? 'Новая ER-диаграмма' : 'Новая блок-схема';
      createModal.classList.add('active');
      setTimeout(() => {
        newDiagramTitleInput.focus();
        newDiagramTitleInput.select();
      }, 60);
    }

    function closeCreateModal() {
      createModal.classList.remove('active');
    }

    btnNewDiagram.addEventListener('click', openCreateModal);
    cardCreateNew.addEventListener('click', openCreateModal);
    btnEmptyCreate.addEventListener('click', openCreateModal);
    btnCloseCreateModal.addEventListener('click', closeCreateModal);
    btnCancelCreate.addEventListener('click', closeCreateModal);

    btnConfirmCreate.addEventListener('click', async () => {
      const title = (newDiagramTitleInput.value || '').trim() || (selectedCreateMode === 'chen' ? 'Новая ER-диаграмма' : 'Новая блок-схема');
      closeCreateModal();
      await createNewDiagramWithMode(title, selectedCreateMode);
    });

    newDiagramTitleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        btnConfirmCreate.click();
      }
    });

    // Import JSON file picker
    btnImportJson.addEventListener('click', () => {
      hubFileInput.click();
    });

    hubFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        importJsonFile(file);
      }
      hubFileInput.value = '';
    });

    // Delete modal
    btnCloseDeleteModal.addEventListener('click', closeDeleteModal);
    btnCancelDelete.addEventListener('click', closeDeleteModal);
    btnConfirmDelete.addEventListener('click', async () => {
      if (deleteTargetId) {
        await executeDeleteDiagram(deleteTargetId);
        closeDeleteModal();
      }
    });

    // Close open menus on document click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.card-menu-btn') && !e.target.closest('.card-dropdown')) {
        closeAllDropdowns();
      }
    });
  }

  function renderGrid() {
    const query = (searchInput.value || '').trim().toLowerCase();
    const filtered = diagrams.filter(d => {
      return (d.title && d.title.toLowerCase().includes(query)) ||
             (d.id && d.id.toLowerCase().includes(query));
    });

    diagramsCountBadge.textContent = diagrams.length;

    // Remove existing diagram cards (keep cardCreateNew)
    const existingCards = diagramsGrid.querySelectorAll('.diagram-item-card');
    existingCards.forEach(c => c.remove());

    if (filtered.length === 0 && query) {
      emptyState.classList.remove('hidden');
      emptyState.querySelector('h3').textContent = 'Ничего не найдено';
      emptyState.querySelector('p').textContent = `По запросу "${query}" нет блок-схем.`;
      btnEmptyCreate.classList.add('hidden');
    } else if (diagrams.length === 0) {
      emptyState.classList.remove('hidden');
      emptyState.querySelector('h3').textContent = 'Блок-схем пока нет';
      emptyState.querySelector('p').textContent = 'Создайте новую схему или импортируйте существующий JSON файл.';
      btnEmptyCreate.classList.remove('hidden');
    } else {
      emptyState.classList.add('hidden');
    }

    filtered.forEach((diag, idx) => {
      const card = createDiagramCardElement(diag, idx);
      diagramsGrid.appendChild(card);
    });
  }

  function createDiagramCardElement(diag, index = 0) {
    const card = document.createElement('div');
    card.className = 'diagram-card diagram-item-card';
    card.dataset.id = diag.id;
    card.style.animationDelay = `${(index + 1) * 0.04}s`;

    const timeAgo = formatTimeAgo(diag.updatedAt || diag.createdAt);
    const nodeCount = diag.nodeCount || 0;
    const edgeCount = diag.edgeCount || 0;
    const isChen = diag.mode === 'chen';
    const modeBadgeText = isChen ? 'Нотация Чена' : 'Блок-схема';
    const modeBadgeClass = isChen ? 'badge-chen' : 'badge-flowchart';

    card.innerHTML = `
      <div class="card-preview-wrapper">
        <img class="card-preview-svg" src="/api/diagrams/${encodeURIComponent(diag.id)}/preview.svg?t=${diag.updatedAt || Date.now()}" alt="${escapeHtml(diag.title)}" loading="lazy" />
      </div>
      <div class="card-content">
        <div class="card-title-row">
          <input type="text" class="card-title-input" value="${escapeHtml(diag.title)}" title="Нажмите, чтобы изменить название" />
          <button class="card-menu-btn" title="Опции" data-id="${diag.id}">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <circle cx="12" cy="12" r="1"></circle>
              <circle cx="12" cy="5" r="1"></circle>
              <circle cx="12" cy="19" r="1"></circle>
            </svg>
          </button>
        </div>
        <div class="card-meta">
          <span class="card-mode-badge ${modeBadgeClass}">${modeBadgeText}</span>
          <span class="card-meta-dot">•</span>
          <span>${nodeCount} ${pluralize(nodeCount, ['блок', 'блока', 'блоков'])}</span>
          <span class="card-meta-dot">•</span>
          <span>${timeAgo}</span>
        </div>
      </div>
      <div class="card-dropdown" id="dropdown-${diag.id}">
        <button class="card-dropdown-item" data-action="open">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          Открыть
        </button>
        <button class="card-dropdown-item" data-action="duplicate">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          Дублировать
        </button>
        <button class="card-dropdown-item" data-action="export-svg">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Скачать SVG
        </button>
        <button class="card-dropdown-item" data-action="export-json">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Экспорт JSON
        </button>
        <button class="card-dropdown-item danger" data-action="delete">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          Удалить
        </button>
      </div>
    `;

    // Inline title editing
    const titleInput = card.querySelector('.card-title-input');
    if (titleInput) {
      titleInput.addEventListener('click', (e) => e.stopPropagation());
      titleInput.addEventListener('mousedown', (e) => e.stopPropagation());
      titleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          titleInput.blur();
        }
      });
      titleInput.addEventListener('change', async () => {
        const newTitle = titleInput.value.trim() || 'Новая блок-схема';
        titleInput.value = newTitle;
        diag.title = newTitle;
        try {
          await fetch(`/api/diagrams/${encodeURIComponent(diag.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
          });
        } catch (err) {
          console.error('[Hub] Failed to update title:', err);
        }
      });
    }

    // Click on card opens editor
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-menu-btn') || e.target.closest('.card-dropdown') || e.target.closest('.card-title-input')) {
        return;
      }
      openDiagram(diag.id);
    });

    // Menu button
    const menuBtn = card.querySelector('.card-menu-btn');
    const dropdown = card.querySelector('.card-dropdown');

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = dropdown.classList.contains('active');
      closeAllDropdowns();
      if (!isActive) {
        dropdown.classList.add('active');
      }
    });

    // Menu Actions
    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = e.target.closest('.card-dropdown-item');
      if (!item) return;

      const action = item.dataset.action;
      dropdown.classList.remove('active');

      if (action === 'open') {
        openDiagram(diag.id);
      } else if (action === 'duplicate') {
        duplicateDiagram(diag.id);
      } else if (action === 'export-svg') {
        downloadDiagramSvg(diag.id, diag.title);
      } else if (action === 'export-json') {
        downloadDiagramJson(diag.id, diag.title);
      } else if (action === 'delete') {
        promptDeleteDiagram(diag.id, diag.title);
      }
    });

    return card;
  }

  function closeAllDropdowns() {
    document.querySelectorAll('.card-dropdown.active').forEach(d => d.classList.remove('active'));
  }

  async function createNewDiagramWithMode(title = 'Новая схема', mode = 'flowchart') {
    try {
      const res = await fetch('/api/diagrams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, mode })
      });
      if (res.ok) {
        const data = await res.json();
        openDiagram(data.id);
      }
    } catch (err) {
      console.error('[Hub] Failed to create diagram:', err);
    }
  }

  function openDiagram(id) {
    window.location.href = `/${encodeURIComponent(id)}`;
  }

  async function duplicateDiagram(id) {
    try {
      const res = await fetch(`/api/diagrams/${encodeURIComponent(id)}/duplicate`, {
        method: 'POST'
      });
      if (res.ok) {
        await fetchDiagrams();
      }
    } catch (err) {
      console.error('[Hub] Failed to duplicate diagram:', err);
    }
  }

  function promptDeleteDiagram(id, title) {
    deleteTargetId = id;
    deleteModalText.textContent = `Вы уверены, что хотите удалить блок-схему «${title || 'Без названия'}»? Это действие необратимо.`;
    deleteModal.classList.add('active');
  }

  function closeDeleteModal() {
    deleteModal.classList.remove('active');
    deleteTargetId = null;
  }

  async function executeDeleteDiagram(id) {
    try {
      const res = await fetch(`/api/diagrams/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchDiagrams();
      }
    } catch (err) {
      console.error('[Hub] Failed to delete diagram:', err);
    }
  }

  function downloadDiagramSvg(id, title) {
    const link = document.createElement('a');
    link.href = `/api/export/svg?diagramId=${encodeURIComponent(id)}&transparent=true`;
    link.download = `${title || 'diagram'}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function downloadDiagramJson(id, title) {
    try {
      const res = await fetch(`/api/diagrams/${encodeURIComponent(id)}`);
      if (res.ok) {
        const diagram = await res.json();
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(diagram, null, 2));
        const link = document.createElement('a');
        link.setAttribute('href', dataStr);
        link.setAttribute('download', `${title || 'flowchart'}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {}
  }

  async function importJsonFile(file) {
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (!parsed || !Array.isArray(parsed.nodes)) {
            alert('Неверный формат JSON блок-схемы.');
            return;
          }

          // Generate or keep id
          const id = 'chart_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          parsed.id = id;

          // Save via WebSocket or setFullDiagram
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'client:update_diagram',
              payload: parsed
            }));
          }

          setTimeout(() => {
            openDiagram(id);
          }, 300);
        } catch (err) {
          alert('Ошибка при чтении JSON: ' + err.message);
        }
      };
      reader.readAsText(file);
    } catch (err) {}
  }

  function setupDragAndDrop() {
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
        hubDropZone.classList.add('active');
      }
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        hubDropZone.classList.remove('active');
      }
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      hubDropZone.classList.remove('active');

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.name.endsWith('.json') || file.type === 'application/json') {
          importJsonFile(file);
        }
      }
    });
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'только что';
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return 'только что';
    const minutes = Math.floor(diff / 60);
    if (minutes < 60) return `${minutes} мин назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} дн назад`;
    return new Date(timestamp).toLocaleDateString('ru-RU');
  }

  function pluralize(n, forms) {
    n = Math.abs(n) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
