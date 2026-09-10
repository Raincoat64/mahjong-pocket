const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../dist');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
let release='a',broken=false;
const activated=new Set();
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),scope=url.pathname.startsWith('/other/')?'other':'app';
 if(url.pathname.endsWith('/test-activated')){activated.add(scope+':'+url.searchParams.get('build'));res.end('ok');return;}
 const relative=url.pathname.replace(/^\/(app|other)\//,'')||'index.html';
 const file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
 let data=fs.readFileSync(file);
 if(relative==='index.html')data=String(data).replace('</head>',`<script>window.__release=${JSON.stringify(release)}</script></head>`);
 if(relative==='sw.js'){
  data=String(data).replace(/const CACHE = PREFIX \+ ".*?";/,`const CACHE = PREFIX + ${JSON.stringify('test-'+release+(broken?'-bad':''))};`)
   .replace('await self.clients.claim();',`await self.clients.claim(); await fetch('./test-activated?build=${release}');`);
  if(broken)data=data.replace('const FILES = [',"const FILES = ['./offline-probe-missing',");
 }
 res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');res.setHeader('Cache-Control','no-store');res.end(data);
});
const waitUntil=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out waiting for worker activation');};
async function saved(page){return page.evaluate(()=>new Promise((resolve,reject)=>{
 const req=indexedDB.open('mahjong-pocket-preview',1);req.onerror=()=>reject(req.error);
 req.onsuccess=()=>{const db=req.result,tx=db.transaction('save'),read=tx.objectStore('save').get('current-match');tx.oncomplete=()=>{db.close();resolve(read.result);};};
}));}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await webkit.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const base=`http://127.0.0.1:${server.address().port}`;
  let page=await context.newPage();await page.goto(base+'/app/');
  await page.locator('[data-offline-status="ready"]').waitFor();
  assert.equal(await page.evaluate(()=>window.__release),'a');
  const other=await context.newPage();await other.goto(base+'/other/');await other.locator('[data-offline-status="ready"]').waitFor();
  await page.bringToFront();
  await page.locator('[data-start="single"]').click();await page.locator('#pauseBtn').click();
  await page.getByRole('dialog',{name:'中断中'}).waitFor();const before=await saved(page);
  release='b';await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
  assert.equal(await page.evaluate(()=>window.__release),'a','active hand never reloads for update');
  assert.equal(await saved(page),before);
  await page.close();await waitUntil(()=>activated.has('app:b'));
  page=await context.newPage();await page.goto(base+'/app/');
  await page.getByRole('dialog',{name:'中断中'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__release),'b');
  assert.equal(await saved(page),before,'save unchanged after app version activation');
  const keys=await page.evaluate(()=>caches.keys());
  assert.ok(keys.some(k=>k.includes(encodeURIComponent(base+'/other/'))&&k.endsWith('test-a')),'other scope cache preserved');
  assert.ok(!keys.some(k=>k.includes(encodeURIComponent(base+'/app/'))&&k.endsWith('test-a')),'own obsolete cache removed');
  await context.close();
  broken=true;release='c';
  const failedContext=await browser.newContext({viewport:{width:390,height:844}}),failure=await failedContext.newPage();
  await failure.goto(base+'/app/');await failure.locator('[data-offline-status="unavailable"]').waitFor();
  await failure.getByRole('button',{name:'オフラインの準備を確認'}).click();
  broken=false;await failure.getByRole('button',{name:'準備を再試行'}).click();
  await failure.locator('[data-offline-status="ready"]').waitFor();
  await failedContext.close();
  console.log('PASS: complete-cache readiness, failed precache UI/retry, waiting update with no reload, exact save after activation, cache isolation between scopes.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
