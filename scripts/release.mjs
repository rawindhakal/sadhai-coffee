#!/usr/bin/env node
// Usage: node scripts/release.mjs <patch|minor|major|x.y.z> [--commit] [--date YYYY-MM-DD]
// Bumps the version everywhere, files the Unreleased notes in history.md under the new version, and optionally commits and tags.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const f = (p) => join(root, p);
const read = (p) => readFileSync(f(p), 'utf8');
const write = (p, s) => writeFileSync(f(p), s);

const [, , bump, ...flags] = process.argv;
if (!bump) { console.error('Usage: node scripts/release.mjs <patch|minor|major|x.y.z> [--commit]'); process.exit(1); }
const cur = read('VERSION').trim();
let [ma, mi, pa] = cur.split('.').map(Number);
let next;
if (/^\d+\.\d+\.\d+$/.test(bump)) next = bump;
else if (bump === 'major') next = `${ma + 1}.0.0`;
else if (bump === 'minor') next = `${ma}.${mi + 1}.0`;
else if (bump === 'patch') next = `${ma}.${mi}.${pa + 1}`;
else { console.error(`Unknown bump "${bump}"`); process.exit(1); }
const di = flags.indexOf('--date');
const date = di >= 0 ? flags[di + 1] : new Date().toISOString().slice(0, 10);

// history.md: move Unreleased notes under the new version
let h = read('history.md');
const m = h.match(/## Unreleased\n([\s\S]*?)(?=\n## v)/);
if (!m) { console.error('history.md needs an "## Unreleased" section followed by a "## v…" section'); process.exit(1); }
const notes = m[1].trim();
if (!notes || /^_Nothing yet\._$/.test(notes)) { console.error('Nothing under Unreleased in history.md. Describe the change first.'); process.exit(1); }
h = h.replace(m[0], `## Unreleased\n\n_Nothing yet._\n\n## v${next} (${date})\n\n${notes}\n`);
write('history.md', h);

write('VERSION', `${next}\n`);
write('package.json', JSON.stringify({ ...JSON.parse(read('package.json')), version: next }, null, 2) + '\n');
for (const p of ['backend/package.json', 'web/package.json']) { const j = JSON.parse(read(p)); j.version = next; write(p, JSON.stringify(j, null, 2) + '\n'); }
write('web/src/lib/version.ts', read('web/src/lib/version.ts').replace(/APP_VERSION = '[^']*'/, `APP_VERSION = '${next}'`));
let pub = read('mobile/pubspec.yaml');
const build = Number((pub.match(/^version: [\d.]+\+(\d+)/m) || [])[1] || 0) + 1;
pub = pub.replace(/^version: .*$/m, `version: ${next}+${build}`);
write('mobile/pubspec.yaml', pub);
write('mobile/lib/version.dart', read('mobile/lib/version.dart').replace(/appVersion = '[^']*'/, `appVersion = '${next}'`).replace(/appBuild = \d+/, `appBuild = ${build}`));

console.log(`Version ${cur} -> ${next} (mobile build ${build})`);
if (flags.includes('--commit')) {
  execSync('git add -A', { cwd: root, stdio: 'inherit' });
  execSync(`git commit -m "Release v${next}"`, { cwd: root, stdio: 'inherit' });
  execSync(`git tag -a v${next} -m "Sadhai Coffee v${next}"`, { cwd: root, stdio: 'inherit' });
  console.log(`Committed and tagged v${next}. Push with: git push --follow-tags`);
}
