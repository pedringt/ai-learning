#!/usr/bin/env node
/* Nov 18 QA (P1): write AI Professional Edge's rendered content into ai-professional-edge.html, so the page's text is in
   its HTML for crawlers, link previews and readers without JavaScript. content/ai-professional-edge.md stays the source
   (#263); the page's own script renders it the same way (ai-professional-edge-render.js).

   node tools/render_professional_edge.js          rewrite the marked blocks
   node tools/render_professional_edge.js --check  exit 1 if the page is out of date with the markdown (run by qa-js) */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, 'ai-professional-edge.html');
const SOURCE = path.join(ROOT, 'content', 'ai-professional-edge.md');
const { renderDocument } = require(path.join(ROOT, 'ai-professional-edge-render.js'));

function replaceBlock(html, name, inner) {
  const pattern = new RegExp(`(<!-- ${name}:begin -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!pattern.test(html)) throw new Error(`marker ${name} not found in ${path.basename(PAGE)}`);
  return html.replace(pattern, (_, begin, end) => begin + inner + end);
}

function rendered(html) {
  const doc = renderDocument(fs.readFileSync(SOURCE, 'utf8'));
  if (!doc.reviewLabel) throw new Error('no <!-- edge-review: YYYY-MM-DD --> marker in the markdown');
  let out = replaceBlock(html, 'edge-content', doc.body);
  out = replaceBlock(out, 'edge-jump', doc.jump);
  return replaceBlock(out, 'edge-note', `Reviewed ${doc.reviewLabel}.`);
}

const current = fs.readFileSync(PAGE, 'utf8');
const next = rendered(current);
if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error('ai-professional-edge.html is out of date: run node tools/render_professional_edge.js');
    process.exit(1);
  }
  console.log('ai-professional-edge.html matches content/ai-professional-edge.md');
} else {
  fs.writeFileSync(PAGE, next);
  console.log('Wrote ai-professional-edge.html from content/ai-professional-edge.md');
}
