// ==========================================
// script.js
// Меню, тест, история прохождений и проверка подозрительных действий
// ==========================================

// ===== НАСТРОЙКА ОТДЕЛЬНОГО ХРАНИЛИЩА ДЛЯ КВИЗА =====
// Для нового квиза меняй только значение 'policy' на своё:
// 'macro', 'policy', 'finance', 'law' и т.д.
const QUIZ_STORAGE_NAMESPACE =
  window.QUIZ_STORAGE_NAMESPACE ||
  document.documentElement?.dataset?.quizStorage ||
  'policy';

const STORAGE_KEYS = {
  HISTORY: `quizHistory_${QUIZ_STORAGE_NAMESPACE}_v1`,
  ACTIVE_SESSION: `quizActiveSession_${QUIZ_STORAGE_NAMESPACE}_v1`,
  TIMER: `quizTimer_${QUIZ_STORAGE_NAMESPACE}_v1`,
  QUESTION_COUNT: `quizQuestionCount_${QUIZ_STORAGE_NAMESPACE}_v1`,
  THEME_FILE: `quizCurrentThemeFile_${QUIZ_STORAGE_NAMESPACE}_v1`,
  USED_QUESTIONS: `quizUsedQuestions_${QUIZ_STORAGE_NAMESPACE}_v1`
};

const HISTORY_KEY = STORAGE_KEYS.HISTORY;
const ACTIVE_SESSION_KEY = STORAGE_KEYS.ACTIVE_SESSION;
const TIMER_KEY = STORAGE_KEYS.TIMER;
const QUESTION_COUNT_KEY = STORAGE_KEYS.QUESTION_COUNT;
const THEME_FILE_KEY = STORAGE_KEYS.THEME_FILE;
const USED_QUESTIONS_KEY = STORAGE_KEYS.USED_QUESTIONS;

// ===== ОПРЕДЕЛЕНИЕ СТРАНИЦЫ =====
const isTestPage = !!document.getElementById('question');
const app = document.getElementById('app');

// ===== ПЕРЕМЕННЫЕ ТЕСТА =====
let timeLimit = 30;
let session = null;
let tests = [];
let timer = null;
let timeLeft = 0;
let selected = null;
let historyUiReady = false;

// ===== HELPERS =====
function getTimerValue() {
  const custom = parseInt(document.getElementById('custom-timer')?.value, 10);
  const preset = parseInt(document.getElementById('preset-timer')?.value, 10);
  return custom || preset || 30;
}

function getQuestionsCount() {
  const custom = parseInt(document.getElementById('custom-count')?.value, 10);
  const preset = parseInt(document.getElementById('preset-count')?.value, 10);
  return custom || preset || 15;
}

function getSelectedTheme() {
  return document.getElementById('theme-select')?.value || 'tests.json';
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDateTimeToMinute(timestamp) {
  const d = new Date(timestamp);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTimeToSecond(timestamp) {
  const d = new Date(timestamp);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getMinuteSeed(timestamp) {
  const d = new Date(timestamp);
  return Number(
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

function formatDuration(totalSeconds) {
  const sec = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeQuestionKeyPart(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function getQuestionKey(question, fallbackIndex = 0) {
  if (question && question.id !== undefined && question.id !== null && question.id !== '') {
    return `id:${String(question.id)}`;
  }

  const normalizedQuestion = normalizeQuestionKeyPart(question?.question);
  const normalizedOptions = Array.isArray(question?.options)
    ? question.options.map(normalizeQuestionKeyPart).join('||')
    : '';
  const answerIndex = Number.isInteger(Number(question?.answer)) ? Number(question.answer) : '';

  return `q:${normalizedQuestion}::o:${normalizedOptions}::a:${answerIndex}::f:${fallbackIndex}`;
}

function dedupeQuestions(items) {
  const unique = [];
  const seen = new Set();

  (Array.isArray(items) ? items : []).forEach((question, index) => {
    const key = getQuestionKey(question, index);
    if (seen.has(key)) return;
    seen.add(key);
    unique.push({ ...question, __questionKey: key });
  });

  return unique;
}

function getUsedQuestionsState() {
  try {
    const raw = localStorage.getItem(USED_QUESTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveUsedQuestionsState(state) {
  localStorage.setItem(USED_QUESTIONS_KEY, JSON.stringify(state || {}));
}

function selectRandomQuestions(sourceQuestions, requestedCount, themeFile) {
  const uniqueQuestions = dedupeQuestions(sourceQuestions);
  const totalAvailable = uniqueQuestions.length;
  const totalNeeded = Math.min(Math.max(1, requestedCount || 1), totalAvailable || 0);

  if (!totalAvailable || !totalNeeded) return [];

  const usedState = getUsedQuestionsState();
  const usedForTheme = Array.isArray(usedState[themeFile]) ? usedState[themeFile] : [];
  const usedSet = new Set(usedForTheme);

  const unusedQuestions = uniqueQuestions.filter(q => !usedSet.has(q.__questionKey));
  const picked = [];

  picked.push(...shuffleArray(unusedQuestions).slice(0, totalNeeded));

  let nextUsed;

  if (picked.length < totalNeeded) {
    const pickedKeys = new Set(picked.map(q => q.__questionKey));
    const refillPool = uniqueQuestions.filter(q => !pickedKeys.has(q.__questionKey));
    picked.push(...shuffleArray(refillPool).slice(0, totalNeeded - picked.length));
    nextUsed = picked.map(q => q.__questionKey);
  } else {
    nextUsed = [...new Set([...usedForTheme, ...picked.map(q => q.__questionKey)])];
  }

  usedState[themeFile] = nextUsed;
  saveUsedQuestionsState(usedState);

  return picked.map(({ __questionKey, ...question }) => question);
}

function getThemeLabel(fileName) {
  const map = {
    'iqtisodiy_siyosat_tests_part_1.json': 'Вопросы 1-50',
    'iqtisodiy_siyosat_tests_part_2.json': 'Вопросы 51-100',
    'iqtisodiy_siyosat_tests_part_3.json': 'Вопросы 101-150',
    'iqtisodiy_siyosat_tests_part_4.json': 'Вопросы 151-200',
    'iqtisodiy_siyosat_tests_part_5.json': 'Вопросы 201-250',
    'iqtisodiy_siyosat_tests_part_6.json': 'Вопросы 251-304',
    'tests.json': 'Все вопросы (Микс)'
  };
  return map[fileName] || fileName || 'Неизвестная тема';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function generateHistoryId(timestamp) {
  const history = getHistory();
  const minuteSeed = getMinuteSeed(timestamp);
  const sameMinuteCount = history.filter(item => item.minuteSeed === minuteSeed).length + 1;

  const partA = (minuteSeed * 37 + 73) % 100000000;
  const partB = ((minuteSeed % 1000000) * (sameMinuteCount + 11) + 97) % 1000000;
  const digitSum = String(minuteSeed)
    .split('')
    .reduce((sum, digit) => sum + Number(digit), 0);
  const checksum = (digitSum * 19 + sameMinuteCount * 7 + (partA % 97)) % 1000;

  return `H-${String(partA).padStart(8, '0')}-${String(partB).padStart(6, '0')}-${String(checksum).padStart(3, '0')}`;
}

function downloadTextFile(fileName, content, mimeType = 'application/json;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function initHistoryUi() {
  if (historyUiReady) return;
  historyUiReady = true;

  const button = document.createElement('button');
  button.id = 'history-toggle';
  button.className = 'history-toggle';
  button.textContent = 'История';

  const modal = document.createElement('div');
  modal.id = 'history-modal';
  modal.className = 'history-modal hidden';
  modal.innerHTML = `
    <div class="history-panel">
      <div class="history-panel-header">
        <div>
          <div class="history-title">История прохождений</div>
          <div class="history-subtitle">Дата, длительность, счёт, ID и подробные ответы</div>
        </div>
        <button id="history-close" class="history-close" aria-label="Закрыть">×</button>
      </div>
      <div id="history-list" class="history-list"></div>
    </div>
  `;

  document.body.appendChild(button);
  document.body.appendChild(modal);

  button.addEventListener('click', openHistoryModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeHistoryModal();
  });
  modal.querySelector('#history-close')?.addEventListener('click', closeHistoryModal);

  const historyList = modal.querySelector('#history-list');
  historyList?.addEventListener('click', (event) => {
    const target = event.target.closest('button[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const id = target.dataset.id;

    if (action === 'toggle') toggleHistoryDetails(id);
    if (action === 'delete') deleteHistoryEntry(id);
    if (action === 'download') downloadHistoryEntry(id);
  });
}

function openHistoryModal() {
  renderHistoryList();
  document.getElementById('history-modal')?.classList.remove('hidden');
}

function closeHistoryModal() {
  document.getElementById('history-modal')?.classList.add('hidden');
}

function toggleHistoryDetails(id) {
  const details = document.querySelector(`.history-details[data-id="${CSS.escape(id)}"]`);
  const actionBtn = document.querySelector(`button[data-action="toggle"][data-id="${CSS.escape(id)}"]`);
  if (!details || !actionBtn) return;

  details.classList.toggle('hidden');
  actionBtn.textContent = details.classList.contains('hidden') ? 'Открыть' : 'Скрыть';
}

function deleteHistoryEntry(id) {
  const history = getHistory();
  const nextHistory = history.filter(item => item.id !== id);
  saveHistory(nextHistory);
  renderHistoryList();
}

function downloadHistoryEntry(id) {
  const history = getHistory();
  const entry = history.find(item => item.id === id);
  if (!entry) return;

  downloadTextFile(
    `history-${QUIZ_STORAGE_NAMESPACE}-${entry.id}.json`,
    JSON.stringify(entry, null, 2)
  );
}

function renderHistoryList() {
  const container = document.getElementById('history-list');
  if (!container) return;

  const history = getHistory().sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));

  if (!history.length) {
    container.innerHTML = `
      <div class="history-empty">
        История пока пустая. После завершения теста здесь появятся все попытки.
      </div>
    `;
    return;
  }

  container.innerHTML = history.map(entry => {
    const suspiciousCount = entry.cheatLog?.length || 0;
    const detailsHtml = (entry.answers || []).map((answer, index) => {
      const selectedText = answer.timeout
        ? 'Не выбрано — время вышло'
        : (answer.selectedText ?? 'Не выбрано');
      const statusText = answer.timeout
        ? 'Время вышло'
        : answer.isCorrect
          ? 'Правильно'
          : 'Неправильно';
      const statusClass = answer.timeout ? 'timeout' : (answer.isCorrect ? 'ok' : 'bad');

      return `
        <div class="answer-card">
          <div class="answer-card-top">
            <span class="answer-number">${index + 1}</span>
            <span class="answer-status ${statusClass}">${statusText}</span>
          </div>
          <div class="answer-question">${escapeHtml(answer.question)}</div>
          <div class="answer-line"><b>Выбрано:</b> ${escapeHtml(selectedText)}</div>
          <div class="answer-line"><b>Правильный:</b> ${escapeHtml(answer.correctText ?? '—')}</div>
        </div>
      `;
    }).join('');

    const cheatHtml = suspiciousCount
      ? `
        <div class="cheat-log">
          <div class="cheat-log-title">Подозрительные действия</div>
          ${(entry.cheatLog || []).map(log => `
            <div class="cheat-log-item">${escapeHtml(log.label)} — ${escapeHtml(log.atLabel)}</div>
          `).join('')}
        </div>
      `
      : `<div class="cheat-log clean">Подозрительных действий не обнаружено</div>`;

    return `
      <div class="history-item">
        <div class="history-item-head">
          <div class="history-summary">
            <div class="history-id">${escapeHtml(entry.id)}</div>
            <div class="history-meta">
              <span>📅 ${escapeHtml(entry.finishedAtLabel || formatDateTimeToMinute(entry.finishedAt))}</span>
              <span>⏳ ${escapeHtml(entry.durationLabel || formatDuration(entry.durationSeconds))}</span>
              <span>✅ ${entry.score}/${entry.totalQuestions}</span>
              <span>📚 ${escapeHtml(entry.themeLabel || getThemeLabel(entry.themeFile))}</span>
              <span>⚠️ ${suspiciousCount}</span>
            </div>
          </div>
          <div class="history-actions">
            <button data-action="toggle" data-id="${escapeHtml(entry.id)}">Открыть</button>
            <button data-action="download" data-id="${escapeHtml(entry.id)}">Скачать</button>
            <button data-action="delete" data-id="${escapeHtml(entry.id)}" class="danger">Удалить</button>
          </div>
        </div>
        <div class="history-details hidden" data-id="${escapeHtml(entry.id)}">
          <div class="history-detail-grid">
            <div><b>ID теста:</b> ${escapeHtml(entry.id)}</div>
            <div><b>Начало:</b> ${escapeHtml(entry.startedAtLabel || formatDateTimeToMinute(entry.startedAt))}</div>
            <div><b>Окончание:</b> ${escapeHtml(entry.finishedAtLabel || formatDateTimeToMinute(entry.finishedAt))}</div>
            <div><b>Всего вопросов:</b> ${entry.totalQuestions}</div>
          </div>
          ${cheatHtml}
          <div class="answers-list">${detailsHtml}</div>
        </div>
      </div>
    `;
  }).join('');
}

function logCheatEvent(type, label) {
  if (!isTestPage || !session || session.review || session.finished) return;
  session.cheatLog = session.cheatLog || [];

  const now = Date.now();
  const last = session.cheatLog[session.cheatLog.length - 1];
  if (last && last.type === type && now - last.at < 1500) return;

  session.cheatLog.push({
    type,
    label,
    at: now,
    atLabel: formatDateTimeToSecond(now)
  });

  saveActiveSessionSnapshot();
}

function saveActiveSessionSnapshot() {
  if (!session) return;
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
      id: session.id,
      startedAt: session.start,
      index: session.index,
      score: session.score,
      cheatLog: session.cheatLog || []
    }));
  } catch {
    // ничего
  }
}

function clearActiveSessionSnapshot() {
  localStorage.removeItem(ACTIVE_SESSION_KEY);
}

function persistFinishedSession() {
  if (!session || session.saved) return;

  const finishedAt = Date.now();
  const totalQuestions = tests.length;
  const durationSeconds = Math.max(1, Math.round((finishedAt - session.start) / 1000));
  const historyId = generateHistoryId(session.start);

  const entry = {
    id: historyId,
    minuteSeed: getMinuteSeed(session.start),
    startedAt: session.start,
    startedAtLabel: formatDateTimeToMinute(session.start),
    finishedAt,
    finishedAtLabel: formatDateTimeToMinute(finishedAt),
    durationSeconds,
    durationLabel: formatDuration(durationSeconds),
    score: session.score,
    totalQuestions,
    themeFile: session.themeFile,
    themeLabel: getThemeLabel(session.themeFile),
    cheatLog: session.cheatLog || [],
    answers: tests.map((question, index) => {
      const answerState = session.answers[index] || {};
      const selectedIndex = Number.isInteger(answerState.selected) ? answerState.selected : null;
      const correctIndex = question.answer;
      const timeout = !!answerState.timeout;
      return {
        questionIndex: index + 1,
        question: question.question,
        selectedIndex,
        selectedText: selectedIndex !== null ? question.options[selectedIndex] : null,
        correctIndex,
        correctText: question.options[correctIndex],
        isCorrect: !timeout && selectedIndex === correctIndex,
        timeout,
        options: [...question.options]
      };
    })
  };

  const history = getHistory();
  history.push(entry);
  saveHistory(history);

  session.saved = true;
  session.finished = true;
  session.id = historyId;
  clearActiveSessionSnapshot();
}

function attachSuspiciousActivityTracking() {
  if (!isTestPage) return;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      logCheatEvent('visibility_hidden', 'Скрытие вкладки / переход в другое приложение');
    }
  });

  window.addEventListener('blur', () => {
    logCheatEvent('window_blur', 'Потеря фокуса окна');
  });

  window.addEventListener('beforeunload', () => {
    if (!session || session.review || session.finished) return;
    logCheatEvent('before_unload', 'Попытка покинуть страницу во время теста');
  });
}

// ==========================================
// ИНИЦИАЛИЗАЦИЯ
// ==========================================
initHistoryUi();

if (!isTestPage && app) {
  renderMenu();
}

if (isTestPage) {
  attachSuspiciousActivityTracking();
  startTest();
}

// ==========================================
// ЛОГИКА ДЛЯ МЕНЮ (INDEX.HTML)
// ==========================================
function renderMenu() {
  app.innerHTML = `
<div class="card">
    <div class="author">Created by Sayfiddinov</div>
    <h2>Добро пожаловать 👋</h2>
    <p><b>Экономическая политика</b></p>

    <label>📚 Выберите тему</label>
    <div class="row">
        <select id="theme-select">
            <option value="iqtisodiy_siyosat_tests_part_1.json">Вопросы 1-50</option>
            <option value="iqtisodiy_siyosat_tests_part_2.json">Вопросы 51-100</option>
            <option value="iqtisodiy_siyosat_tests_part_3.json">Вопросы 101-150</option>
            <option value="iqtisodiy_siyosat_tests_part_4.json">Вопросы 151-200</option>
            <option value="iqtisodiy_siyosat_tests_part_5.json">Вопросы 201-250</option>
            <option value="iqtisodiy_siyosat_tests_part_6.json">Вопросы 251-304</option>
            <option value="tests.json" selected>Все вопросы (Микс)</option>
        </select>
    </div>

    <label>⏱ Время на вопрос (сек)</label>
    <div class="row">
        <select id="preset-timer">
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="30" selected>30</option>
            <option value="60">60</option>
        </select>
        <input id="custom-timer" type="number" min="5" placeholder="своё">
    </div>

    <label>📝 Количество вопросов</label>
    <div class="row">
        <select id="preset-count">
            <option value="1000000000" selected>Все вопросы</option>
            <option value="15">15</option>
            <option value="25">25</option>
            <option value="30">30</option>
            <option value="35">35</option>
            <option value="50">50</option>
        </select>
        <input id="custom-count" type="number" min="1" placeholder="своё">
    </div>

    <button class="main" id="startBtn">Начать тест</button>
</div>`;

  document.getElementById('startBtn').onclick = () => {
    localStorage.setItem(TIMER_KEY, getTimerValue());
    localStorage.setItem(QUESTION_COUNT_KEY, getQuestionsCount());
    localStorage.setItem(THEME_FILE_KEY, getSelectedTheme());
    window.location.href = 'test.html';
  };
}

// ==========================================
// ЛОГИКА ДЛЯ ТЕСТА (TEST.HTML)
// ==========================================
function startTest() {
  timeLimit = parseInt(localStorage.getItem(TIMER_KEY), 10) || 30;
  const countLimit = parseInt(localStorage.getItem(QUESTION_COUNT_KEY), 10) || 15;
  const themeFile = localStorage.getItem(THEME_FILE_KEY) || 'tests.json';

  session = {
    id: null,
    start: Date.now(),
    index: 0,
    score: 0,
    review: false,
    finished: false,
    saved: false,
    themeFile,
    answers: [],
    cheatLog: []
  };

  saveActiveSessionSnapshot();

  fetch(themeFile)
    .then(r => {
      if (!r.ok) throw new Error('Файл темы не найден');
      return r.json();
    })
    .then(data => {
      const selectedQuestions = selectRandomQuestions(data, countLimit, themeFile);

      tests = selectedQuestions.map(q => {
        const originalAnswerIndex = Number(q.answer);
        const correctText = q.options[originalAnswerIndex];
        const shuffledOptions = shuffleArray(q.options);
        const newAnswerIndex = shuffledOptions.indexOf(correctText);
        return { ...q, options: shuffledOptions, answer: newAnswerIndex };
      });

      showQuestion();
    })
    .catch(err => {
      alert('Ошибка загрузки теста: ' + err.message);
      window.location.href = 'index.html';
    });
}

function showQuestion() {
  clearInterval(timer);
  selected = null;

  const q = tests[session.index];
  if (!q) return finish();

  const state = session.answers[session.index] || { selected: null, answered: false, timeout: false };
  selected = state.selected;

  const qContainer = document.getElementById('question');
  const optionsEl = document.getElementById('options');

  if (!qContainer || !optionsEl) return;

  qContainer.innerHTML = `
    <div class="progress">
      ${session.review ? `Просмотр ${session.index + 1} / ${tests.length}` : `Вопрос ${session.index + 1} из ${tests.length}`}
    </div>
    <div>${escapeHtml(q.question)}</div>
  `;

  optionsEl.innerHTML = '';
  let confirmBtn = null;

  q.options.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.className = 'option';
    btn.textContent = text;

    if (state.answered || state.timeout || session.review) {
      btn.disabled = true;
      if (i === q.answer) btn.classList.add('correct');
      if (state.selected !== null && i === state.selected && i !== q.answer) btn.classList.add('wrong');
    } else {
      btn.onclick = () => {
        selected = i;
        optionsEl.querySelectorAll('.option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        if (confirmBtn) confirmBtn.disabled = false;
      };
      if (i === selected) btn.classList.add('selected');
    }

    optionsEl.appendChild(btn);
  });

  if (!state.answered && !state.timeout && !session.review) {
    confirmBtn = document.createElement('button');
    confirmBtn.className = 'main';
    confirmBtn.textContent = 'Ответить';
    confirmBtn.disabled = selected === null;
    confirmBtn.onclick = () => confirmAnswer(false);
    optionsEl.appendChild(confirmBtn);
    startTimer();
  } else {
    const t = document.getElementById('timer');
    if (t) t.textContent = session.review ? '📋 Режим просмотра' : '⏱ Ответ зафиксирован';
  }

  renderNavButtons();
}

function startTimer() {
  timeLeft = timeLimit;
  const t = document.getElementById('timer');
  if (!t) return;

  t.textContent = `⏱ ${timeLeft}`;
  t.className = 'timer';
  t.classList.remove('warning');

  timer = setInterval(() => {
    timeLeft--;
    t.textContent = `⏱ ${timeLeft}`;
    if (timeLeft <= 5) t.classList.add('warning');
    if (timeLeft <= 0) {
      clearInterval(timer);
      confirmAnswer(true);
    }
  }, 1000);
}

function confirmAnswer(fromTimer) {
  clearInterval(timer);
  const q = tests[session.index];

  session.answers[session.index] = {
    selected: fromTimer ? null : selected,
    answered: !fromTimer,
    timeout: fromTimer
  };

  if (!fromTimer && selected === q.answer) session.score++;
  saveActiveSessionSnapshot();
  showQuestion();
}

function renderNavButtons() {
  const optionsEl = document.getElementById('options');
  let nav = document.querySelector('.nav-buttons');

  if (!nav) {
    nav = document.createElement('div');
    nav.className = 'nav-buttons';
    optionsEl.appendChild(nav);
  }

  nav.innerHTML = '';
  const state = session.answers[session.index];
  const isLast = session.index === tests.length - 1;

  if (session.index > 0 && (state?.answered || state?.timeout || session.review)) {
    const prev = document.createElement('button');
    prev.textContent = '←';
    prev.onclick = () => {
      session.index--;
      showQuestion();
    };
    nav.appendChild(prev);
  }

  if (state && !isLast) {
    const next = document.createElement('button');
    next.textContent = '→';
    next.onclick = () => {
      session.index++;
      showQuestion();
    };
    nav.appendChild(next);
  }

  if (state && isLast && !session.review) {
    const finishBtn = document.createElement('button');
    finishBtn.className = 'main';
    finishBtn.textContent = 'Завершить тест';
    finishBtn.onclick = finish;
    nav.appendChild(finishBtn);
  }
}

function finish() {
  clearInterval(timer);
  persistFinishedSession();

  const card = document.querySelector('.card');
  if (!card) return;

  card.innerHTML = `
    <h2>Тест завершён</h2>
    <p>👤 Гость</p>
    <p>🆔 ${escapeHtml(session.id || '—')}</p>
    <p>📅 ${escapeHtml(formatDateTimeToMinute(Date.now()))}</p>
    <p>✅ ${session.score}/${tests.length}</p>
    <button class="main" onclick="startReview()">📋 Просмотреть ответы</button>
    <button class="main" onclick="openHistoryModal()">🕘 Открыть историю</button>
    <button class="main" onclick="window.location.href='index.html'">🏠 В главное меню</button>
  `;
}

function startReview() {
  session.review = true;
  session.index = 0;

  const card = document.querySelector('.card');
  if (!card) return;

  card.innerHTML = `<div id="timer"></div><div id="question"></div><div id="options"></div>`;
  showQuestion();
}
