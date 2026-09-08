import { append, canonical, ChallengeSchema, edgeStatus, id, replay, trace, type Artifact, type Graph } from '../../packages/reasoning-core/src/core.js';
import { captureVisiblePage } from '../../packages/observation/src/dom.js';
import { DEMO, ingest, type Capture } from '../../packages/observation/src/extract.js';

const $ = <T extends HTMLElement>(name: string) => document.getElementById(name) as T;
const actor = { id: 'human:browser-user', kind: 'human' as const };
const requestedTab = new URL(location.href).searchParams.get('sourceTab');
const sourceTabId = requestedTab && /^\d+$/.test(requestedTab) ? Number(requestedTab) : null;
let capture: Capture | null = null; let draft: Artifact | null = null; let artifact: Artifact | null = null;
let busy = false;
const reproduced = new Set<string>();
const status = (message: string) => { $('status').textContent = message; };
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; return el; }
function details(title: string, data: unknown): HTMLDetailsElement { const el = element('details'); el.append(element('summary', title), element('pre', typeof data === 'string' ? data : JSON.stringify(data, null, 2))); return el; }
function controls(): void {
  document.querySelectorAll('button').forEach(button => { button.disabled = busy; });
  for (const name of ['capture', 'example', 'preview']) $<HTMLButtonElement>(name).disabled = busy || artifact !== null;
  $<HTMLTextAreaElement>('input').disabled = busy || artifact !== null;
  $<HTMLInputElement>('import').disabled = busy || artifact !== null;
  $<HTMLButtonElement>('accept').disabled = busy || !draft || artifact !== null;
  for (const name of ['verify', 'export']) $<HTMLButtonElement>(name).disabled = busy || artifact === null;
}
async function show(input: Artifact, preview = false): Promise<void> {
  const graph = await replay(input); const root = $('graph'); root.replaceChildren();
  root.append(element('p', `${preview ? 'Candidate preview — mapping not accepted' : 'Canonical graph'} · ${graph.nodes.size} nodes · ${graph.edges.size} inference(s)`));
  if (!graph.edges.size) root.append(element('p', 'No supported inference was identified. These claims remain unresolved; no missing premise has been invented.'));
  for (const { value: edge } of graph.edges.values()) {
    const card = element('div'); card.className = 'edge'; card.id = edge.id;
    const state = edgeStatus(graph, edge.id, reproduced);
    card.append(element('strong', `${state.formal}${state.disputed ? ' · DISPUTED' : ''} · ${edge.rule}`));
    if (state.reported && state.formal === 'UNVERIFIED') card.append(element('p', `Reported receipt: ${state.reported}; not reproduced in this session.`));
    card.append(element('p', state.scope));
    const list = element('ul');
    for (const [label, ids] of [['Premise', edge.premises], ['Assumption', edge.assumptions], ['Conclusion', [edge.conclusion]]] as const) for (const nodeId of ids) {
      const li = element('li'); const a = element('a', `${label}: ${graph.nodes.get(nodeId)!.value.text}`); a.href = `#${nodeId}`; li.append(a); list.append(li);
    }
    card.append(list, details('Complete backward trace and change dependencies', trace(graph, edge.conclusion, reproduced)));
    for (const { value: receipt } of graph.verifications.values()) if (receipt.edgeId === edge.id) card.append(details(`${receipt.status} receipt: ${receipt.reason}`, receipt), details('Generated Lean source', receipt.source));
    if (!preview) card.append(challengeEditor(edge.id, 'inference'));
    root.append(card);
  }
  for (const entry of graph.nodes.values()) {
    const node = entry.value; const card = element('div'); card.className = `node ${node.kind}`; card.id = node.id;
    card.append(element('strong', `${node.kind.toUpperCase()} · ${node.epistemic}`), element('p', node.text));
    card.append(element('p', `Evidence: ${[...graph.evidence.values()].filter(e => e.value.targetId === node.id).map(e => e.value.status).join(', ') || 'UNRESOLVED — no evidence assessment attached'}`));
    if (node.formalization) card.append(details(`Symbol mapping · ${node.formalization.review}`, node.formalization));
    else card.append(element('p', 'Formalization: not available.'));
    card.append(details('Provenance and immutable identifier', entry));
    if (!preview) card.append(challengeEditor(node.id, node.kind === 'claim' ? 'interpretation' : node.kind)); root.append(card);
    for (const evidence of graph.evidence.values()) if (evidence.value.targetId === node.id) {
      const assessment = details('Evidence assessment and provenance', evidence);
      if (!preview) assessment.append(challengeEditor(evidence.value.id, 'evidence'));
      card.append(assessment);
    }
  }
  for (const challenge of graph.challenges.values()) { const note = element('p', `Challenge to ${challenge.value.targetId}: ${challenge.value.reason}`); note.className = 'challenge'; root.append(note); }
  for (const source of graph.sources.values()) {
    if (source.value.provenance.note.includes('not modeled')) root.prepend(element('p', source.value.provenance.note));
    const sourceDetails = details('Captured source and exact provenance', source);
    if (!preview) sourceDetails.append(challengeEditor(source.value.id, 'source'));
    root.append(sourceDetails);
  }
  root.append(details('Artifact head', graph.artifact.head)); controls();
}
function challengeEditor(targetId: string, aspect: typeof ChallengeSchema.shape.aspect.options[number]): HTMLDivElement {
  const container = element('div');
  const button = element('button', 'Challenge this component');
  const form = element('div'); form.hidden = true; form.className = 'challenge-editor';
  const label = element('label', 'What is disputed?'); const input = element('textarea'); input.rows = 3; input.maxLength = 12000;
  input.id = `challenge-${targetId}`; label.htmlFor = input.id;
  const aspectLabel = element('label', 'Challenge aspect'); const select = element('select'); select.id = `aspect-${targetId}`; aspectLabel.htmlFor = select.id;
  for (const name of ChallengeSchema.shape.aspect.options) { const option = element('option', name); option.value = name; select.append(option); }
  select.value = aspect;
  const record = element('button', 'Record challenge');
  button.onclick = () => { form.hidden = !form.hidden; if (!form.hidden) input.focus(); };
  record.onclick = () => { void guarded(async () => {
    const reason = input.value.trim();
    if (!reason || !artifact) throw new Error('Describe the disputed component before recording a challenge.');
    artifact = await append(artifact, actor, [{ type: 'challenge', value: { id: id(), targetId, aspect: ChallengeSchema.shape.aspect.parse(select.value), reason, provenance: { method: 'human', sources: [], note: 'Browser user challenge; prior reasoning retained.' } } }]);
    await show(artifact); status('Challenge appended. The original reasoning remains intact.');
  }); };
  form.append(label, input, aspectLabel, select, record); container.append(button, form); return container;
}
async function guarded(action: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true; controls();
  try { await action(); } catch (error) { status((error as Error).message); }
  finally { busy = false; controls(); }
}
function on(name: string, action: () => Promise<void>): void { $(name).addEventListener('click', () => { void guarded(action); }); }
function currentCapture(): Capture {
  const text = $<HTMLTextAreaElement>('input').value;
  if (capture && text === capture.text) return capture;
  return { text, title: 'User-supplied or edited argument', mode: 'supplied', truncated: false, capturedAt: new Date().toISOString() };
}
on('capture', async () => {
  status('Capturing bounded visible text now…');
  const tab = sourceTabId === null ? (await chrome.tabs.query({ active: true, currentWindow: true }))[0] : await chrome.tabs.get(sourceTabId);
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) throw new Error('Open an HTTP or HTTPS webpage to capture.');
  const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureVisiblePage });
  capture = results[0]?.result ?? null;
  if (!capture?.text) throw new Error('No readable visible text was found. You can supply an argument manually.');
  $<HTMLTextAreaElement>('input').value = capture.text; draft = null; controls();
  status(`Capture complete; observation is off. ${capture.text.length} characters${capture.truncated ? ' (truncated)' : ''}. Preview before accepting.`);
});
on('example', async () => {
  capture = { text: DEMO, title: 'Synthetic reservoir example — not real evidence', mode: 'supplied', truncated: false, capturedAt: new Date().toISOString() };
  $<HTMLTextAreaElement>('input').value = DEMO; draft = null; controls(); status('Synthetic example loaded. Preview its mapping before accepting.');
});
$('input').addEventListener('input', () => { draft = null; controls(); status('Text changed. Preview again to review the current mapping.'); });
on('preview', async () => { draft = await ingest(currentCapture(), actor); await show(draft, true); status('Candidate graph ready for review. Premise truth remains unresolved.'); });
on('accept', async () => { if (!draft) throw new Error('Preview the current text first'); artifact = await ingest(currentCapture(), actor, true); draft = null; await show(artifact); status('Graph created with your mapping acceptance. Formal inferences are unverified.'); });
on('clear', async () => { capture = null; artifact = null; draft = null; reproduced.clear(); $<HTMLTextAreaElement>('input').value = ''; $<HTMLInputElement>('token').value = ''; $<HTMLInputElement>('import').value = ''; $('graph').replaceChildren(element('p', 'No graph yet.')); controls(); status('Session data forgotten. Observation is off. Previously exported files remain under your control.'); });
$('origin').textContent = `LOGOSPHERE_EXTENSION_ORIGIN=chrome-extension://${chrome.runtime.id} npm run serve`;
on('verify', async () => {
  if (!artifact) return;
  const token = $<HTMLInputElement>('token').value.trim(); if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Paste the temporary token printed by the local service.');
  const permission = await chrome.permissions.request({ origins: ['http://127.0.0.1/*'] });
  if (!permission) throw new Error('Local verifier access was not granted. The graph remains available locally.');
  status('Local Lean verification in progress…');
  const graph: Graph = await replay(artifact);
  for (const edgeId of graph.edges.keys()) {
    const before = artifact;
    const response = await fetch('http://127.0.0.1:4318/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ artifact, edgeId }), signal: AbortSignal.timeout(30_000), credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error(`Local verifier returned ${response.status}. Check pairing origin and token.`);
    const result = await response.json() as { artifact: unknown; receiptId: string };
    const checked = await replay(result.artifact);
    if (checked.artifact.graphId !== before.graphId || checked.artifact.events.length !== before.events.length + 1 || canonical(checked.artifact.events.slice(0, before.events.length)) !== canonical(before.events)) throw new Error('Verifier response did not preserve graph history');
    const last = checked.artifact.events.at(-1)!;
    if (last.additions.length !== 1 || last.additions[0]?.type !== 'verification' || last.additions[0].value.edgeId !== edgeId || last.additions[0].value.id !== result.receiptId) throw new Error('Unexpected verifier response');
    artifact = checked.artifact; reproduced.add(result.receiptId);
  }
  await show(artifact); status(graph.edges.size ? 'Local verification completed. Inspect each conditional result and its premises below.' : 'No formalizable inference edges are present.');
});
on('export', async () => {
  if (!artifact) return; await replay(artifact);
  const url = URL.createObjectURL(new Blob([canonical(artifact)], { type: 'application/json' }));
  const a = element('a'); a.href = url; a.download = `logosphere-${artifact.graphId}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('Artifact exported, including captured text and provenance.');
});
$('import').addEventListener('change', () => { void guarded(async () => {
  if (artifact) throw new Error('Forget the current session before importing another artifact.');
  const file = $<HTMLInputElement>('import').files?.[0]; if (!file) return;
  if (file.size > 2_000_000) throw new Error('Artifact exceeds 2 MB');
  artifact = (await replay(JSON.parse(await file.text()))).artifact; draft = null; reproduced.clear(); await show(artifact);
  status('Artifact integrity checked. Imported proof receipts have not been reproduced in this session.');
}); });
controls();
