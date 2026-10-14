#!/usr/bin/env node
// Copies the AdMob plugin patch into the app's workspace root and registers it
// with pnpm. Run from the root that holds pnpm-lock.yaml, then `pnpm install`.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = '@capacitor-community/admob@6.2.0';
const FILE = '@capacitor-community__admob@6.2.0.patch';
const root = process.cwd();
const pkgPath = join(root, 'package.json');
if (!existsSync(pkgPath)) {
  console.error('Run this from your workspace root (the folder with package.json / pnpm-lock.yaml).');
  process.exit(1);
}
const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'patches', FILE);
mkdirSync(join(root, 'patches'), { recursive: true });
const dest = join(root, 'patches', FILE);
copyFileSync(src, dest);

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.pnpm ??= {};
pkg.pnpm.patchedDependencies ??= {};
pkg.pnpm.patchedDependencies[NAME] = `patches/${FILE}`;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Patch copied to patches/${FILE} and registered in package.json.`);
console.log('Now run: pnpm install && npx cap sync ios');
