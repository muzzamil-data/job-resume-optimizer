// Popup script for the extension icon.
document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status-detail');
  const userEl = document.getElementById('user-status');
  const openSidebarBtn = document.getElementById('open-sidebar');

  // Reflect whether the user has configured a provider + key yet.
  try {
    const { apiConfig } = await chrome.storage.local.get('apiConfig');
    const configured = !!(apiConfig && apiConfig.apiKey && apiConfig.model);
    if (configured) {
      userEl.textContent = 'Ready';
      statusEl.textContent = 'Using your own API key on this device.';
    } else {
      userEl.textContent = 'Setup required';
      statusEl.textContent = 'Open the optimizer and add your API key in Settings.';
    }
  } catch (err) {
    console.error('Failed to load popup data:', err);
    statusEl.textContent = 'Error loading status';
  }

  const openSidebar = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      alert('Please navigate to a webpage first (e.g. a job listing), then click the extension icon.');
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' });
      window.close();
    } catch (err) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/content/index.js'],
        });
        await new Promise(resolve => setTimeout(resolve, 150));
        await chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' });
        window.close();
      } catch (err2) {
        console.error('Failed to open sidebar:', err2);
        alert('Failed to open sidebar. Please refresh the page and try again.');
      }
    }
  };

  openSidebarBtn.addEventListener('click', () => openSidebar());
});
