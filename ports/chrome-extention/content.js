const PANEL_URL = 'https://canvas.nishantmakwana.tech/?embedded=chrome-extension';
const ROOT_ID = 'cnvs-ext-root';
const HANDLE_ID = 'cnvs-ext-handle';
const FRAME_ID = 'cnvs-ext-frame';
const HINT_ID = 'cnvs-ext-focus-hint';
const STORAGE_KEY = 'cnvsExtensionPanelState';
const DEFAULT_WIDTH = 460;
const MIN_WIDTH = 340;
const MAX_WIDTH = 900;

let panelOpen = false;
let panelWidth = DEFAULT_WIDTH;

function isInjectablePage() {
  return /^https?:/i.test(window.location.protocol);
}

function clampWidth(value) {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(value)));
}

async function readState() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const state = result?.[STORAGE_KEY];
    if (!state || typeof state !== 'object') return;
    if (typeof state.open === 'boolean') panelOpen = state.open;
    if (typeof state.width === 'number') panelWidth = clampWidth(state.width);
  } catch {
    // Ignore storage failures.
  }
}

async function writeState() {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        open: panelOpen,
        width: panelWidth,
      },
    });
  } catch {
    // Ignore storage failures.
  }
}

function applyLayoutState() {
  const root = document.getElementById(ROOT_ID);
  if (root) {
    root.style.width = `${panelWidth}px`;
  }
  document.documentElement.style.setProperty('--cnvs-ext-width', `${panelWidth}px`);
  document.documentElement.classList.toggle('cnvs-ext-open', panelOpen);
}

function unmountPanel() {
  const root = document.getElementById(ROOT_ID);
  if (root) root.remove();
  panelOpen = false;
  applyLayoutState();
}

function mountPanel() {
  if (!isInjectablePage()) return;
  if (document.getElementById(ROOT_ID)) {
    panelOpen = true;
    applyLayoutState();
    return;
  }

  const root = document.createElement('div');
  root.id = ROOT_ID;

  const handle = document.createElement('div');
  handle.id = HANDLE_ID;
  root.appendChild(handle);

  const hint = document.createElement('div');
  hint.id = HINT_ID;
  hint.textContent = 'Click panel to focus CNVS shortcuts';
  root.appendChild(hint);

  const frame = document.createElement('iframe');
  frame.id = FRAME_ID;
  frame.src = PANEL_URL;
  frame.allow = 'clipboard-read; clipboard-write';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.title = 'CNVS Side Panel';
  root.appendChild(frame);

  root.addEventListener('pointerdown', () => {
    hint.style.display = 'none';
    try {
      frame.contentWindow?.focus();
    } catch {
      frame.focus();
    }
  });

  let dragStartX = 0;
  let dragStartWidth = panelWidth;
  let resizing = false;

  const onMove = (event) => {
    if (!resizing) return;
    const dx = dragStartX - event.clientX;
    panelWidth = clampWidth(dragStartWidth + dx);
    applyLayoutState();
  };

  const onUp = () => {
    if (!resizing) return;
    resizing = false;
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    void writeState();
  };

  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    resizing = true;
    dragStartX = event.clientX;
    dragStartWidth = panelWidth;
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
  });

  document.documentElement.appendChild(root);
  panelOpen = true;
  applyLayoutState();
}

function setOpen(nextOpen) {
  if (nextOpen) {
    mountPanel();
  } else {
    unmountPanel();
  }
  void writeState();
}

function togglePanel() {
  setOpen(!panelOpen);
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'CNVS_TOGGLE_PANEL') {
    togglePanel();
    return;
  }
  if (message.type === 'CNVS_SET_PANEL_OPEN' && typeof message.open === 'boolean') {
    setOpen(message.open);
    return;
  }
  if (message.type === 'CNVS_SET_PANEL_WIDTH' && typeof message.width === 'number') {
    panelWidth = clampWidth(message.width);
    applyLayoutState();
    void writeState();
  }
});

(async () => {
  if (!isInjectablePage()) return;
  await readState();
  applyLayoutState();
  if (panelOpen) mountPanel();
})();
