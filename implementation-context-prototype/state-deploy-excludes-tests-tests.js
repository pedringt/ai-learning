// #622: the State Vercel project deploys this folder as-is. .vercelignore keeps tests, the test-only CSS reader
// and notes off the public site, and must never hide a file the app loads.
const assert=require('assert');
const fs=require('fs');
const path=require('path');

const dir=__dirname;
const patterns=fs.readFileSync(path.join(dir,'.vercelignore'),'utf8').split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));
const toRegex=glob=>new RegExp('^'+glob.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'[^/]*')+'$');
const ignored=name=>patterns.some(p=>toRegex(p).test(name));

const files=fs.readdirSync(dir).filter(f=>fs.statSync(path.join(dir,f)).isFile());
for(const f of files.filter(f=>/-tests\.js$/.test(f)))assert.ok(ignored(f),'test file would deploy: '+f);
assert.ok(ignored('state-layer-css.js'),'the test-only CSS reader would deploy');

// Everything the shipped pages and scripts reference must still deploy.
const shipped=files.filter(f=>!ignored(f)&&/\.(html|js|css|json)$/.test(f));
const text=shipped.map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n');
const loaded=files.filter(f=>f!=='vercel.json'&&text.includes(f)&&!/-tests\.js$/.test(f));
const hidden=loaded.filter(ignored).filter(f=>f!=='state-layer-css.js');
assert.deepStrictEqual(hidden,[],'files the app references are ignored: '+hidden.join(', '));
assert.ok(!ignored('index.html')&&!ignored('vercel.json')&&!ignored('state-app.css'));
console.log('State deploy excludes tests: '+files.filter(ignored).length+' files kept out, '+(files.length-files.filter(ignored).length)+' deployed');
