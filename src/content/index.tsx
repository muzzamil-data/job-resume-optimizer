import React from 'react';
import ReactDOM from 'react-dom/client';
import Sidebar from './sidebar';
import inlineCss from '../styles/globals.css?inline';

let hostElement: HTMLDivElement | null = null;
let shadowContainer: HTMLDivElement | null = null;
let reactRoot: ReactDOM.Root | null = null;
let sidebarOpen = false;

const createRootElement = () => {
  if (hostElement) return;

  hostElement = document.createElement('div');
  hostElement.id = 'tailorcv-root';
  hostElement.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    right: 0 !important;
    width: 0 !important;
    height: 100vh !important;
    z-index: 2147483647 !important;
    overflow: hidden !important;
    transition: width 0.3s ease !important;
    box-shadow: -4px 0 24px rgba(0,0,0,0.15) !important;
  `;

  // Shadow DOM isolates our CSS from the host page
  const shadow = hostElement.attachShadow({ mode: 'open' });

  // Bundle Tailwind CSS inline — no async fetch, works on all pages
  const styleEl = document.createElement('style');
  styleEl.textContent = inlineCss;
  shadow.appendChild(styleEl);

  // React container inside shadow DOM
  shadowContainer = document.createElement('div');
  shadowContainer.style.cssText = `
    height: 100%;
    width: 420px;
    background: white;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 16px;
    color: #111827;
    box-sizing: border-box;
  `;
  shadow.appendChild(shadowContainer);

  document.body.appendChild(hostElement);
  reactRoot = ReactDOM.createRoot(shadowContainer);
};

const toggleSidebar = () => {
  createRootElement();

  sidebarOpen = !sidebarOpen;

  if (hostElement) {
    hostElement.style.width = sidebarOpen ? '420px' : '0';
  }

  if (reactRoot) {
    if (sidebarOpen) {
      reactRoot.render(
        <React.StrictMode>
          <Sidebar onClose={() => toggleSidebar()} />
        </React.StrictMode>
      );
    } else {
      reactRoot.render(null);
    }
  }
};

// Listen for messages from the extension's own popup/service worker only.
// Wrapped in try-catch: if the extension context becomes invalidated (MV3 service
// worker restart), addListener itself can throw. The sidebar still works for the
// current session; the user just needs to refresh to re-establish the connection.
try {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Only accept messages from this extension — reject anything from web pages
    // or other extensions that might relay toggle commands.
    if (sender.id !== chrome.runtime.id) return;
    if (request.action === 'toggleSidebar') {
      toggleSidebar();
      sendResponse({ success: true });
    }
    return true;
  });
} catch {
  // Context was invalidated before registration — page refresh required
}

// Auto-detect if we're on a job posting page
const checkIfJobPage = (): boolean => {
  const url = window.location.href.toLowerCase();
  const jobKeywords = ['job', 'career', 'position', 'hiring', 'apply', 'greenhouse', 'lever', 'workday', 'linkedin', 'indeed', 'glassdoor'];
  return jobKeywords.some(keyword => url.includes(keyword));
};

const showJobPageIndicator = () => {
  if (!checkIfJobPage() || sidebarOpen) return;
  if (document.getElementById('tailorcv-indicator')) return;

  const indicator = document.createElement('div');
  indicator.id = 'tailorcv-indicator';
  indicator.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 12px 20px;
    border-radius: 30px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    cursor: pointer;
    z-index: 2147483646;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: transform 0.2s;
  `;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '20'); svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
  const pathEl = document.createElementNS(svgNS, 'path');
  pathEl.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
  const polyEl = document.createElementNS(svgNS, 'polyline');
  polyEl.setAttribute('points', '14 2 14 8 20 8');
  const line1 = document.createElementNS(svgNS, 'line');
  line1.setAttribute('x1', '16'); line1.setAttribute('y1', '13');
  line1.setAttribute('x2', '8'); line1.setAttribute('y2', '13');
  const line2 = document.createElementNS(svgNS, 'line');
  line2.setAttribute('x1', '16'); line2.setAttribute('y1', '17');
  line2.setAttribute('x2', '8'); line2.setAttribute('y2', '17');
  svg.append(pathEl, polyEl, line1, line2);
  indicator.append(svg, document.createTextNode(' TailorCV — Optimize for This Job'));

  indicator.addEventListener('mouseenter', () => { indicator.style.transform = 'scale(1.05)'; });
  indicator.addEventListener('mouseleave', () => { indicator.style.transform = 'scale(1)'; });
  indicator.addEventListener('click', () => {
    toggleSidebar();
    indicator.remove();
  });

  document.body.appendChild(indicator);

  setTimeout(() => {
    indicator.style.opacity = '0';
    indicator.style.transition = 'opacity 0.5s';
    setTimeout(() => indicator.remove(), 500);
  }, 10000);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', showJobPageIndicator);
} else {
  showJobPageIndicator();
}

// Last-resort: suppress noisy unhandled-rejection console errors when the
// extension is reloaded while this page is open. The UI shows a friendly
// "please refresh" message via SidebarContext's error state already.
window.addEventListener('unhandledrejection', (event) => {
  const msg = (
    event.reason instanceof Error ? event.reason.message : String(event.reason ?? '')
  ).toLowerCase();
  if (
    msg.includes('extension context invalidated') ||
    msg.includes('could not establish connection') ||
    msg.includes('receiving end does not exist')
  ) {
    event.preventDefault();
  }
});

export {};
