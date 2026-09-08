import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { ArtifactSchema } from '../dist/packages/reasoning-core/src/schema.js';
import { CommandSchema } from '../dist/packages/sdk/src/index.js';
await mkdir('dist/extension', { recursive: true });
await build({ entryPoints: ['browser-extension/src/popup.ts'], bundle: true, outfile: 'dist/extension/popup.js', platform: 'browser', target: 'chrome120', format: 'iife', sourcemap: true });
await build({ entryPoints: ['browser-extension/src/launcher.ts'], bundle: true, outfile: 'dist/extension/launcher.js', platform: 'browser', target: 'chrome120', format: 'iife' });
for (const file of ['manifest.json', 'popup.html', 'popup.css']) await copyFile(`browser-extension/${file}`, `dist/extension/${file}`);
await copyFile('LICENSE', 'dist/extension/LICENSE');
await writeFile('dist/extension/THIRD_PARTY_NOTICES.txt', `Logosphere bundles Zod 4.1.5.\n\n${await readFile('node_modules/zod/LICENSE', 'utf8')}`);
for (const [name, schema] of [['artifact', ArtifactSchema], ['command', CommandSchema]]) {
  await writeFile(`schemas/${name}.schema.json`, `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`);
}
