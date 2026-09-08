import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile('dist/extension/manifest.json', 'utf8'));
if (manifest.version !== version) throw new Error('Package and extension versions differ');
const files = ['LICENSE', 'THIRD_PARTY_NOTICES.txt', 'launcher.js', 'manifest.json', 'popup.css', 'popup.html', 'popup.js', 'popup.js.map'].sort();
await mkdir('releases', { recursive: true });
const archive = resolve(`releases/logosphere-${version}-extension.zip`);
const stage = await mkdtemp(join(tmpdir(), 'logosphere-package-'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  const hashes = {};
  for (const name of files) {
    const path = join(stage, name);
    await copyFile(join('dist/extension', name), path);
    const epoch = new Date('2000-01-01T00:00:00Z'); await utimes(path, epoch, epoch);
    hashes[name] = sha256(await readFile(path));
  }
  const temporary = join(stage, 'release.zip');
  execFileSync('zip', ['-X', '-q', temporary, ...files], { cwd: stage, env: { ...process.env, TZ: 'UTC' } });
  await copyFile(temporary, archive);
  let revision = null;
  try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Initial repository has no HEAD yet. */ }
  const receipt = { version, revision, archive: archive.split('/').at(-1), sha256: sha256(await readFile(archive)), files: hashes,
    scope: 'Local extension package. Does not publish, install, or include captured data.' };
  await writeFile(`releases/logosphere-${version}-checksums.json`, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
} finally { await rm(stage, { recursive: true, force: true }); }
