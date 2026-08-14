# Security Policy

## Supported versions

Security fixes are applied to the latest released version of TailorCV.

| Version | Supported |
|---|---|
| 1.1.x | Yes |
| Earlier versions | No |

## Reporting a vulnerability

Please report security issues privately through the repository's [GitHub security advisories](https://github.com/muzzamil-data/job-resume-optimizer/security/advisories/new).

Include the affected version, a clear reproduction, the potential impact, and any suggested mitigation. Do not include real API keys, résumés, personal information, or other secrets in the report.

Please do not open a public issue for an unpatched vulnerability. Maintainers will acknowledge a report when possible, investigate it, and coordinate disclosure after a fix is available.

## Project security model

- TailorCV has no project-operated backend, accounts, analytics, or telemetry.
- Personal data is stored in Chrome extension storage on the user's device.
- AI requests go directly to the endpoint configured by the user.
- Saved API keys are never rendered back into the Settings page or included in backups.
- Automatic page scanning is local; only a user-requested manual fallback may send visible page text to the configured provider.

See [PRIVACY.md](PRIVACY.md) for the complete data-handling policy.
