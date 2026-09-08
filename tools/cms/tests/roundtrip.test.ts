import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Give Tiptap a DOM. Must run before importing @tiptap/core.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
const g = globalThis as any;
g.window = dom.window;
g.document = dom.window.document;
g.navigator ??= dom.window.navigator;
for (const key of ['DOMParser','Node','Element','HTMLElement','Text','getComputedStyle','MutationObserver']) g[key] ??= (dom.window as any)[key];

const { Editor } = await import('@tiptap/core');
const { articleExtensions } = await import('../editor/extensions.js');

function editor() {
  return new Editor({ element: dom.window.document.createElement('div'), extensions: articleExtensions() });
}
// Load markdown into the editor and read it back out, exactly as the CMS does on open + save.
function roundtrip(markdown: string): string {
  const e = editor();
  e.commands.setContent(markdown, { contentType: 'markdown' } as any);
  const out = (e as any).getMarkdown();
  e.destroy();
  return out;
}

test('standard Markdown and GFM survive a save/reload round-trip', () => {
  for (const md of [
    '# Heading\n',
    '**bold** and *italic* and `code`\n',
    '- one\n- two\n',
    '1. first\n2. second\n',
    '> a quote\n',
    '~~struck~~\n',
    '[link](https://example.com)\n',
    '- [ ] todo\n- [x] done\n',
  ]) {
    const once = roundtrip(md);
    assert.equal(roundtrip(once), once, `not idempotent for: ${JSON.stringify(md)} -> ${JSON.stringify(once)}`);
  }
  // Task-list checkbox syntax must be preserved, not flattened to plain bullets.
  const tasks = roundtrip('- [ ] todo\n- [x] done\n');
  assert.match(tasks, /- \[ \] todo/);
  assert.match(tasks, /- \[x\] done/);
});

test('non-Markdown marks persist as a fixed whitelist of safe semantic HTML', () => {
  const cases: [string, RegExp][] = [
    ['underline', /<u>under<\/u>/],
    ['superscript', /<sup>2<\/sup>/],
    ['subscript', /<sub>2<\/sub>/],
    ['highlight', /<mark>note<\/mark>/],
  ];
  const html = {
    underline: '<p>text <u>under</u></p>',
    superscript: '<p>x<sup>2</sup></p>',
    subscript: '<p>H<sub>2</sub>O</p>',
    highlight: '<p>a <mark>note</mark></p>',
  } as const;
  for (const [name, expected] of cases) {
    const e = editor();
    e.commands.setContent((html as any)[name], { contentType: 'html' } as any);
    const md = (e as any).getMarkdown();
    e.destroy();
    assert.match(md, expected, `${name} did not serialize to expected HTML tag: ${md}`);
    // Reloading the serialized output preserves the tag (parseHTML round-trip).
    assert.match(roundtrip(md), expected, `${name} did not survive reload: ${roundtrip(md)}`);
    // No inline styles, scripts, or event handlers may ever be emitted.
    assert.doesNotMatch(md, /style=|<script|on\w+=/i);
  }
});

test('text alignment persists as an align-* class, never inline style', () => {
  const e = editor();
  e.commands.setContent('<p class="align-center">centered</p>', { contentType: 'html' } as any);
  const md = (e as any).getMarkdown();
  e.destroy();
  assert.match(md, /align-center/, `alignment lost on serialize: ${JSON.stringify(md)}`);
  assert.doesNotMatch(md, /style=/, `alignment must not emit inline style: ${JSON.stringify(md)}`);
  assert.match(roundtrip(md), /align-center/, `alignment lost on reload: ${JSON.stringify(roundtrip(md))}`);
});
