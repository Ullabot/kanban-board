const STORAGE_KEY = 'kanban-board-v2';

const suggestedTodos = [
  {
    title: 'Tilføj redigering af kort (rename + beskrivelse)',
    priority: 'high',
    label: 'ux',
    description: 'Rediger titel, beskrivelse, label og deadline direkte fra kortet.'
  },
  {
    title: 'Tilføj deadlines og vis forsinkede opgaver',
    priority: 'high',
    label: 'planning',
    description: 'Vis deadline på kort og marker forsinkede opgaver.'
  },
  {
    title: 'Tilføj labels/tags og filter på labels',
    priority: 'medium',
    label: 'organization',
    description: 'Sæt labels på opgaver og filtrer boardet efter label.'
  },
  {
    title: 'Tilføj søgning på tværs af alle kolonner',
    priority: 'medium',
    label: 'search',
    description: 'Søg på titel, label og beskrivelse på tværs af boardet.'
  },
  {
    title: 'Tilføj eksport/import af board-data (JSON)',
    priority: 'low',
    label: 'backup',
    description: 'Eksportér board-data til JSON og importer igen ved behov.'
  }
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function seedState() {
  const solved = suggestedTodos.map((t, i) => ({
    id: uid(),
    title: t.title,
    description: t.description,
    label: t.label,
    priority: t.priority,
    deadline: i < 2 ? todayISO() : '',
    createdAt: new Date().toLocaleDateString('da-DK')
  }));

  return {
    todo: [],
    doing: [],
    done: solved
  };
}

let state = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || seedState();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isOverdue(deadline) {
  if (!deadline) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deadline + 'T00:00:00');
  return d < today;
}

function taskVisible(task) {
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const labelFilter = document.getElementById('filterLabelInput').value.trim().toLowerCase();

  const haystack = `${task.title} ${task.description || ''} ${task.label || ''}`.toLowerCase();
  const searchOk = !search || haystack.includes(search);
  const labelOk = !labelFilter || (task.label || '').toLowerCase().includes(labelFilter);
  return searchOk && labelOk;
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
      <button data-edit="${task.id}">Redigér</button>
      <button data-delete="${task.id}">Slet</button>
    </div>
  `;

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: task.id, from: column }));
  });

  card.querySelector('[data-delete]').addEventListener('click', () => {
    state[column] = state[column].filter(t => t.id !== task.id);
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

    task.title = trimmedTitle;
    task.description = (newDescription || '').trim();
    task.label = (newLabel || '').trim();
    task.deadline = (newDeadline || '').trim();
    save();
    render();
  });

  return card;
}

function renderColumn(column) {
  const zone = document.getElementById(column);
  zone.innerHTML = '';

  const visibleTasks = state[column].filter(taskVisible);
  if (visibleTasks.length === 0) {
    zone.innerHTML = '<div class="empty-note">Ingen opgaver matcher filteret.</div>';
    return;
  }

  visibleTasks.forEach(task => zone.appendChild(createCard(task, column)));
}

function render() {
  ['todo', 'doing', 'done'].forEach(renderColumn);
}

['todo', 'doing', 'done'].forEach(column => {
  const zone = document.getElementById(column);
  zone.addEventListener('dragover', (e) => e.preventDefault());
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
    const task = state[data.from].find(t => t.id === data.id);
    if (!task) return;

    state[data.from] = state[data.from].filter(t => t.id !== data.id);
    state[column].unshift(task);
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

  state.todo.unshift({
    id: uid(),
    title,
    description: '',
    label: labelInput.value.trim(),
    priority: priorityInput.value,
    deadline: deadlineInput.value,
    createdAt: new Date().toLocaleDateString('da-DK')
  });

  titleInput.value = '';
  labelInput.value = '';
  priorityInput.value = 'medium';
  deadlineInput.value = '';
  save();
  render();
});

document.getElementById('searchInput').addEventListener('input', render);
document.getElementById('filterLabelInput').addEventListener('input', render);

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
    const parsed = JSON.parse(text);
    if (!parsed.todo || !parsed.doing || !parsed.done) throw new Error('Ugyldigt format');
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
  if (!confirm('Nulstil board til demo-opgaver?')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = seedState();
  save();
  render();
});

function setActiveMobileTab(tab) {
  const isMobile = window.matchMedia('(max-width: 900px)').matches;
  const columns = document.querySelectorAll('.column');
  const tabButtons = document.querySelectorAll('#mobileTabs button');

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
  const activeBtn = document.querySelector('#mobileTabs button.active');
  setActiveMobileTab(activeBtn ? activeBtn.dataset.tab : 'todo');
});

save();
render();
setActiveMobileTab('todo');
