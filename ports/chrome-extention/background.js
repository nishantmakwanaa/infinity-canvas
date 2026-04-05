async function sendToggleToActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'CNVS_TOGGLE_PANEL' });
  } catch {
    // Content script may not run on restricted pages (chrome://, web store).
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
