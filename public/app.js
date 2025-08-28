// Komi Ai - Frontend-only MVP
// Features: login/guest, history, STT, TTS, feedback, copy, rotating suggestions, local persistence

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = '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';
const APP_NAME = 'Komi Ai';

// Storage keys
const STORAGE = {
  currentUserId: 'komi.currentUserId',
  users: 'komi.users',
  conversations: (userId) => `komi.conversations.${userId}`,
  settings: 'komi.settings',
};

// Suggestion seeds
const SUGGESTIONS = [
  'Write a study plan for learning Python in 4 weeks',
  'Summarize this URL and extract key takeaways',
  'Draft a professional email requesting a meeting',
  'Explain this code and propose improvements',
  'Create a workout plan for beginners at home',
  'Help me practice an interview for frontend developer',
  'Generate a meal plan with 120g protein per day',
  'Brainstorm 10 startup ideas around education',
  'Translate and simplify: 我想学英语应该从哪里开始？',
  'Design a database schema for a todo app',
  'What are 3 weekend trip ideas near my city?',
  'Create a concise resume bullet for this achievement',
];

// --- Utilities ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const uuid = () => crypto.randomUUID();

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function nowIso() { return new Date().toISOString(); }

function pickSuggestions(n = 3) {
  const pool = [...SUGGESTIONS];
  const picks = [];
  while (picks.length < n && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(i, 1)[0]);
  }
  return picks;
}

// --- State ---
let state = {
  user: null,
  conversations: [],
  activeConversationId: null,
  ttsEnabled: false,
  recognition: null,
};

// --- Auth ---
function initAuth() {
  const currentUserId = localStorage.getItem(STORAGE.currentUserId);
  const users = loadJson(STORAGE.users, {});
  if (currentUserId && users[currentUserId]) {
    state.user = users[currentUserId];
    $('#user-label').textContent = state.user.name;
    $('#login-overlay').classList.add('hidden');
  } else {
    $('#login-overlay').classList.remove('hidden');
  }

  $('#continue-guest').onclick = () => loginGuest();
  $('#continue-name').onclick = () => {
    const name = $('#login-name').value.trim();
    if (!name) return alert('Please enter a name or continue as Guest');
    loginNamed(name);
  };
  $('#logout').onclick = logout;
}

function loginGuest() {
  const id = `guest-${uuid()}`;
  const user = { id, name: 'Guest', createdAt: nowIso() };
  persistUser(user);
}
function loginNamed(name) {
  const id = `user-${uuid()}`;
  const user = { id, name, createdAt: nowIso() };
  persistUser(user);
}
function persistUser(user) {
  const users = loadJson(STORAGE.users, {});
  users[user.id] = user;
  saveJson(STORAGE.users, users);
  localStorage.setItem(STORAGE.currentUserId, user.id);
  state.user = user;
  $('#user-label').textContent = user.name;
  $('#login-overlay').classList.add('hidden');
  loadConversations();
  ensureFirstConversation();
}
function logout() {
  localStorage.removeItem(STORAGE.currentUserId);
  state.user = null;
  state.conversations = [];
  state.activeConversationId = null;
  $('#history').innerHTML = '';
  $('#messages').innerHTML = '';
  $('#login-overlay').classList.remove('hidden');
}

// --- Conversations ---
function loadConversations() {
  if (!state.user) return;
  state.conversations = loadJson(STORAGE.conversations(state.user.id), []);
  renderHistory();
}
function saveConversations() {
  if (!state.user) return;
  saveJson(STORAGE.conversations(state.user.id), state.conversations);
}
function ensureFirstConversation() {
  if (!state.activeConversationId) {
    startNewConversation();
  }
}
function startNewConversation(seedText) {
  const id = uuid();
  const convo = {
    id,
    title: 'New chat',
    createdAt: nowIso(),
    messages: [],
    suggestions: pickSuggestions(),
  };
  state.conversations.unshift(convo);
  state.activeConversationId = id;
  saveConversations();
  renderHistory();
  renderSuggestions();
  $('#messages').innerHTML = '';
  if (seedText) {
    $('#input').value = seedText;
    sendCurrent();
  }
}
function getActiveConversation() {
  return state.conversations.find(c => c.id === state.activeConversationId);
}

// --- Rendering ---
function renderHistory() {
  const el = $('#history');
  el.innerHTML = '';
  for (const c of state.conversations) {
    const item = document.createElement('div');
    item.className = 'item' + (c.id === state.activeConversationId ? ' active' : '');
    item.textContent = c.title || 'Untitled';
    item.onclick = () => {
      state.activeConversationId = c.id;
      renderHistory();
      renderMessages();
      renderSuggestions();
    };
    el.appendChild(item);
  }
}
function renderSuggestions() {
  const convo = getActiveConversation();
  const el = $('#suggestions');
  el.innerHTML = '';
  if (!convo) return;
  for (const s of convo.suggestions) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = s;
    chip.onclick = () => startNewConversation(s);
    el.appendChild(chip);
  }
}
function renderMessages() {
  const convo = getActiveConversation();
  const messagesEl = $('#messages');
  messagesEl.innerHTML = '';
  if (!convo) return;
  for (const m of convo.messages) {
    appendMessageElement(m);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendMessageElement(message) {
  const tpl = document.getElementById('message-template');
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.classList.add(message.role);
  node.dataset.id = message.id;
  node.querySelector('.bubble').textContent = message.content;
  node.querySelector('.copy').onclick = () => navigator.clipboard.writeText(message.content);
  node.querySelector('.up').onclick = () => setFeedback(message.id, 'up');
  node.querySelector('.down').onclick = () => setFeedback(message.id, 'down');
  $('#messages').appendChild(node);
}

function setFeedback(messageId, value) {
  const convo = getActiveConversation();
  if (!convo) return;
  const msg = convo.messages.find(m => m.id === messageId);
  if (!msg) return;
  msg.feedback = value; // 'up' | 'down'
  saveConversations();
}

// --- TTS ---
function speak(text) {
  if (!state.ttsEnabled || !('speechSynthesis' in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.0;
  utter.pitch = 1.0;
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

// --- STT ---
function toggleMic() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return alert('Speech recognition not supported in this browser');
  if (state.recognition) {
    state.recognition.stop();
    state.recognition = null;
    $('#mic').textContent = '🎤';
    return;
  }
  const rec = new SpeechRecognition();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = true;
  rec.onresult = (e) => {
    let text = '';
    for (const res of e.results) text += res[0].transcript;
    $('#input').value = text;
  };
  rec.onend = () => { state.recognition = null; $('#mic').textContent = '🎤'; };
  rec.onerror = () => { state.recognition = null; $('#mic').textContent = '🎤'; };
  state.recognition = rec;
  rec.start();
  $('#mic').textContent = '⏹️';
}

// --- Chat ---
async function callKomi(messages) {
  // Fallback to a simple echo if request fails
  try {
    const res = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': APP_NAME,
        'HTTP-Referer': location.origin || 'http://localhost',
      },
      body: JSON.stringify({
        model: 'openrouter/auto',
        messages,
        temperature: 0.7,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a reply.';
    return content;
  } catch (err) {
    console.warn('OpenRouter error, falling back to local response:', err);
    return 'I could not reach the model just now. Here is a local response: I am Komi Ai. Please try again in a moment.';
  }
}

async function sendCurrent() {
  const text = $('#input').value.trim();
  if (!text) return;
  $('#input').value = '';
  const convo = getActiveConversation();
  if (!convo) return;

  const userMsg = { id: uuid(), role: 'user', content: text, createdAt: nowIso() };
  convo.messages.push(userMsg);
  if (convo.title === 'New chat') convo.title = text.slice(0, 40);
  saveConversations();
  appendMessageElement(userMsg);

  const context = [
    { role: 'system', content: 'You are Komi Ai, a helpful and concise assistant.' },
    ...convo.messages.map(m => ({ role: m.role, content: m.content })),
  ];

  const assistantText = await callKomi(context);
  const aiMsg = { id: uuid(), role: 'assistant', content: assistantText, createdAt: nowIso() };
  convo.messages.push(aiMsg);
  saveConversations();
  appendMessageElement(aiMsg);
  $('#messages').scrollTop = $('#messages').scrollHeight;
  speak(assistantText);
}

// --- Events ---
function initUI() {
  $('#new-chat').onclick = () => startNewConversation();
  $('#send').onclick = sendCurrent;
  $('#input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrent(); }
  });
  $('#mic').onclick = toggleMic;
  $('#tts-toggle').onclick = () => {
    state.ttsEnabled = !state.ttsEnabled;
    $('#tts-toggle').textContent = state.ttsEnabled ? '🔈' : '🔊';
    const settings = loadJson(STORAGE.settings, {});
    settings.ttsEnabled = state.ttsEnabled;
    saveJson(STORAGE.settings, settings);
  };

  const settings = loadJson(STORAGE.settings, {});
  state.ttsEnabled = Boolean(settings.ttsEnabled);
  $('#tts-toggle').textContent = state.ttsEnabled ? '🔈' : '🔊';
}

// --- Boot ---
function boot() {
  initAuth();
  initUI();
  if (state.user) {
    loadConversations();
    ensureFirstConversation();
    renderMessages();
    renderSuggestions();
  }
}

boot();

