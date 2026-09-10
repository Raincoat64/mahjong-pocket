const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
async function saved(page){return page.evaluate(()=>new Promise((resolve,reject)=>{
 const req=indexedDB.open('mahjong-pocket-preview',1);req.onerror=()=>reject(req.error);
 req.onsuccess=()=>{const db=req.result,tx=db.transaction('save'),read=tx.objectStore('save').get('current-match');tx.oncomplete=()=>{db.close();resolve(read.result);};};
}));}
(async()=>{
 const browser=await webkit.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true}),first=await context.newPage();
  const url=process.env.TEST_URL||'http://127.0.0.1:4174/';
  await first.goto(url);await first.locator('[data-start="single"]').click();await first.locator('#pauseBtn').click();
  await first.getByRole('dialog',{name:'中断中'}).waitFor();const original=await saved(first);
  const second=await context.newPage();await second.goto(url);await second.bringToFront();
  await second.getByRole('dialog',{name:'中断中'}).waitFor();await second.locator('#continueBtn').click();
  await second.locator('.tile-btn:not(:disabled)').first().click();await second.locator('.tile-btn.selected').click();
  await second.locator('#pauseBtn').click();await second.getByRole('dialog',{name:'中断中'}).waitFor();
  const latest=await saved(second);assert.notEqual(latest,original);
  await first.bringToFront();await first.locator('#continueBtn').click();
  const conflict=first.getByRole('dialog',{name:'保存の確認'});await conflict.waitFor();
  assert.ok((await conflict.textContent()).includes('別の画面'));
  assert.equal(await saved(first),latest,'stale resume cannot overwrite newer game');
  const downloaded=first.waitForEvent('download');await conflict.getByRole('button',{name:'データを書き出す'}).click();
  const download=await downloaded,exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.deepEqual(exported.match,JSON.parse(original).match,'stale in-memory hand remains exportable');
  await conflict.getByRole('button',{name:'最新の保存を開く'}).click();
  await first.getByRole('dialog',{name:'中断中'}).waitFor();assert.equal(await saved(first),latest);
  assert.equal(await first.locator('.tile-btn').count(),JSON.parse(latest).match.round.players[0].hand.length);

  // Exercise all repository mutations with independent clients in a separate test DB.
  const code=fs.readFileSync(path.resolve(__dirname,'../dist-test/persistence/repository.js'),'utf8');
  const atomic=await first.evaluate(async code=>{
   const exports={};new Function('exports',code)(exports);
   const Repo=exports.IndexedDbMatchSaveRepository;
   const one=new Repo('mahjong-cas-fixture'),two=new Repo('mahjong-cas-fixture');
   await one.load();await two.load();await one.save('first');
   const rejected=[];
   for(const operation of [()=>two.save('stale'),()=>two.clear(),()=>two.archiveAndClear()]){
    try{await operation();rejected.push('unexpected success');}catch(error){rejected.push(error.message);}
   }
   const retained=await one.load();
   await two.load();await two.save('second');
   return {rejected,retained,after:await one.load()};
  },code);
  assert.deepEqual(atomic,{rejected:['SAVE_CONFLICT','SAVE_CONFLICT','SAVE_CONFLICT'],retained:'first',after:'second'});
  await context.close();
  console.log('PASS: stale window stops without overwrite, old hand export retained, explicit latest restore, atomic save/clear/archive conflicts.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
