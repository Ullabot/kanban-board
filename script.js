const STORAGE_KEY = 'kanban-board-v3';
const CHANNEL_KEY = 'kanban-board-sync';

const WIP_LIMITS = {
  todo: 6,
  doing: 4,
  done: 999
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function weekAheadISO() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function seedState() {
  return {
    meta: {
      lastReminderCheckAt: null,
      notifiedDeadlines: {},
      lastWriteAt: nowISO()
    },
    todo: [],
    doing: [],
    done: [],
    archive: [],
    history: {}
  };
}

let state = migrateState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || seedState());
let activeTab = 'todo';
const syncChannel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_KEY) : null;

function migrateState(raw) {
  const s = raw || seedState();
  s.todo = Array.isArray(s.todo) ? s.todo : [];
  s.doing = Array.isArray(s.doing) ? s.doing : [];
  s.done = Array.isArray(s.done) ? s.done : [];
  s.archive = Array.isArray(s.archive) ? s.archive : [];
  s.history = s.history && typeof s.history === 'object' ? s.history : {};
  s.meta = s.meta && typeof s.meta === 'object' ? s.meta : {};
  s.meta.notifiedDeadlines = s.meta.notifiedDeadlines || {};
  s.meta.lastReminderCheckAt = s.meta.lastReminderCheckAt || null;
  s.meta.lastWriteAt = s.meta.lastWriteAt || nowISO();

  ['todo', 'doing', 'done', 'archive'].forEach(col => {
    s[col] = s[col].map(task => ({
      id: task.id || uid(),
      title: task.title || 'Uden titel',
      description: task.description || '',
      label: task.label || '',
      priority: task.priority || 'medium',
      deadline: task.deadline || '',
      createdAt: task.createdAt || new Date().toLocaleDateString('da-DK'),
      updatedAt: task.updatedAt || nowISO(),
      doneAt: task.doneAt || null,
      archivedAt: task.archivedAt || null
    }));
  });

  return s;
}

function pushTaskVersion(task, action, column) {
  if (!state.history[task.id]) state.history[task.id] = [];
  state.history[task.id].unshift({
    at: nowISO(),
    action,
    column,
    snapshot: {
      ...task
    }
  });
  state.history[task.id] = state.history[task.id].slice(0, 20);
}

function save(source = 'local') {
  state.meta.lastWriteAt = nowISO();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (syncChannel) {
    syncChannel.postMessage({ source, at: state.meta.lastWriteAt });
  }
}

function isOverdue(deadline) {
  if (!deadline) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deadline + 'T00:00:00');
  return d < today;
}

function matchesDeadlineFilter(deadline, rule) {
  if (rule === 'all') return true;
  if (rule === 'none') return !deadline;
  if (!deadline) return false;

  const today = todayISO();
  if (rule === 'overdue') return isOverdue(deadline);
  if (rule === 'today') return deadline === today;
  if (rule === 'week') return deadline >= today && deadline <= weekAheadISO();
  return true;
}

function taskVisible(task, column) {
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const labelFilter = document.getElementById('filterLabelInput').value.trim().toLowerCase();
  const priorityFilter = document.getElementById('filterPriorityInput').value;
  const statusFilter = document.getElementById('filterStatusInput').value;
  const deadlineFilter = document.getElementById('filterDeadlineInput').value;

  const haystack = `${task.title} ${task.description || ''} ${task.label || ''}`.toLowerCase();
  const searchOk = !search || haystack.includes(search);
  const labelOk = !labelFilter || (task.label || '').toLowerCase().includes(labelFilter);
  const priorityOk = priorityFilter === 'all' || task.priority === priorityFilter;
  const statusOk = statusFilter === 'all' || statusFilter === column;
  const deadlineOk = matchesDeadlineFilter(task.deadline, deadlineFilter);

  return searchOk && labelOk && priorityOk && statusOk && deadlineOk;
}

function createCard(task, column) {
  const card = document.createElement('article');
  card.className = 'card';
  card.draggable = true;

  const overdue = isOverdue(task.deadline) && column !== 'done';
  const deadlineLabel = task.deadline ? `Deadline: ${task.deadline}` : 'Ingen deadline';
  const descriptionBlock = task.description ? `<div class="description">${task.description}</div>` : '';

  card.innerHTML = `
    <div>${task.title}</div>
    ${descriptionBlock}
    <div class="meta">
      <span class="badge ${task.priority}">${task.priority}</span>
      <span class="badge label-pill">${task.label || 'uden label'}</span>
      <span class="deadline ${overdue ? 'overdue' : ''}">${deadlineLabel}</span>
    </div>
    <div class="actions">
      <button data-history="${task.id}">Historik</button>
      <button data-edit="${task.id}">Redigér</button>
      <button data-archive="${task.id}">Arkivér</button>
    </div>
  `;

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: task.id, from: column }));
  });

  card.querySelector('[data-archive]').addEventListener('click', () => {
    const taskToArchive = state[column].find(t => t.id === task.id);
    if (!taskToArchive) return;
    taskToArchive.archivedAt = nowISO();
    pushTaskVersion(taskToArchive, 'archived', column);

    state[column] = state[column].filter(t => t.id !== task.id);
    state.archive.unshift(taskToArchive);
    save();
    render();
  });

  card.querySelector('[data-edit]').addEventListener('click', () => {
    const newTitle = prompt('Ny titel:', task.title);
    if (newTitle === null) return;
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) return;

    const newDescription = prompt('Beskrivelse:', task.description || '') ?? task.description;
    const newLabel = prompt('Label/tag:', task.label || '') ?? task.label;
    const newDeadline = prompt('Deadline (YYYY-MM-DD eller tom):', task.deadline || '') ?? task.deadline;
    const newPriority = prompt('Prioritet (low|medium|high):', task.priority) ?? task.priority;

    pushTaskVersion(task, 'edited', column);
    task.title = trimmedTitle;
    task.description = (newDescription || '').trim();
    task.label = (newLabel || '').trim();
    task.deadline = (newDeadline || '').trim();
    task.priority = ['low', 'medium', 'high'].includes((newPriority || '').trim()) ? (newPriority || '').trim() : task.priority;
    task.updatedAt = nowISO();

    save();
    render();
  });

  card.querySelector('[data-history]').addEventListener('click', () => {
    const versions = state.history[task.id] || [];
    if (versions.length === 0) {
      alert('Ingen historik endnu.');
      return;
    }
    const text = versions
      .slice(0, 5)
      .map(v => `${new Date(v.at).toLocaleString('da-DK')} · ${v.action} · ${v.column}`)
      .join('\n');
    alert(`Seneste historik for "${task.title}":\n\n${text}`);
  });

  return card;
}

function renderWip() {
  const todoCount = state.todo.length;
  const doingCount = state.doing.length;
  const doneCount = state.done.length;

  const todoEl = document.getElementById('wipTodo');
  const doingEl = document.getElementById('wipDoing');
  const doneEl = document.getElementById('wipDone');

  todoEl.textContent = `${todoCount}/${WIP_LIMITS.todo}`;
  doingEl.textContent = `${doingCount}/${WIP_LIMITS.doing}`;
  doneEl.textContent = `${doneCount}`;

  todoEl.classList.toggle('warn', todoCount > WIP_LIMITS.todo);
  doingEl.classList.toggle('warn', doingCount > WIP_LIMITS.doing);
}

function renderColumn(column) {
  const zone = document.getElementById(column);
  zone.innerHTML = '';

  const visibleTasks = state[column].filter(task => taskVisible(task, column));
  if (visibleTasks.length === 0) {
    zone.innerHTML = '<div class="empty-note">Ingen opgaver matcher filteret.</div>';
    return;
  }

  visibleTasks.forEach(task => zone.appendChild(createCard(task, column)));
}

function analyticsHtml() {
  const all = [...state.todo, ...state.doing, ...state.done];
  const doneThisWeek = state.done.filter(t => {
    if (!t.doneAt) return false;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return new Date(t.doneAt) >= sevenDaysAgo;
  }).length;

  const overdue = [...state.todo, ...state.doing].filter(t => isOverdue(t.deadline)).length;
  const highOpen = [...state.todo, ...state.doing].filter(t => t.priority === 'high').length;

  const leadTimeDone = state.done
    .filter(t => t.doneAt)
    .map(t => (new Date(t.doneAt).getTime() - new Date(t.updatedAt || t.doneAt).getTime()) / (1000 * 60 * 60));
  const avgLead = leadTimeDone.length
    ? (leadTimeDone.reduce((a, b) => a + b, 0) / leadTimeDone.length).toFixed(1)
    : '0.0';

  return `
    <h3>Analytics</h3>
    <div class="row">Totale kort: <strong>${all.length}</strong></div>
    <div class="row">To do / I gang / Færdig: <strong>${state.todo.length} / ${state.doing.length} / ${state.done.length}</strong></div>
    <div class="row">Forsinkede åbne kort: <strong>${overdue}</strong></div>
    <div class="row">Åbne high-priority kort: <strong>${highOpen}</strong></div>
    <div class="row">Throughput (sidste 7 dage): <strong>${doneThisWeek}</strong> færdiggjorte kort</div>
    <div class="row">Gns. lead time (timer, approx): <strong>${avgLead}</strong></div>
  `;
}

function archiveHtml() {
  if (state.archive.length === 0) {
    return '<h3>Arkiv</h3><div class="row">Arkivet er tomt.</div>';
  }

  return `
    <h3>Arkiv</h3>
    ${state.archive
      .slice(0, 30)
      .map(task => `
        <div class="archive-item">
          <div>
            <div><strong>${task.title}</strong></div>
            <div class="row">Arkiveret: ${task.archivedAt ? new Date(task.archivedAt).toLocaleString('da-DK') : 'ukendt'}</div>
          </div>
          <button data-restore="${task.id}">Gendan</button>
        </div>
      `)
      .join('')}
  `;
}

function renderPanels() {
  const analyticsPanel = document.getElementById('analyticsPanel');
  if (!analyticsPanel.classList.contains('hidden')) {
    analyticsPanel.innerHTML = analyticsHtml();
  }

  const archivePanel = document.getElementById('archivePanel');
  if (!archivePanel.classList.contains('hidden')) {
    archivePanel.innerHTML = archiveHtml();
    archivePanel.querySelectorAll('[data-restore]').forEach(btn => {
      btn.addEventListener('click', () => {
        const taskId = btn.getAttribute('data-restore');
        const task = state.archive.find(t => t.id === taskId);
        if (!task) return;

        task.archivedAt = null;
        task.updatedAt = nowISO();
        pushTaskVersion(task, 'restored', 'archive');

        state.archive = state.archive.filter(t => t.id !== taskId);
        state.todo.unshift(task);
        save();
        render();
      });
    });
  }
}

function render() {
  ['todo', 'doing', 'done'].forEach(renderColumn);
  renderWip();
  renderPanels();
}

['todo', 'doing', 'done'].forEach(column => {
  const zone = document.getElementById(column);
  zone.addEventListener('dragover', (e) => e.preventDefault());
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
    const task = state[data.from].find(t => t.id === data.id);
    if (!task) return;

    pushTaskVersion(task, 'moved', `${data.from}->${column}`);
    state[data.from] = state[data.from].filter(t => t.id !== data.id);
    if (column === 'done') task.doneAt = nowISO();
    state[column].unshift(task);
    task.updatedAt = nowISO();

    save();
    render();
  });
});

document.getElementById('newTaskForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const titleInput = document.getElementById('taskInput');
  const labelInput = document.getElementById('labelInput');
  const priorityInput = document.getElementById('priorityInput');
  const deadlineInput = document.getElementById('deadlineInput');

  const title = titleInput.value.trim();
  if (!title) return;

  const task = {
    id: uid(),
    title,
    description: '',
    label: labelInput.value.trim(),
    priority: priorityInput.value,
    deadline: deadlineInput.value,
    createdAt: new Date().toLocaleDateString('da-DK'),
    updatedAt: nowISO(),
    doneAt: null,
    archivedAt: null
  };

  pushTaskVersion(task, 'created', 'todo');
  state.todo.unshift(task);

  titleInput.value = '';
  labelInput.value = '';
  priorityInput.value = 'medium';
  deadlineInput.value = '';
  save();
  render();
});

['searchInput', 'filterLabelInput', 'filterPriorityInput', 'filterStatusInput', 'filterDeadlineInput'].forEach(id => {
  document.getElementById(id).addEventListener('input', render);
  document.getElementById(id).addEventListener('change', render);
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'kanban-board-export.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById('importInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = migrateState(JSON.parse(text));
    state = parsed;
    save();
    render();
    alert('Import gennemført.');
  } catch (err) {
    alert('Import fejlede: ugyldig JSON.');
  }

  e.target.value = '';
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('Nulstil board?')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = seedState();
  save();
  render();
});

document.getElementById('analyticsBtn').addEventListener('click', () => {
  document.getElementById('analyticsPanel').classList.toggle('hidden');
  renderPanels();
});

document.getElementById('archiveBtn').addEventListener('click', () => {
  document.getElementById('archivePanel').classList.toggle('hidden');
  renderPanels();
});

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Browseren understøtter ikke notifikationer.');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

function checkDeadlineReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const openTasks = [...state.todo, ...state.doing];

  openTasks.forEach(task => {
    if (!task.deadline) return;
    const alreadyNotified = state.meta.notifiedDeadlines[task.id];

    const isDueSoon = task.deadline === todayISO() || task.deadline <= weekAheadISO();
    if (isDueSoon && !alreadyNotified) {
      new Notification('Kanban reminder', {
        body: `${task.title} (${task.deadline})`,
        tag: `deadline-${task.id}`
      });
      state.meta.notifiedDeadlines[task.id] = nowISO();
    }
  });

  state.meta.lastReminderCheckAt = nowISO();
  save('reminder');
}

document.getElementById('notifyBtn').addEventListener('click', async () => {
  const ok = await requestNotificationPermission();
  if (!ok) return;
  checkDeadlineReminders();
  alert('Reminders er aktiveret.');
});

setInterval(checkDeadlineReminders, 60 * 1000);

function setActiveMobileTab(tab) {
  const isMobile = window.matchMedia('(max-width: 900px)').matches;
  const columns = document.querySelectorAll('.column');
  const tabButtons = document.querySelectorAll('#mobileTabs button');

  activeTab = tab;

  if (!isMobile) {
    columns.forEach(col => col.classList.add('active'));
    tabButtons.forEach(btn => btn.classList.remove('active'));
    return;
  }

  columns.forEach(col => {
    col.classList.toggle('active', col.dataset.column === tab);
  });

  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

document.querySelectorAll('#mobileTabs button').forEach(btn => {
  btn.addEventListener('click', () => setActiveMobileTab(btn.dataset.tab));
});

window.addEventListener('resize', () => {
  setActiveMobileTab(activeTab || 'todo');
});

function syncFromStorage() {
  const incoming = localStorage.getItem(STORAGE_KEY);
  if (!incoming) return;
  const parsed = migrateState(JSON.parse(incoming));
  if ((parsed.meta?.lastWriteAt || '') === (state.meta?.lastWriteAt || '')) return;
  state = parsed;
  document.getElementById('syncStatus').textContent = `Realtime sync: opdateret ${new Date().toLocaleTimeString('da-DK')}`;
  render();
}

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) syncFromStorage();
});

if (syncChannel) {
  syncChannel.onmessage = () => syncFromStorage();
}

save();
render();
setActiveMobileTab('todo');
checkDeadlineReminders();
