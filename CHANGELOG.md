# Changelog

All notable changes to TailorCV are documented here.

## [Unreleased]

### Documentation

- Added a privacy-safe visual guide covering extension installation, provider setup, résumé upload, job detection, manual job-description entry, and optimization. The guide is available as a top-level `GETTING_STARTED.md` document for easier discovery on GitHub.

## [1.1.0] - 2026-08-14

### Added

- Direct support for Claude, ChatGPT, DeepSeek, Qwen, Grok, and Kimi API keys.
- First-run guidance for provider setup and resume upload.
- Session-only API key storage as an alternative to remembering a key locally.
- Validated, API-key-free local backup export and restore.
- Storage schema migrations and validation for saved resumes, settings, and history.
- Broader automated coverage for storage, resume parsing, job-board adapters, document generation, onboarding, and privacy architecture.

### Changed

- Improved LinkedIn and SPA job-description scanning, including manual rescans, delayed content, stale-result protection, and AI fallback.
- Improved AI response parsing, provider error messages, and request timeout handling.
- Normalized stored dates and replaced invalid history dates with a safe fallback.
- Updated the sidebar launcher to use the project icon.
- Clarified exactly which data each AI-assisted action sends to the configured provider.

### Privacy

- Removed the hosted backend and credit system in favor of a fully open-source, bring-your-own-key architecture.
- Added automated checks preventing telemetry, analytics, privileged account permissions, and sensitive console logging.
- Local backups never include API keys.
