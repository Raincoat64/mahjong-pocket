const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=path.resolve(__dirname,'../test-results');fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'mahjong-recovery-profile-'));
const url=process.env.TEST_URL||'http://127.0.0.1:4174/';
async function storage(page,operation,value){return page.evaluate(({operation,value})=>new Promise((resolve,reject)=>{
 const req=indexedDB.open('mahjong-pocket-preview',1);req.onerror=()=>reject(req.error);
 req.onsuccess=()=>{
  const db=req.result,tx=db.transaction('save',operation==='put'?'readwrite':'readonly'),store=tx.objectStore('save');
  const r=operation==='put'?store.put(value,'current-match'):operation==='keys'?store.getAllKeys():store.get(value||'current-match');
  tx.oncomplete=()=>{db.close();resolve(r.result);};tx.onabort=()=>reject(tx.error);
 };
}),{operation,value});}
(async()=>{
 let context;
 try{
  context=await webkit.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},acceptDownloads:true});
  let page=await context.newPage();await page.goto(url);await page.locator('[data-start="single"]').waitFor();
  await storage(page,'put','{broken-json');await page.reload();
  await page.getByRole('dialog',{name:'保存の確認'}).waitFor();
  assert.equal(await storage(page,'get'),'{broken-json');
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'データを書き出す'}).click();
  const file=path.join(output,'corrupt-save-export.json');await (await downloaded).saveAs(file);
  assert.equal(fs.readFileSync(file,'utf8'),'{broken-json');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'データを退避してホームへ'}).click();
  await page.locator('[data-start="single"]').waitFor();
  const keys=await storage(page,'keys'),archive=keys.find(k=>String(k).startsWith('current-match-recovery-'));
  assert.ok(archive);assert.equal(await storage(page,'get',archive),'{broken-json');
  await page.locator('[data-start="single"]').click();await page.locator('#pauseBtn').click();
  await page.getByRole('dialog',{name:'中断中'}).waitFor();const before=await storage(page,'get');
  await context.close();context=null;
  context=await webkit.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844}});
  page=await context.newPage();await page.goto(url);await page.getByRole('dialog',{name:'中断中'}).waitFor();
  assert.equal(await storage(page,'get'),before);
  console.log('PASS: corrupt save preserved/exported/archived, playable recovery, exact state across WebKit process restart.');
 }finally{if(context)await context.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
