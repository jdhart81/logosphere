import type { Capture } from './extract.js';

/** Self-contained for chrome.scripting.executeScript; never reads value/innerHTML. */
export function captureVisiblePage(): Capture {
  const limit = 12_000;
  const excluded = 'input,textarea,select,option,button,script,style,noscript,template,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"],[data-logosphere-private]';
  const selection = window.getSelection();
  const range = selection && !selection.isCollapsed && selection.rangeCount ? selection.getRangeAt(0) : null;
  const root = document.body;
  if (!root) throw new Error('Page has no readable body');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = []; let length = 0; let truncated = false; let visited = 0;
  let previousContainer: Element | null = null;
  while (walker.nextNode()) {
    if (++visited > 20_000) { truncated = true; break; }
    const node = walker.currentNode; const parent = node.parentElement;
    if (!parent || parent.closest(excluded) || !node.textContent) continue;
    let hidden = false; let container: Element | null = null;
    for (let el: Element | null = parent; el; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (!container && ['block', 'flex', 'grid', 'list-item', 'table-cell', 'table-row', 'flow-root'].includes(s.display)) container = el;
      if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || s.opacity === '0') { hidden = true; break; }
    }
    if (hidden) continue;
    if (range && !range.intersectsNode(node)) continue;
    const textRange = document.createRange(); textRange.selectNodeContents(node);
    if (range) {
      if (range.startContainer === node) textRange.setStart(node, range.startOffset);
      if (range.endContainer === node) textRange.setEnd(node, range.endOffset);
    }
    const rects = Array.from(textRange.getClientRects());
    if (!rects.some(r => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth)) continue;
    const text = textRange.toString().replace(/\s+/g, ' ');
    if (!text || (!text.trim() && (!parts.length || container !== previousContainer))) continue;
    const separator = parts.length && container !== previousContainer ? '\n' : '';
    const room = limit - length - separator.length;
    if (room <= 0) { truncated = true; break; }
    parts.push(separator + text.slice(0, room)); length += Math.min(room, text.length) + separator.length;
    previousContainer = container;
    if (text.length > room) { truncated = true; break; }
  }
  const url = new URL(location.href); url.username = ''; url.password = ''; url.search = ''; url.hash = '';
  return { text: parts.join('').trim(), title: document.title.slice(0, 500), url: url.href, mode: range ? 'selection' : 'viewport', truncated, capturedAt: new Date().toISOString() };
}
