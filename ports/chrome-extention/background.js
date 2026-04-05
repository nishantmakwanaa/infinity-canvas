const INJECTABLE_PROTOCOL = /^https?:/i;
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

async function getPanelState(tabId) {
  const result = await chrome.tabs.sendMessage(tabId, { type: 'CNVS_GET_PANEL_STATE' });
  if (result && typeof result === 'object' && typeof result.open === 'boolean') {
    return result;
  }
  return { open: false };
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
    return;
  }

  let state;
  try {
    state = await getPanelState(tab.id);
  } catch {
    // Existing page may not have content scripts yet (common after unpacked load).
  }

  if (!state) {
    try {
      await ensureContentScript(tab.id);
      state = await getPanelState(tab.id);
    } catch {
      // If injection is disallowed, do not navigate away from the current page.
      return;
    }
  }

  const nextOpen = !(state?.open === true);
  await setPanelOpen(tab.id, nextOpen);
}

chrome.action.onClicked.addListener(() => {
  void sendToggleToActiveTab();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-cnvs-panel') {
    void sendToggleToActiveTab();
  }
});
