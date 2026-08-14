import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(target) : /\.(ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

test.describe('local-first privacy architecture', () => {
  test('has no telemetry dependencies or privileged account permissions', () => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const dependencyNames = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies });
    expect(dependencyNames.some(name => /sentry|posthog|segment|mixpanel|amplitude|analytics/i.test(name))).toBe(false);

    const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
    expect(manifest.permissions).not.toEqual(expect.arrayContaining(['identity', 'cookies', 'webRequest']));
    expect(manifest).not.toHaveProperty('oauth2');
    expect(manifest).not.toHaveProperty('externally_connectable');
  });

  test('contains no telemetry transport or sensitive dynamic console logging', () => {
    const source = sourceFiles('src').map(file => fs.readFileSync(file, 'utf8')).join('\n');
    expect(source).not.toMatch(/navigator\.sendBeacon|google-analytics\.com|api\.segment\.io|posthog\.capture|Sentry\.init|mixpanel\.track/);
    expect(source).not.toMatch(/console\.(?:log|warn|error|debug)\([^\n]*(?:apiKey|resume\.raw|pageText|providerMessage)/);
  });
});
