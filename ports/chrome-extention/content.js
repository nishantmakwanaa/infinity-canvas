(() => {
const PANEL_URL = chrome.runtime.getURL('panel.html');
const ROOT_ID = 'cnvs-ext-root';
const FRAME_ID = 'cnvs-ext-frame';
const HINT_ID = 'cnvs-ext-focus-hint';
const STORAGE_KEY = 'cnvsExtensionPanelState';
const DEFAULT_WIDTH = 460;
const MIN_WIDTH = DEFAULT_WIDTH;
const SCRIPT_VERSION = '1.1.5';
const CONTROLLER_KEY = '__CNVS_SIDE_SPLIT_CONTROLLER__';

const hostInlineStyles = {
  htmlPaddingRight: null,
  htmlBoxSizing: null,
  htmlOverflowX: null,
  bodyPaddingRight: null,
  bodyBoxSizing: null,
};
let hostStylesCaptured = false;

const existingController = globalThis[CONTROLLER_KEY];
if (existingController && typeof existingController.dispose === 'function') {
  try {
    existingController.dispose();
  } catch {
    // Ignore stale-controller cleanup issues.
  }
}

let panelOpen = false;
let panelWidth = DEFAULT_WIDTH;

function captureHostInlineStyles() {
  if (hostStylesCaptured) return;
  const htmlStyle = document.documentElement.style;
  hostInlineStyles.htmlPaddingRight = htmlStyle.paddingRight;
  hostInlineStyles.htmlBoxSizing = htmlStyle.boxSizing;
  hostInlineStyles.htmlOverflowX = htmlStyle.overflowX;

  const body = document.body;
  if (body) {
    hostInlineStyles.bodyPaddingRight = body.style.paddingRight;
    hostInlineStyles.bodyBoxSizing = body.style.boxSizing;
  }

  hostStylesCaptured = true;
}

function applyHostOffsetStyles() {
  const html = document.documentElement;
  const body = document.body;

  if (panelOpen) {
    captureHostInlineStyles();
    const widthPx = `${panelWidth}px`;
    html.style.setProperty('padding-right', widthPx, 'important');
    html.style.setProperty('box-sizing', 'border-box', 'important');
    html.style.setProperty('overflow-x', 'hidden', 'important');
    if (body) {
      body.style.setProperty('padding-right', widthPx, 'important');
      body.style.setProperty('box-sizing', 'border-box', 'important');
    }
    return;
  }

  if (!hostStylesCaptured) return;
  html.style.paddingRight = hostInlineStyles.htmlPaddingRight ?? '';
  html.style.boxSizing = hostInlineStyles.htmlBoxSizing ?? '';
  html.style.overflowX = hostInlineStyles.htmlOverflowX ?? '';
  if (body) {
    body.style.paddingRight = hostInlineStyles.bodyPaddingRight ?? '';
    body.style.boxSizing = hostInlineStyles.bodyBoxSizing ?? '';
  }
}

function isInjectablePage() {
  return /^https?:/i.test(window.location.protocol);
}

function clampWidth(value) {
  const viewportHalf = Math.floor(window.innerWidth * 0.5);
  const maxWidth = Math.max(MIN_WIDTH, viewportHalf);
  return Math.max(MIN_WIDTH, Math.min(maxWidth, Math.round(value)));
}

async function readState() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const state = result?.[STORAGE_KEY];
    if (!state || typeof state !== 'object') return;
    if (typeof state.width === 'number') panelWidth = clampWidth(state.width);
  } catch {
    // Ignore storage failures.
  }
}

async function writeState() {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
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
  applyHostOffsetStyles();
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

  const mountTarget = document.body || document.documentElement;
  if (!mountTarget) return;

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.style.position = 'fixed';
  root.style.top = '0';
  root.style.right = '0';
  root.style.height = '100vh';
  root.style.width = `${panelWidth}px`;
  root.style.background = '#09090b';
  root.style.borderLeft = '1px solid rgba(255, 255, 255, 0.16)';
  root.style.boxShadow = '-8px 0 32px rgba(0, 0, 0, 0.2)';
  root.style.zIndex = '2147483000';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.overflow = 'hidden';

  const hint = document.createElement('div');
  hint.id = HINT_ID;
  hint.textContent = 'Click panel to focus CNVS shortcuts';
  hint.style.position = 'absolute';
  hint.style.left = '10px';
  hint.style.top = '10px';
  hint.style.zIndex = '2';
  hint.style.font = '11px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  hint.style.color = '#d4d4d8';
  hint.style.background = 'rgba(0, 0, 0, 0.46)';
  hint.style.border = '1px solid rgba(255, 255, 255, 0.2)';
  hint.style.padding = '4px 7px';
  hint.style.pointerEvents = 'none';
  root.appendChild(hint);

  const frame = document.createElement('iframe');
  frame.id = FRAME_ID;
  frame.src = PANEL_URL;
  frame.allow = 'clipboard-read; clipboard-write';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.title = 'CNVS Side Panel';
  frame.style.width = '100%';
  frame.style.height = '100%';
  frame.style.border = '0';
  frame.style.background = '#111';
  root.appendChild(frame);

  root.addEventListener('pointerdown', () => {
    hint.style.display = 'none';
    try {
      frame.contentWindow?.focus();
    } catch {
      frame.focus();
    }
  });

  mountTarget.appendChild(root);
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

const onViewportResize = () => {
  const nextWidth = clampWidth(panelWidth);
  if (nextWidth !== panelWidth) {
    panelWidth = nextWidth;
    void writeState();
  }
  applyLayoutState();
};

window.addEventListener('resize', onViewportResize, { passive: true });

const onMessage = (message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'CNVS_PING') {
    sendResponse({ version: SCRIPT_VERSION, open: panelOpen, width: panelWidth });
    return;
  }
  if (message.type === 'CNVS_GET_PANEL_STATE') {
    sendResponse({ version: SCRIPT_VERSION, open: panelOpen, width: panelWidth });
    return;
  }
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
};

chrome.runtime.onMessage.addListener(onMessage);

const controller = {
  version: SCRIPT_VERSION,
  dispose() {
    window.removeEventListener('resize', onViewportResize);
    chrome.runtime.onMessage.removeListener(onMessage);
    unmountPanel();
  },
};
globalThis[CONTROLLER_KEY] = controller;

(async () => {
  if (!isInjectablePage()) return;
  await readState();
  applyLayoutState();
  if (panelOpen) mountPanel();
})();

})();
