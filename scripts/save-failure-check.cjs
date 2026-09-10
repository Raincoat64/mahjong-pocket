const assert=require('node:assert/strict');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
async function saved(page){return page.evaluate(()=>new Promise((resolve,reject)=>{
 const req=indexedDB.open('mahjong-pocket-preview',1);req.onerror=()=>reject(req.error);
 req.onsuccess=()=>{const db=req.result,tx=db.transaction('save'),read=tx.objectStore('save').get('current-match');tx.oncomplete=()=>{db.close();resolve(read.result);};};
}));}
(async()=>{
 const browser=await webkit.launch({headless:true});
 try{
  for(const failure of ['quota','abort']){
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
   await page.goto(process.env.TEST_URL||'http://127.0.0.1:4174/');
   await page.locator('[data-start="single"]').click();await page.locator('.tile-btn:not(:disabled)').first().waitFor();
   const before=await saved(page);
   await page.evaluate(failure=>{
    window.__failWrites=true;
    const put=IDBObjectStore.prototype.put,transaction=IDBDatabase.prototype.transaction;
    IDBObjectStore.prototype.put=function(...args){
     if(window.__failWrites&&failure==='quota')throw new DOMException('Injected quota failure','QuotaExceededError');
     return put.apply(this,args);
    };
    IDBDatabase.prototype.transaction=function(...args){
     const tx=transaction.apply(this,args);
     if(window.__failWrites&&failure==='abort'&&args[1]==='readwrite')queueMicrotask(()=>tx.abort());
     return tx;
    };
   },failure);
   await page.locator('.tile-btn:not(:disabled)').first().click();await page.locator('.tile-btn.selected').click();
   const error=page.getByRole('dialog',{name:'保存の確認'});await error.waitFor();
   assert.equal(await saved(page),before,'failed save leaves last committed record intact');
   const visible=await page.locator('.recent-discards').textContent();
   await page.waitForTimeout(500);
   assert.equal(await page.locator('.recent-discards').textContent(),visible,'CPU stopped on failure');
   await page.evaluate(()=>{window.__failWrites=false;});
   await error.getByRole('button',{name:'再試行',exact:true}).click();
   await page.getByRole('dialog',{name:'中断中'}).waitFor();
   const after=JSON.parse(await saved(page));
   assert.equal(after.paused,true);
   assert.equal(after.match.round.players[0].hand.length,13,'retry stores the unlost action');
   await page.reload();await page.getByRole('dialog',{name:'中断中'}).waitFor();
   assert.deepEqual(JSON.parse(await saved(page)),after);
   await context.close();
  }
  console.log('PASS: injected quota and transaction-abort failures stop play, preserve committed save, retry retains action, exact paused reload.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
