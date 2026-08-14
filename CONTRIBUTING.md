# Contributing to TailorCV

Thanks for your interest! TailorCV is a fully local, bring-your-own-key Chrome
extension with no backend, so contributing is just a normal front-end workflow.

## Setup

Requires Node.js 20.16+ (Node.js 22 or 24 LTS is also supported).

```bash
npm install
npm run dev      # Vite watch build into dist/
```

Load the `dist/` folder as an unpacked extension at `chrome://extensions`
(Developer mode on → Load unpacked). Reload the extension there to pick up
rebuilds.

## Before opening a PR

```bash
npm run typecheck   # must pass
npm run build       # must succeed
npm run test:e2e    # complete Playwright suite; needs a Chromium build
```

Run all three checks before opening a PR. CI runs `typecheck` and `build` on every PR.

## Guidelines

- Keep it local-first. No servers, no analytics, no tracking — anything that
  sends user data anywhere except the AI endpoint the user configured is out of
  scope (see [PRIVACY.md](PRIVACY.md)).
- Match the existing code style; keep diffs focused.
- Adding support for a new job board? Update the `matches` globs in
  [manifest.json](manifest.json), detection in
  [src/lib/job-scraper.ts](src/lib/job-scraper.ts), and the adapter in
  [src/lib/job-scrapers/boards.ts](src/lib/job-scrapers/boards.ts).

## Reporting bugs & ideas

Open an issue with steps to reproduce (and the provider/model if it's an
AI-output issue — never paste your API key). Security-sensitive reports can be
raised privately via the repository's security advisories.

By contributing you agree your contributions are licensed under the
[MIT License](LICENSE).
