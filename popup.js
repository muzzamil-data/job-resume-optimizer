// Popup script for extension icon
document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('credits-text');
  const userEl = document.getElementById('user-status');
  const openSidebarBtn = document.getElementById('open-sidebar');
  const viewCreditsBtn = document.getElementById('view-credits');

  // Check login state and load credit balance from chrome.storage.
  // The sidebar writes the Supabase-fetched balance back to chrome.storage
  // every time it loads, so this value stays fresh.
  try {
    const result = await chrome.storage.local.get(['sb_access_token', 'creditBalance']);
    const isLoggedIn = !!result.sb_access_token;
    const credits = result.creditBalance;

    if (!isLoggedIn) {
      userEl.textContent = 'Not signed in';
      statusEl.textContent = 'Sign in to use the optimizer';
      viewCreditsBtn.style.display = 'none';
    } else {
      userEl.textContent = 'Signed in';
      if (credits && typeof credits.remaining === 'number') {
        const label = credits.remaining === 1 ? 'credit' : 'credits';
        statusEl.textContent = `${credits.remaining} ${label} remaining`;
      } else {
        statusEl.textContent = '100 credits remaining';
      }
    }
  } catch (err) {
    console.error('Failed to load popup data:', err);
    statusEl.textContent = 'Error loading status';
  }

  const openSidebar = async (view) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      alert('Please navigate to a webpage first (e.g. a job listing), then click the extension icon.');
      return;
    }

    try {
      const message = { action: 'toggleSidebar' };
      if (view) message.view = view;
      await chrome.tabs.sendMessage(tab.id, message);
      window.close();
    } catch (err) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/content/index.js']
        });
        await new Promise(resolve => setTimeout(resolve, 150));
        const message = { action: 'toggleSidebar' };
        if (view) message.view = view;
        await chrome.tabs.sendMessage(tab.id, message);
        window.close();
      } catch (err2) {
        console.error('Failed to open sidebar:', err2);
        alert('Failed to open sidebar. Please refresh the page and try again.');
      }
    }
  };

  openSidebarBtn.addEventListener('click', () => openSidebar());
  viewCreditsBtn.addEventListener('click', () => openSidebar('credits'));
});
