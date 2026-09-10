const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browserType = playwright[process.env.TEST_BROWSER || 'chromium'];
const react = process.env.TEST_REACT === '1';
const base = process.env.TEST_BASE || '/';
assert.match(base, /^\/(?:[a-z0-9-]+\/)*$/i, 'TEST_BASE must be a directory path with trailing slash');
const parentWorker = process.env.TEST_PARENT_WORKER === '1';
const root = path.resolve(__dirname, react?'../dist':'../playable-preview');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server = http.createServer((req,res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if(parentWorker && pathname === '/parent-worker.js') {res.setHeader('Content-Type','text/javascript');res.end("self.addEventListener('activate', event=>event.waitUntil(self.clients.claim()));");return;}
  if(parentWorker && pathname === '/parent.html') {res.setHeader('Content-Type','text/html');res.end('<title>Parent scope fixture</title>');return;}
  if(!pathname.startsWith(base)){res.writeHead(404).end();return;}
  const name = '/' + pathname.slice(base.length);
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep)) {res.writeHead(403).end(); return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');res.end(data);});
});
async function saved(page) {
  return page.evaluate(() => new Promise((resolve,reject) => {
    const req=indexedDB.open('mahjong-pocket-preview',1);
    req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{
      const db=req.result, read=db.transaction('save').objectStore('save').get('current-match');
      read.onsuccess=()=>{db.close();resolve(read.result);};
      read.onerror=()=>{db.close();reject(read.error);};
    };
  }));
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await browserType.launch({headless:true, ...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
    const page=await context.newPage();
    const errors=[]; const external=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',req=>{if(!req.url().startsWith('http://127.0.0.1:'))external.push(req.url());});
    const origin=`http://127.0.0.1:${server.address().port}`;
    if(parentWorker){
      await page.goto(origin+'/parent.html');
      await page.evaluate(async()=>{await navigator.serviceWorker.register('/parent-worker.js',{scope:'/'});await navigator.serviceWorker.ready;});
    }
    await page.goto(origin+base);
    if(react)await page.locator('[data-offline-status="ready"]').waitFor();
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.waitForFunction(expected=>navigator.serviceWorker.controller?.scriptURL===expected,origin+base+'sw.js');
    assert.equal(await page.evaluate(async()=>{
      const manifest=await (await fetch('./manifest.webmanifest')).json();
      return new URL(manifest.start_url,location.href).href;
    }),origin+base,'manifest opens the project path');
    assert.equal(await page.evaluate(async()=> (await navigator.serviceWorker.getRegistration('./')).scope),origin+base);
    await page.locator('[data-start="single"]').click();
    await page.waitForFunction(()=>document.querySelector('#tableScreen')?.classList.contains('active') || document.querySelector('#pauseBtn')?.getBoundingClientRect().width > 0);
    await page.locator('#pauseBtn').click();
    const pauseDialog = react?page.getByRole('dialog',{name:'中断中'}):page.locator('#pauseOverlay.show');
    await pauseDialog.waitFor();
    assert.equal(await page.locator('#table').evaluate(el=>getComputedStyle(el).display), 'flex');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight <= 900), 'portrait table must fit viewport');
    const before=JSON.parse(await saved(page));
    assert.equal(before.paused,true);
    if(process.env.OFFLINE_BY_SERVER==='1') await new Promise(resolve=>server.close(resolve));
    else await context.setOffline(true);
    await page.reload();
    await pauseDialog.waitFor();
    const after=JSON.parse(await saved(page));
    assert.deepEqual(after,before);
    await page.locator('#continueBtn').click();
    await pauseDialog.waitFor({state:'hidden'});
    await page.locator('#pauseBtn').click();
    await pauseDialog.waitFor();
    fs.mkdirSync(path.resolve(__dirname,'../test-results'),{recursive:true});
    await page.screenshot({path:path.resolve(__dirname,`../test-results/${react?'react-':''}offline-resume.png`),fullPage:true});
    assert.deepEqual(errors,[]);
    assert.deepEqual(external,[]);
    console.log(`PASS: local-only assets, own service-worker scope ${base}, manifest, pause, exact offline reload restoration, paced resume; no page errors${parentWorker?', with an existing parent-scope worker':''}.`);
  } finally {if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
