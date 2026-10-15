#!/usr/bin/env node
// Fails when the version differs between files. Run in CI.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const v = read('VERSION').trim();
const found = {
  'package.json': JSON.parse(read('package.json')).version,
  'backend/package.json': JSON.parse(read('backend/package.json')).version,
  'web/package.json': JSON.parse(read('web/package.json')).version,
  'web/src/lib/version.ts': (read('web/src/lib/version.ts').match(/APP_VERSION = '([^']*)'/) || [])[1],
  'mobile/pubspec.yaml': (read('mobile/pubspec.yaml').match(/^version: ([\d.]+)\+/m) || [])[1],
  'mobile/lib/version.dart': (read('mobile/lib/version.dart').match(/appVersion = '([^']*)'/) || [])[1],
  'history.md (latest release)': (read('history.md').match(/^## v(\d+\.\d+\.\d+)/m) || [])[1],
};
let bad = 0;
for (const [k, x] of Object.entries(found)) { const ok = x === v; if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${k}: ${x}`); }
console.log(bad ? `\n${bad} file(s) disagree with VERSION ${v}` : `\nAll versions match ${v}`);
process.exit(bad ? 1 : 0);
