'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sanitize,replaceBlock,findBlock,scanBlocks,auditPage}=require('../lib/html');

test('sanitize keeps allowed inline markup as written',()=>{
  const s='Ask <strong>why</strong>, see <a class="x" href="tastemake.html">Tastemake</a> &amp; <em>more</em>.';
  assert.equal(sanitize(s),s);
});

test('sanitize removes scripts, styles, event handlers and unsafe links',()=>{
  assert.equal(sanitize('Hi<script>alert(1)</script> there'),'Hi there');
  assert.equal(sanitize('<span onclick="x()">t</span>'),'<span>t</span>');
  assert.equal(sanitize('<a href="javascript:alert(1)">bad</a>'),'bad');
  assert.equal(sanitize('<a href="//evil.example">x</a>'),'x');
  assert.equal(sanitize('<a href="https://ok.example" target="_top" rel="opener">ok</a>'),'<a href="https://ok.example">ok</a>');
  assert.equal(sanitize('<img src=x onerror=alert(1)>text'),'text');
});

test('sanitize unwraps browser editing leftovers and balances tags',()=>{
  assert.equal(sanitize('<div>one</div><font color="red">two</font>'),'onetwo');
  assert.equal(sanitize('<b>open'),'<b>open</b>');
  assert.equal(sanitize('a < b & c'),'a &lt; b &amp; c');
  assert.equal(sanitize('line<br/>break'),'line<br>break');
});

test('list blocks keep their items; paragraphs do not',()=>{
  assert.equal(sanitize('<li>a</li><li>b</li>','list'),'<li>a</li><li>b</li>');
  assert.equal(sanitize('<li>a</li>','inline'),'a');
});

const PAGE='<main><h2 class="t" data-edit="p-1">Old <em>title</em></h2>\n<p data-edit="p-2">Keep me</p></main>';

test('replaceBlock changes only the chosen block',()=>{
  const r=replaceBlock(PAGE,'p-1','New <em>title</em><script>x</script>');
  assert.equal(r.changed,true);
  assert.equal(r.src,'<main><h2 class="t" data-edit="p-1">New <em>title</em></h2>\n<p data-edit="p-2">Keep me</p></main>');
});

test('replaceBlock reports no change, empty blocks, and missing blocks',()=>{
  assert.equal(replaceBlock(PAGE,'p-2','Keep me').changed,false);
  assert.match(replaceBlock(PAGE,'p-2','  <br> ').error,/empty/);
  assert.match(replaceBlock(PAGE,'p-9','x').error,/no longer/);
  assert.match(replaceBlock(PAGE+PAGE,'p-2','x').error,/more than once/);
});

test('findBlock handles nested elements of the same tag',()=>{
  const src='<div data-edit="d-1">a <span>b <span>c</span></span> d</div><p>after</p>';
  assert.equal(findBlock(src,'d-1').inner,'a <span>b <span>c</span></span> d');
});

test('scanBlocks leaves navigation, diagrams, the Library and link rows out of scope',()=>{
  const src=`<nav><p>nav</p></nav><div class="topbar"><p>top</p></div>
<section data-page="home"><p>Copy</p><div class="row"><a href="a.html">Go</a></div>
<figure><p>diagram</p></figure><div aria-hidden="true"><p>decor</p></div>
<ul><li><h3>Item</h3><p>Body</p></li></ul></section>
<section id="learn" data-page="learn"><p>Library</p></section>`;
  const inScope=scanBlocks(src).filter(b=>b.inScope).map(b=>b.inner);
  assert.deepEqual(inScope,['Copy','Item','Body']);
});

test('auditPage finds unmarked copy, duplicates, and unsafe markers',()=>{
  const a=auditPage('<p data-edit="x-1">a</p><p data-edit="x-1">b</p><p>c</p><p data-edit="x-2">d<span aria-hidden="true">→</span></p>');
  assert.deepEqual(a.duplicates,['x-1']);
  assert.equal(a.missing.length,1);
  assert.equal(a.unsafe.length,1);
});

test('browser styling spans are unwrapped, so un-bolding never turns headline text pink',()=>{
  assert.equal(sanitize('Making <span style="font-weight: normal;">AI</span> useful <span>human judgment.</span>'),'Making AI useful <span>human judgment.</span>');
  assert.equal(sanitize('<span class="accent" style="color:red">kept</span>'),'<span class="accent">kept</span>');
});
