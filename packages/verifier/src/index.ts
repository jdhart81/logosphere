import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, hash, id, verificationInput, type Formula, type Graph, type Receipt } from '../../reasoning-core/src/core.js';
import { readUtf8Bounded } from '../../storage/src/files.js';

export interface Verifier { verify(graph: Graph, edgeId: string): Promise<Receipt> }
export const TOOLCHAIN = 'leanprover/lean4:v4.28.0';
export const LEAN_ARGS = ['--threads=1', '--memory=256', '--timeout=100000', 'Proof.lean'];
type Run = { stdout: string; stderr: string; exitCode: number | null };
export type LeanOptions = { executable?: string; timeoutMs?: number };

function execute(executable: string, args: string[], cwd: string, timeoutMs: number): Promise<Run> {
  return new Promise(resolve => {
    execFile(executable, args, {
      cwd, timeout: timeoutMs, maxBuffer: 64_000, encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ELAN_TOOLCHAIN: TOOLCHAIN, LEAN_PATH: '', LEAN_SRC_PATH: '', LANG: 'C.UTF-8' },
    }, (error, stdout, stderr) => resolve({
      stdout: stdout.slice(0, 64_000), stderr: (stderr + (error ? `\n${error.message}` : '')).slice(0, 64_000),
      exitCode: error ? (typeof error.code === 'number' ? error.code : null) : 0,
    }));
  });
}

function symbols(formula: Formula): string[] {
  if (formula.op === 'atom') return [formula.name];
  if (formula.op === 'not') return symbols(formula.arg);
  return [...symbols(formula.left), ...symbols(formula.right)];
}
function formulaText(formula: Formula, names: Map<string, string>): string {
  if (formula.op === 'atom') return names.get(formula.name)!;
  if (formula.op === 'not') return `(Not ${formulaText(formula.arg, names)})`;
  return `(${formulaText(formula.left, names)} ${formula.op === 'and' ? '∧' : '→'} ${formulaText(formula.right, names)})`;
}

export function generate(graph: Graph, edgeId: string, negate = false): string | null {
  const input = verificationInput(graph, edgeId);
  const all = [...input.inputs, input.conclusion];
  if (all.some(n => n.formalization?.review !== 'accepted') || input.edge.rule === 'informal') return null;
  const premises = input.inputs.map(n => n.formalization!.formula);
  const original = input.conclusion.formalization!.formula;
  const goal: Formula = negate ? { op: 'not', arg: original } : original;
  const atoms = [...new Set([...premises, goal].flatMap(symbols))].sort();
  if (atoms.length > 64) throw new Error('Formalization atom limit exceeded');
  const names = new Map(atoms.map((a, i) => [a, `v${i}`]));
  const hypotheses = premises.map((p, i) => `(h${i} : ${formulaText(p, names)})`).join(' ');
  let proof: string;
  if (negate) {
    // A checked direct negation is sufficient for conditional refutation. No failure is treated as refutation.
    const found = premises.findIndex(p => canonical(p) === canonical(goal));
    if (found < 0) return null;
    proof = `exact h${found}`;
  } else {
    const templates = {
      modus_ponens: 'first | exact h0 h1 | exact h1 h0',
      and_intro: 'exact And.intro h0 h1', and_left: 'exact h0.left', and_right: 'exact h0.right',
      reiteration: 'exact h0',
    };
    const arity = input.edge.rule === 'modus_ponens' || input.edge.rule === 'and_intro' ? 2 : 1;
    if (premises.length !== arity) return null;
    proof = templates[input.edge.rule];
  }
  return `set_option autoImplicit false\nset_option maxRecDepth 256\nset_option maxHeartbeats 100000\n\ntheorem logosphere_check (${[...names.values()].join(' ')} : Prop) ${hypotheses} : ${formulaText(goal, names)} := by\n  ${proof}\n\n#print axioms logosphere_check\n`;
}

function inconsistent(graph: Graph, edgeId: string): boolean {
  const formulas = verificationInput(graph, edgeId).inputs.flatMap(n => n.formalization ? [n.formalization.formula] : []);
  return formulas.some(f => f.op === 'not' && formulas.some(g => canonical(g) === canonical(f.arg)));
}

export class LeanVerifier implements Verifier {
  constructor(private readonly options: LeanOptions = {}) {}

  async verify(graph: Graph, edgeId: string): Promise<Receipt> {
    const inputHash = await hash(verificationInput(graph, edgeId));
    if (!graph.artifact.head) throw new Error('Cannot verify an empty graph');
    let source = '';
    let run: Run = { stdout: '', stderr: '', exitCode: null };
    let engineVersion = 'unavailable';
    let status: Receipt['status'] = 'UNVERIFIED';
    let reason = 'An accepted formalization and supported rule with matching arity are required.';
    try { source = generate(graph, edgeId) ?? ''; }
    catch (error) { reason = `Formalization was not attempted: ${(error as Error).message}. No proof was established.`; }
    const dir = await mkdtemp(join(tmpdir(), 'logosphere-lean-'));
    try {
      if (source) {
        const executable = this.options.executable ?? 'lean';
        const timeout = this.options.timeoutMs ?? 10_000;
        const version = await execute(executable, ['--version'], dir, timeout);
        engineVersion = (version.stdout.trim() || version.stderr.trim()).slice(0, 500);
        if (version.exitCode !== 0 || !/^Lean \(version 4\.28\.0,/.test(engineVersion)) {
          run = version; reason = 'Pinned Lean 4.28.0 is unavailable; no proof was established.';
        } else {
          await writeFile(join(dir, 'Proof.lean'), source, { mode: 0o600 });
          run = await execute(executable, LEAN_ARGS, dir, timeout);
          const axiomFree = (r: Run) => r.exitCode === 0 && /'logosphere_check' does not depend on any axioms/.test(r.stdout) && !/sorry|axiom\s*\[/i.test(r.stdout + r.stderr);
          if (axiomFree(run)) {
            status = 'PROVEN'; reason = 'Lean checked the declared inference from its stated hypotheses. Premise truth and language-to-symbol translation remain separate.';
          } else {
            reason = 'The bounded proof attempt did not establish this inference. Failure is not falsity.';
            const refutation = generate(graph, edgeId, true);
            if (refutation) {
              await writeFile(join(dir, 'Proof.lean'), refutation, { mode: 0o600 });
              const negativeRun = await execute(executable, LEAN_ARGS, dir, timeout);
              if (axiomFree(negativeRun)) {
                source = refutation; run = negativeRun; status = 'REFUTED';
                reason = 'Lean checked the negation of this conclusion under the same declared hypotheses; this is a conditional refutation, not empirical falsity.';
              }
            }
          }
        }
      }
      if (inconsistent(graph, edgeId)) reason += ' WARNING: directly contradictory input formulas are present; these hypotheses cannot jointly hold.';
      return {
        id: id(), edgeId, inputHash, basisHead: graph.artifact.head, engine: 'lean4', adapterVersion: 'logosphere-lean/1', toolchain: TOOLCHAIN, engineVersion,
        invocation: { command: 'lean', args: [...LEAN_ARGS] },
        status, reason, source, sourceHash: await hash(source), theorem: 'logosphere_check',
        ...run, axioms: status === 'UNVERIFIED' ? null : [], provenance: { method: 'verification', sources: [], note: 'Generated source only. Runtime binary and semantic interpretation remain separate trust boundaries.' },
      };
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
}

/** Never executes receipt.source. Imported execution claims must be reproduced. */
export async function reproduce(graph: Graph, receiptId: string, verifier: Verifier = new LeanVerifier()) {
  const recorded = graph.verifications.get(receiptId)?.value;
  if (!recorded) throw new Error('Unknown receipt');
  if (recorded.engine !== 'lean4' || recorded.adapterVersion !== 'logosphere-lean/1' || recorded.theorem !== 'logosphere_check' || canonical(recorded.invocation) !== canonical({ command: 'lean', args: LEAN_ARGS })) throw new Error('Unsupported proof engine, adapter or invocation');
  const regenerated = generate(graph, recorded.edgeId, recorded.status === 'REFUTED') ?? '';
  if (regenerated !== recorded.source || await hash(regenerated) !== recorded.sourceHash) throw new Error('Receipt source does not match safe regeneration');
  const fresh = await verifier.verify(graph, recorded.edgeId);
  const commit = (version: string) => /commit ([a-f0-9]+)/.exec(version)?.[1];
  return { matches: fresh.status === recorded.status && fresh.sourceHash === recorded.sourceHash && fresh.inputHash === recorded.inputHash && fresh.toolchain === recorded.toolchain && !!commit(fresh.engineVersion) && commit(fresh.engineVersion) === commit(recorded.engineVersion),
    sameRuntimeDescription: fresh.engineVersion === recorded.engineVersion, recorded, fresh };
}

export async function readArtifact(path: string): Promise<unknown> {
  const data = await readUtf8Bounded(path);
  return JSON.parse(data);
}
