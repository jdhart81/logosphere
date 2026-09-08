import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { append, canonical, render, replay } from '../../reasoning-core/src/core.js';
import { DEMO, ingest } from '../../observation/src/extract.js';
import { LeanVerifier, readArtifact, reproduce } from '../../verifier/src/index.js';
import { readUtf8Bounded } from '../../storage/src/files.js';

async function main(): Promise<void> {
  const [command, file, output] = process.argv.slice(2);
  if (command === 'demo' || command === 'ingest') {
    const demo = command === 'demo';
    if (!demo && !file) throw new Error('Usage: ingest argument.txt [artifact.json] [--accept-formalization]');
    const text = demo ? DEMO : await readUtf8Bounded(file!);
    const accepted = demo || process.argv.includes('--accept-formalization');
    let artifact = await ingest({ text, title: demo ? 'Synthetic reservoir argument (not real evidence)' : 'User-supplied argument', mode: 'supplied', truncated: text.length > 12_000, capturedAt: new Date().toISOString() }, { id: 'human:local-cli', kind: 'human' }, accepted);
    const graph = await replay(artifact); const verified = new Set<string>();
    for (const edgeId of graph.edges.keys()) {
      const receipt = await new LeanVerifier().verify(await replay(artifact), edgeId);
      artifact = await append(artifact, { id: 'system:lean-verifier', kind: 'system' }, [{ type: 'verification', value: receipt }]);
      verified.add(receipt.id);
      if (demo && receipt.status !== 'PROVEN') throw new Error(`Demo did not verify: ${receipt.reason}\n${receipt.stderr}\n${receipt.stdout}`);
    }
    const destination = resolve(demo ? 'artifacts/demo.json' : output && !output.startsWith('--') ? output : 'artifacts/argument.json');
    await mkdir(resolve(destination, '..'), { recursive: true });
    await writeFile(destination, canonical(artifact), { mode: 0o600 });
    const result = await replay(artifact);
    for (const n of result.nodes.values()) if (n.value.kind === 'conclusion') process.stdout.write(`${render(result, n.value.id, verified)}\n`);
    if (!result.edges.size) process.stdout.write('No supported inference pattern found. Claims remain unresolved.\n');
    if (demo) {
      const receipt = [...result.verifications.values()][0]!.value;
      const check = await reproduce(result, receipt.id);
      if (!check.matches) throw new Error('Independent rerun did not match receipt');
      await writeFile(join(resolve('artifacts'), 'Proof.lean'), receipt.source, { mode: 0o600 });
      process.stdout.write('Exported proof receipt reproduced in a fresh Lean process.\n');
    }
    process.stdout.write(`Artifact: ${destination}\nHead: ${artifact.head}\n`);
  } else if (command === 'check') {
    if (!file) throw new Error('Usage: check artifact.json');
    const graph = await replay(await readArtifact(file));
    let failures = 0;
    for (const { value: receipt } of graph.verifications.values()) {
      const checked = await reproduce(graph, receipt.id);
      process.stdout.write(`${receipt.id}: ${checked.matches ? 'reproduced' : 'NOT reproduced'} (${checked.fresh.status})\n`);
      if (!checked.matches || checked.fresh.status === 'UNVERIFIED') failures++;
    }
    process.stdout.write(`Integrity valid. ${graph.nodes.size} nodes, ${graph.edges.size} inferences, ${graph.verifications.size} reported receipts.\n`);
    if (failures) process.exitCode = 1;
  } else if (command === 'inspect') {
    if (!file) throw new Error('Usage: inspect artifact.json');
    const graph = await replay(await readArtifact(file));
    process.stdout.write(`${canonical({ head: graph.artifact.head, nodes: [...graph.nodes.values()], edges: [...graph.edges.values()] })}\n`);
  } else throw new Error('Commands: demo | ingest argument.txt [artifact.json] [--accept-formalization] | check artifact.json | inspect artifact.json');
}
main().catch(error => { process.stderr.write(`${(error as Error).message}\n`); process.exitCode = 1; });
