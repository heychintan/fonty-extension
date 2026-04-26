chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "FONTY_TOGGLE" });
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["lib.js", "content.js"]
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["content.css"]
      });
      await chrome.tabs.sendMessage(tab.id, { type: "FONTY_TOGGLE" });
    } catch (err) {
      console.warn("Fonty cannot run on this page:", err);
    }
  }
});

// Track download id -> originating tab so we can confirm completion.
const downloadTabs = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "FONTY_DOWNLOAD") {
    const tabId = sender.tab?.id;
    chrome.downloads.download(
      {
        url: msg.url,
        filename: msg.filename || undefined,
        saveAs: false
      },
      (id) => {
        const error = chrome.runtime.lastError?.message;
        if (id != null && tabId != null) {
          downloadTabs.set(id, { tabId, filename: msg.filename });
        }
        sendResponse({ id, error });
      }
    );
    return true;
  }
});

chrome.downloads.onChanged.addListener((delta) => {
  const entry = downloadTabs.get(delta.id);
  if (!entry) return;
  if (delta.state?.current === "complete") {
    chrome.downloads.search({ id: delta.id }, (items) => {
      const item = items?.[0];
      const filename = item?.filename ? item.filename.split(/[\\/]/).pop() : entry.filename;
      chrome.tabs.sendMessage(entry.tabId, {
        type: "FONTY_DOWNLOAD_DONE",
        id: delta.id,
        filename
      }).catch(() => {});
      downloadTabs.delete(delta.id);
    });
  } else if (delta.state?.current === "interrupted") {
    chrome.tabs.sendMessage(entry.tabId, {
      type: "FONTY_DOWNLOAD_FAILED",
      id: delta.id,
      filename: entry.filename
    }).catch(() => {});
    downloadTabs.delete(delta.id);
  }
});
