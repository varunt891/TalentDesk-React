// TalentDesk Service Worker (Manifest V3)

// Configure side panel behavior to open when extension action icon is clicked
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.log("Panel behavior fallback:", err);
  });
});

// Explicit action click listener as fallback
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (err) {
      console.error("Failed to open side panel:", err);
    }
  }
});

// Handle messages from content script or side panel if needed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'PONG', activeTabId: sender.tab ? sender.tab.id : null });
  }
  return true;
});
