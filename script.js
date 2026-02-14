const STORAGE_KEY = 'kanban-board-v1';

const suggestedTodos = [
  { title: 'Tilføj redigering af kort (rename + beskrivelse)', priority: 'high' },
  { title: 'Tilføj deadlines og vis forsinkede opgaver', priority: 'high' },
  { title: 'Tilføj labels/tags og filter på labels', priority: 'medium' },
  { title: 'Tilføj søgning på tværs af alle kolonner', priority: 'medium' },
  { title: 'Tilføj eksport/import af board-data (JSON)', priority: 'low' }
];

const storedState = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');

let state = storedState || {
  todo: suggestedTodos.map((t) => ({
    id: uid(),
    title: t.title,
    priority: t.priority,
    createdAt: new Date().toLocaleDateString('da-DK')
  })),
  doing: [],
  done: []
};

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function createCard(task, column) {
  const card = document.createElement('article');
  card.className = 'card';
  card.draggable = true;
  card.dataset.id = task.id;
  card.dataset.from = column;

  card.innerHTML = `
    <div>${task.title}</div>
    <div class="meta">
      <span class="badge ${task.priority}">${task.priority}</span>
      <span>${task.createdAt}</span>
    </div>
    <div class="actions"><button data-delete="${task.id}">Slet</button></div>
  `;

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: task.id, from: column }));
  });

  card.querySelector('button').addEventListener('click', () => {
    state[column] = state[column].filter(t => t.id !== task.id);
    save();
    render();
  });

  return card;
}

function render() {
  ['todo', 'doing', 'done'].forEach(column => {
    const zone = document.getElementById(column);
    zone.innerHTML = '';
    state[column].forEach(task => zone.appendChild(createCard(task, column)));
  });
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
  const priorityInput = document.getElementById('priorityInput');
  const title = titleInput.value.trim();
  if (!title) return;

  state.todo.unshift({
    id: uid(),
    title,
    priority: priorityInput.value,
    createdAt: new Date().toLocaleDateString('da-DK')
  });

  titleInput.value = '';
  priorityInput.value = 'medium';
  save();
  render();
});

render();
