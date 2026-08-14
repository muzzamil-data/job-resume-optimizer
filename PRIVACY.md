# TailorCV — Privacy

TailorCV is an open-source, fully local Chrome extension. It has **no backend and collects no data**. This project runs no servers, has no analytics, and never receives your resume, your job searches, or your API key.

## Where your data lives

Personal data is stored in your browser's `chrome.storage.local`, on your device only:

- Your uploaded resume and its parsed contents
- Optimized resumes, cover letters, and application history
- Your AI provider configuration (base URL and model name)
- Your API key, either in `chrome.storage.local` when **Remember API key** is enabled or in `chrome.storage.session` until Chrome closes when it is disabled

Nothing in this list is transmitted anywhere except as described below. **Settings → Clear All Stored Data** removes your resume, generated documents, application history, and preferences while preserving your provider configuration and API key. Uninstalling the extension removes its extension storage, including the provider configuration and key.

## What is sent, and to whom

Data is sent **only to the endpoint configured in Settings**, and only for these user-requested operations:

- **Optimize Resume** sends the locally redacted resume content and selected job description.
- **Generate Cover Letter** sends resume content and the selected job description.
- **Manual Scan Page fallback** may send up to 5,000 characters of visible page text when local selectors cannot identify a posting.
- **Test connection** sends only a short request asking the model to reply `OK`.

Automatic page scanning uses local DOM selectors and does not call an AI provider.

That request does not pass through any server operated by this project. Before sending your resume, the extension redacts your name, email, and phone number locally and restores them afterward.

Your use of a third-party AI provider is governed by **that provider's** privacy policy and terms. Choose a provider you trust, and review their data-retention and training policies.

## Backups

Settings can export and restore a local JSON backup containing your resume, optimized results, application history, preferences, and provider URL/model. API keys are deliberately excluded. Backup files are saved wherever your browser downloads files, so you control their storage and deletion.

## Permissions

- **storage** — to save the data listed above locally.
- **activeTab / scripting** — to read the job posting on the page you're viewing so it can be optimized against.
- **host access** — to send requests to the AI provider endpoint you configure. Because you can point the extension at any OpenAI-compatible endpoint, it requests broad host access; it only ever contacts the endpoint you set in Settings.

## Contact

This is an open-source project. Questions and issues can be raised in the repository.
