const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 let server;
 let url=process.env.TEST_URL||'http://127.0.0.1:4174/';
 if(process.env.TEST_OFFLINE==='1'){
  const root=path.resolve(__dirname,'../dist');
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
  server=require('node:http').createServer((req,res)=>{
   const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
   if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
   fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');res.end(data);});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}/`;
 }
 const browser=await webkit.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  // Keep all real actions/render/save code; shorten only presentation delays.
  await page.addInitScript(()=>{const timeout=window.setTimeout;window.setTimeout=(callback,delay,...args)=>timeout(callback,[90,120,360,1150].includes(delay)?15:delay,...args);});
  await page.goto(url);
  if(server){
   await page.locator('[data-offline-status="ready"]').waitFor();
   await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
   await new Promise(resolve=>server.close(resolve));
   await page.reload();await page.locator('[data-start="single"]').waitFor();
  }
  await page.locator('[data-start="single"]').click();
  let operations=0,result=false;
  for(let i=0;i<1200;i++){
   const decision=await page.evaluate(()=>{
    const buttons=[...document.querySelectorAll('button')].filter(b=>!b.disabled&&b.getBoundingClientRect().width>0);
    const dialog=document.querySelector('[role="dialog"]');
    if(dialog?.getAttribute('aria-label')==='対局結果')return {result:true};
    if(dialog?.getAttribute('aria-label')==='保存の確認')return {error:dialog.textContent};
    const target=buttons.find(b=>['ロン','ツモ'].includes(b.textContent.trim()))
      ||(dialog?[...dialog.querySelectorAll('button')].find(b=>!b.disabled&&/^ポン|^チー/.test(b.textContent))||[...dialog.querySelectorAll('button')].find(b=>!b.disabled&&b.textContent==='鳴かない'):null)
      ||document.querySelector('.tile-btn.recommended:not(:disabled)')||document.querySelector('.tile-btn:not(:disabled)');
    if(!target)return {};
    target.setAttribute('data-test-choice','yes');return {tile:target.classList.contains('tile-btn'),action:true};
   });
   if(decision.error)throw Error(decision.error);
   if(decision.result){result=true;break;}
   if(decision.action){
    const target=page.locator('[data-test-choice="yes"]');
    await target.click();
    if(decision.tile)await page.locator('.tile-btn.selected').click();
    await page.evaluate(()=>document.querySelectorAll('[data-test-choice]').forEach(e=>e.removeAttribute('data-test-choice')));
    operations++;
   }else await page.waitForTimeout(25);
  }
  assert.ok(result,'one hand reaches round result');assert.ok(operations>0);
  fs.mkdirSync(path.resolve(__dirname,'../test-results'),{recursive:true});
  await page.screenshot({path:path.resolve(__dirname,'../test-results/full-game-result.png'),fullPage:true});
  assert.equal(await page.locator('.result-score-row').count(),4);
  await page.getByRole('button',{name:'最終結果へ'}).click();
  await page.getByRole('heading',{name:'対局終了'}).waitFor();
  assert.equal(await page.locator('.result-rank').count(),4);
  assert.deepEqual(errors,[]);
  console.log(`PASS: ${operations} real UI choices, full one-hand game, four-player settlement, match result, no page errors${server?', server stopped before starting game':''}.`);
 }finally{await browser.close();server?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
