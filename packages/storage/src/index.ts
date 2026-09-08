import { link, mkdir, open, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { canonical, emptyArtifact, replay, type Artifact } from '../../reasoning-core/src/core.js';
import { readUtf8Bounded } from './files.js';

/** One local graph, immutable snapshots, atomic HEAD, and optimistic concurrency. */
export class FileStore {
  readonly directory: string;
  constructor(directory: string) { this.directory = resolve(directory); }
  async load(): Promise<Artifact> {
    let head: string;
    try { head = (await readUtf8Bounded(join(this.directory, 'HEAD'), 100)).trim(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyArtifact(); throw error; }
    if (!/^sha256:[a-f0-9]{64}$/.test(head)) throw new Error('Corrupt storage HEAD');
    const content = await readUtf8Bounded(join(this.directory, 'snapshots', `${head.slice(7)}.json`));
    const graph = await replay(JSON.parse(content));
    if (graph.artifact.head !== head) throw new Error('Stored snapshot head mismatch');
    return graph.artifact;
  }
  async commit(artifact: Artifact, expectedHead: string | null): Promise<void> {
    await replay(artifact);
    if (!artifact.head) throw new Error('Nothing to persist');
    const serialized = canonical(artifact);
    if (Buffer.byteLength(serialized) > 2_000_000) throw new Error('Artifact exceeds 2 MB');
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = join(this.directory, '.writer-lock');
    try { await mkdir(lock, { mode: 0o700 }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Store writer busy; reload and retry. Do not remove a live writer lock.');
      throw error;
    }
    const temporary = join(this.directory, `HEAD-${crypto.randomUUID()}.tmp`);
    const snapshotTemporary = join(this.directory, 'snapshots', `${crypto.randomUUID()}.tmp`);
    try {
      const current = await this.load();
      if (current.head !== expectedHead) throw new Error('Storage head conflict');
      if (current.head && (current.graphId !== artifact.graphId || canonical(current.events) !== canonical(artifact.events.slice(0, current.events.length)))) throw new Error('Commit must preserve recorded history');
      await mkdir(join(this.directory, 'snapshots'), { recursive: true, mode: 0o700 });
      const snapshot = join(this.directory, 'snapshots', `${artifact.head.slice(7)}.json`);
      const file = await open(snapshotTemporary, 'wx', 0o600);
      try { await file.writeFile(serialized); await file.sync(); } finally { await file.close(); }
      try {
        // Publish a complete snapshot exclusively; a crash cannot leave partial bytes
        // under an authoritative hash filename. Existing immutable files are never replaced.
        await link(snapshotTemporary, snapshot);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (await readUtf8Bounded(snapshot) !== serialized) throw new Error('Snapshot collision or corruption');
      }
      const snapshots = await open(join(this.directory, 'snapshots'), 'r');
      try { await snapshots.sync(); } finally { await snapshots.close(); }
      const pointer = await open(temporary, 'wx', 0o600);
      try { await pointer.writeFile(`${artifact.head}\n`); await pointer.sync(); } finally { await pointer.close(); }
      await rename(temporary, join(this.directory, 'HEAD'));
      const directory = await open(this.directory, 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    } finally {
      await rm(snapshotTemporary, { force: true }); await rm(temporary, { force: true }); await rm(lock, { recursive: true });
    }
  }
}
