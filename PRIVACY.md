# TailorCV — Privacy

TailorCV is an open-source, fully local Chrome extension. It has **no backend and collects no data**. This project runs no servers, has no analytics, and never receives your resume, your job searches, or your API key.

## Where your data lives

Everything is stored in your browser's `chrome.storage.local`, on your device only:

- Your uploaded resume and its parsed contents
- Optimized resumes, cover letters, and application history
- Your AI provider configuration (base URL, API key, model name)

Nothing in this list is transmitted anywhere except as described below. Uninstalling the extension, or using **Settings → Clear All Stored Data**, removes it.

## What is sent, and to whom

When you optimize a resume, generate a cover letter, or use AI job detection, the extension sends the relevant text (resume content, job description, or page text) **directly to the AI provider endpoint you configured in Settings** — for example OpenAI, OpenRouter, Groq, or a local model. It is sent using your own API key.

That request goes straight from your browser to that provider. It does not pass through any server operated by this project. Before sending your resume, the extension redacts your name, email, and phone number locally and restores them afterward.

Your use of a third-party AI provider is governed by **that provider's** privacy policy and terms. Choose a provider you trust, and review their data-retention and training policies.

## Permissions

- **storage** — to save the data listed above locally.
- **activeTab / scripting** — to read the job posting on the page you're viewing so it can be optimized against.
- **host access** — to send requests to the AI provider endpoint you configure. Because you can point the extension at any OpenAI-compatible endpoint, it requests broad host access; it only ever contacts the endpoint you set in Settings.

## Contact

This is an open-source project. Questions and issues can be raised in the repository.
