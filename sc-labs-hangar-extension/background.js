// =============================================================================
// SC Labs Hangar Importer — Background Service Worker (MV3)
//
// Handles message routing between popup and content scripts.
// Also injects content script on RSI pages when needed.
// =============================================================================

// Forward messages from content script to popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Messages from content script that need to reach the popup
  if (
    msg.type === "export-progress" ||
    msg.type === "export-complete" ||
    msg.type === "export-error"
  ) {
    // Forward to all extension pages (popup, options, etc.)
    chrome.runtime.sendMessage(msg).catch(() => {
      // Popup might be closed, that's OK
    });
  }
});

// When the user clicks the extension icon and is on RSI, ensure content script is ready
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url && tab.url.includes("robertsspaceindustries.com")) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
    } catch (err) {
      console.log("[SC Labs] Could not inject content script:", err.message);
    }
  }
});

console.log("[SC Labs] Background service worker started.");
