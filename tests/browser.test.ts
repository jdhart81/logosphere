import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { webcrypto } from 'node:crypto';
import { captureVisiblePage } from '../packages/observation/src/dom.js';

test('I9: bounded capture excludes private, editable, hidden and offscreen DOM', () => {
  const dom = new JSDOM('<body><p>Visible claim</p><input value="FORM_SECRET"><textarea>TEXTAREA_SECRET</textarea><div contenteditable="true">EDITABLE_SECRET</div><div hidden>HIDDEN_SECRET</div><div aria-hidden="true">ARIA_SECRET</div><div data-logosphere-private>PRIVATE_SECRET</div><div style="display:none"><p>CSS_SECRET</p></div><p id="offscreen">OFFSCREEN_SECRET</p></body>', { url: 'https://example.com/story?token=secret#private', runScripts: 'outside-only' });
  const w = dom.window;
  w.Range.prototype.getClientRects = function () {
    const offscreen = (this.startContainer.parentElement?.id === 'offscreen');
    return [{ width: 100, height: 20, left: 0, top: offscreen ? 2000 : 0, right: 100, bottom: offscreen ? 2020 : 20 }] as unknown as DOMRectList;
  };
  const result = w.eval(`(${captureVisiblePage.toString()})()`) as { text: string; url: string };
  assert.equal(result.text, 'Visible claim'); assert.equal(result.url, 'https://example.com/story');
  const paragraph = w.document.createElement('p'); paragraph.textContent = 'x'.repeat(15_000); w.document.body.append(paragraph);
  const bounded = w.eval(`(${captureVisiblePage.toString()})()`) as { text: string; truncated: boolean };
  assert.equal(bounded.text.length, 12_000); assert.equal(bounded.truncated, true); dom.window.close();
});
test('selected capture clips to the selected visible text range', () => {
  const dom = new JSDOM('<body><p>Before selected after</p><p>Other paragraph</p></body>', { url: 'https://example.com/', runScripts: 'outside-only' });
  const w = dom.window; const node = w.document.querySelector('p')!.firstChild!;
  w.Range.prototype.getClientRects = () => [{ width: 100, height: 20, left: 0, top: 0, right: 100, bottom: 20 }] as unknown as DOMRectList;
  const range = w.document.createRange(); range.setStart(node, 7); range.setEnd(node, 15); w.getSelection()!.addRange(range);
  assert.equal((w.eval(`(${captureVisiblePage.toString()})()`) as { text: string }).text, 'selected'); w.close();
});
test('packaged extension has no ambient page access, background capture, remote script or persistence permissions', async () => {
  const manifest = JSON.parse(await readFile('dist/extension/manifest.json', 'utf8'));
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting']); assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined); assert.deepEqual(manifest.background, { service_worker: 'launcher.js' }); assert.equal(manifest.incognito, 'not_allowed');
  const script = await readFile('dist/extension/popup.js', 'utf8');
  assert.doesNotMatch(script, /captureVisibleTab|chrome\.storage|localStorage|MutationObserver/);
  const launcher = await readFile('dist/extension/launcher.js', 'utf8');
  assert.doesNotMatch(launcher, /fetch\(|executeScript|chrome\.storage|MutationObserver/);
});
test('capture preserves sentence structure across inline markup', () => {
  const dom = new JSDOM('<body><p>Assumption: If <strong>P</strong>, then <em>Q</em>.</p><p>Premise: <b>P</b>.</p><p>Therefore: Q.</p><p><span>Two</span> <em>words</em>.</p></body>', { url: 'https://example.com/', runScripts: 'outside-only' });
  const w = dom.window;
  w.Range.prototype.getClientRects = () => [{ width: 100, height: 20, left: 0, top: 0, right: 100, bottom: 20 }] as unknown as DOMRectList;
  const result = w.eval(`(${captureVisiblePage.toString()})()`) as { text: string };
  assert.equal(result.text, 'Assumption: If P, then Q.\nPremise: P.\nTherefore: Q.\nTwo words.'); w.close();
});
test('packaged browser UI previews, accepts, traces, challenges and forgets the same graph', async () => {
  const dom = new JSDOM(await readFile('dist/extension/popup.html', 'utf8'), { url: 'https://extension.test/', runScripts: 'outside-only' });
  const w = dom.window;
  Object.defineProperty(w, 'crypto', { value: webcrypto }); Object.defineProperty(w, 'TextEncoder', { value: TextEncoder });
  Object.defineProperty(w, 'structuredClone', { value: structuredClone });
  Object.defineProperty(w, 'chrome', { value: { runtime: { id: 'a'.repeat(32) }, permissions: { request: async () => false } } });
  w.eval(await readFile('dist/extension/popup.js', 'utf8'));
  const click = (name: string) => (w.document.getElementById(name) as HTMLButtonElement).click();
  const until = async (condition: () => boolean) => {
    const deadline = Date.now() + 5000;
    while (!condition()) { if (Date.now() > deadline) throw new Error(`UI did not settle: ${w.document.getElementById('status')!.textContent}`); await new Promise(resolve => setTimeout(resolve, 10)); }
  };
  const state = () => w.document.getElementById('status')!.textContent ?? '';
  try {
    assert.match(state(), /Nothing has been captured/);
    click('example'); await until(() => /Synthetic example loaded/.test(state()));
    click('preview'); await until(() => /Candidate graph ready/.test(state()));
    assert.equal(w.document.querySelectorAll('.node').length, 3); assert.equal(w.document.querySelectorAll('.edge').length, 1);
    assert.match(w.document.getElementById('graph')!.textContent!, /proposed/);
    click('accept'); await until(() => /Graph created/.test(state()));
    assert.match(w.document.getElementById('graph')!.textContent!, /UNRESOLVED/);
    assert.match(w.document.getElementById('graph')!.textContent!, /ASSUMPTION/);
    assert.equal((w.document.getElementById('capture') as HTMLButtonElement).disabled, true);
    (w.document.getElementById('token') as HTMLInputElement).value = 'a'.repeat(64);
    click('verify'); await until(() => /access was not granted/.test(state()));
    assert.equal(w.document.querySelectorAll('.node').length, 3);
    (w.document.querySelector('.node button') as HTMLButtonElement).click();
    (w.document.querySelector('.node .challenge-editor textarea') as HTMLTextAreaElement).value = 'The sensor may be uncalibrated.';
    (w.document.querySelector('.node .challenge-editor button') as HTMLButtonElement).click(); await until(() => /Challenge appended/.test(state()));
    assert.match(w.document.getElementById('graph')!.textContent!, /uncalibrated/);
    click('clear'); await until(() => /Session data forgotten/.test(state()));
    assert.equal(w.document.querySelectorAll('.node').length, 0); assert.equal((w.document.getElementById('input') as HTMLTextAreaElement).value, '');
  } finally { w.close(); }
});
