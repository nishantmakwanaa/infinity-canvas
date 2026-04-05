const INJECTABLE_PROTOCOL = /^https?:/i;
const CONTENT_SCRIPT_VERSION = '1.1.5';
const BLOCKED_PAGE_PREFIXES = [
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com',
  'edge://',
  'chrome://',
  'about:',
];

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content.css'],
    });
  } catch {
    // Ignore if CSS is already present or page disallows injection.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  });
}

async function forceTogglePanel(tabId) {
  const panelUrl = chrome.runtime.getURL('panel.html');
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [panelUrl],
    func: (resolvedPanelUrl) => {
      const ROOT_ID = 'cnvs-ext-root';
      const existing = document.getElementById(ROOT_ID);

      const clampWidth = (value) => {
        const minWidth = 460;
        const maxWidth = Math.max(minWidth, Math.floor(window.innerWidth * 0.5));
        return Math.max(minWidth, Math.min(maxWidth, Math.round(value)));
      };

      const applyHostOffset = (width) => {
        const widthPx = `${width}px`;
        document.documentElement.style.setProperty('padding-right', widthPx, 'important');
        document.documentElement.style.setProperty('box-sizing', 'border-box', 'important');
        document.documentElement.style.setProperty('overflow-x', 'hidden', 'important');
        if (document.body) {
          document.body.style.setProperty('padding-right', widthPx, 'important');
          document.body.style.setProperty('box-sizing', 'border-box', 'important');
        }
      };

      const clearHostOffset = () => {
        document.documentElement.style.removeProperty('padding-right');
        document.documentElement.style.removeProperty('box-sizing');
        document.documentElement.style.removeProperty('overflow-x');
        if (document.body) {
          document.body.style.removeProperty('padding-right');
          document.body.style.removeProperty('box-sizing');
        }
      };

      if (existing) {
        existing.remove();
        document.documentElement.classList.remove('cnvs-ext-open');
        document.documentElement.style.removeProperty('--cnvs-ext-width');
        clearHostOffset();
        return;
      }

      const mountTarget = document.body || document.documentElement;
      if (!mountTarget) return;

      let panelWidth = clampWidth(460);
      document.documentElement.style.setProperty('--cnvs-ext-width', `${panelWidth}px`);
      document.documentElement.classList.add('cnvs-ext-open');
      applyHostOffset(panelWidth);

      const root = document.createElement('div');
      root.id = ROOT_ID;
      root.style.position = 'fixed';
      root.style.top = '0';
      root.style.right = '0';
      root.style.height = '100vh';
      root.style.width = `${panelWidth}px`;
      root.style.zIndex = '2147483000';
      root.style.background = '#09090b';
      root.style.borderLeft = '1px solid rgba(255,255,255,0.16)';
      root.style.boxShadow = '-8px 0 32px rgba(0,0,0,0.2)';
      root.style.overflow = 'hidden';

      const frame = document.createElement('iframe');
      frame.id = 'cnvs-ext-frame';
      frame.src = resolvedPanelUrl;
      frame.title = 'CNVS Side Panel';
      frame.style.width = '100%';
      frame.style.height = '100%';
      frame.style.border = '0';
      frame.allow = 'clipboard-read; clipboard-write';
      root.appendChild(frame);

      const applyWidth = (width) => {
        panelWidth = clampWidth(width);
        root.style.width = `${panelWidth}px`;
        document.documentElement.style.setProperty('--cnvs-ext-width', `${panelWidth}px`);
        applyHostOffset(panelWidth);
      };

      window.addEventListener('resize', () => {
        applyWidth(panelWidth);
      }, { passive: true });

      mountTarget.appendChild(root);
    },
  });
}

async function getPanelState(tabId) {
  const result = await chrome.tabs.sendMessage(tabId, { type: 'CNVS_PING' });
  if (result && typeof result === 'object' && typeof result.open === 'boolean') {
    return result;
  }
  return null;
}

async function setPanelOpen(tabId, open) {
  await chrome.tabs.sendMessage(tabId, { type: 'CNVS_SET_PANEL_OPEN', open });
}

async function sendToggleToActiveTab() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  const activeUrl = typeof tab.url === 'string' ? tab.url : '';
  if (!INJECTABLE_PROTOCOL.test(activeUrl)) {
    return;
  }

  const isBlocked = BLOCKED_PAGE_PREFIXES.some((prefix) => activeUrl.startsWith(prefix));
  if (isBlocked) {
    await chrome.action.setBadgeText({ text: 'X', tabId: tab.id });
    await chrome.action.setBadgeBackgroundColor({ color: '#9f1239', tabId: tab.id });
    return;
  }

  await chrome.action.setBadgeText({ text: '', tabId: tab.id });

  let state;
  try {
    state = await getPanelState(tab.id);
  } catch {
    // Existing page may not have content scripts yet (common after unpacked load).
  }

  if (!state || state.version !== CONTENT_SCRIPT_VERSION) {
    try {
      await ensureContentScript(tab.id);
      state = await getPanelState(tab.id);
    } catch {
      // If injection is disallowed, do not navigate away from the current page.
      return;
    }
  }

  if (!state) {
    return;
  }

  const nextOpen = !(state?.open === true);
  try {
    await setPanelOpen(tab.id, nextOpen);
  } catch {
    try {
      await forceTogglePanel(tab.id);
    } catch {
      // Keep silent and avoid navigation side effects.
    }
  }
}

chrome.action.onClicked.addListener(() => {
  void sendToggleToActiveTab();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-cnvs-panel') {
    void sendToggleToActiveTab();
  }
});
