const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createMatch}=require('../dist-test/engine/match.js');
const {applyAction,getLegalActions}=require('../dist-test/engine/round.js');
const {chooseNormalTurnAction,chooseNormalResponseActionForState}=require('../dist-test/ai/action-policy.js');
const {MajiangCoreCalculator}=require('../dist-test/adapter/majiang-core.js');
const output=path.resolve(__dirname,'../test-results/design');fs.mkdirSync(output,{recursive:true});
function fixture(wanted){
 for(let seed=400;seed<500;seed++){
  const m=createMatch({seed,now:100}),calc=MajiangCoreCalculator.fromVendoredRuntime();
  for(let step=0;step<600;step++){
   const r=m.round;
   if(['WIN_RESOLUTION','DRAW_RESOLUTION'].includes(r.phase))break;
   if(r.phase==='WAIT_DISCARD'&&r.currentPlayer===0){
    if(wanted==='table'&&(r.discardSerial||0)>=28)return m;
    if(wanted==='late'&&(r.discardSerial||0)>=64)return m;
    if(wanted==='melds'&&r.players.some(p=>p.melds.length===4))return m;
   }
   if(r.phase==='WAIT_CALL'){
    const choice=getLegalActions(r,0,calc).find(a=>a.type===wanted);
    if(choice){
     for(const id of [1,2,3])if(r.phase==='WAIT_CALL'&&id!==r.pendingDiscard.discarder&&!r.pendingDiscard.responses[id])applyAction(r,id,{type:'PASS'},100+step,calc);
     return m;
    }
   }
   if(r.phase==='WAIT_DISCARD'){
    let action=chooseNormalTurnAction(r,r.currentPlayer,calc);
    if(wanted==='late'&&['TSUMO','KYUUSHU_KYUUHAI'].includes(action.type))action=getLegalActions(r,r.currentPlayer,calc).find(a=>a.type==='DISCARD');
    applyAction(r,r.currentPlayer,action,100+step,calc);
   }
   else if(r.phase==='DRAW')applyAction(r,r.currentPlayer,{type:'DRAW'},100+step,calc);
   else if(r.phase==='WAIT_CALL'||r.phase==='WAIT_KAN_RON'){
    const actor=r.pendingDiscard?.discarder??r.pendingKan?.playerId;
    for(const id of [0,1,2,3]){
     if(!['WAIT_CALL','WAIT_KAN_RON'].includes(r.phase))break;
     const pending=r.pendingDiscard??r.pendingKan;
     if(id===actor||pending.responses[id])continue;
     applyAction(r,id,wanted==='late'?{type:'PASS'}:chooseNormalResponseActionForState(r,id,getLegalActions(r,id,calc)),100+step,calc);
    }
   }
  }
 }
 throw Error('fixture not found '+wanted);
}
async function inject(page,match){
 await page.evaluate(async serialized=>{
  await new Promise((resolve,reject)=>{
   const req=indexedDB.open('mahjong-pocket-preview',1);
   req.onupgradeneeded=()=>req.result.createObjectStore('save');
   req.onerror=()=>reject(req.error);
   req.onsuccess=()=>{const db=req.result,tx=db.transaction('save','readwrite');tx.objectStore('save').put(serialized,'current-match');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
  });
 },JSON.stringify({schemaVersion:1,humanId:0,paused:false,difficulty:'normal',match}));
 await page.reload();await page.locator('#table').waitFor();
}
async function run(){
 const browser=await pw[process.env.TEST_BROWSER||'webkit'].launch({headless:true});
 const errors=[];
 try{
  for(const [width,height] of [[390,844],[320,667],[430,932]]){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
   await page.locator('[data-start="single"]').waitFor();
   await page.screenshot({path:path.join(output,`home-${width}.png`),fullPage:true});
   await inject(page,fixture('table'));
   await page.screenshot({path:path.join(output,`table-${width}.png`),fullPage:true});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'table fits viewport');
   const targets=await page.locator('.tile-btn').evaluateAll(tiles=>tiles.map(t=>t.getBoundingClientRect().height));
   assert.ok(targets.every(height=>height>=44),'hand touch height');
   await page.locator('.tile-btn:not(:disabled)').first().click();
   await page.locator('.selection-preview').waitFor();
   await page.screenshot({path:path.join(output,`selection-${width}.png`),fullPage:true});
   for(const kind of ['late','melds']){
    await inject(page,fixture(kind));
    await page.screenshot({path:path.join(output,`${kind}-${width}.png`),fullPage:true});
    const overlap=await page.evaluate(()=>{
     const center=document.querySelector('.center-board').getBoundingClientRect();
     return [...document.querySelectorAll('.river-tile img')].some(tile=>{
      const box=tile.getBoundingClientRect();
      return Math.min(box.right,center.right)-Math.max(box.left,center.left)>1&&Math.min(box.bottom,center.bottom)-Math.max(box.top,center.top)>1;
     });
    });
    assert.equal(overlap,false,`${width}px ${kind}: no river tile hidden by center board`);
    if(kind==='late'){
     await page.getByRole('button',{name:'対面の捨て牌を拡大',exact:true}).click();
     const detail=page.getByRole('dialog',{name:'捨て牌の確認'});await detail.waitFor();
     assert.ok(await detail.locator('.river-detail img').count()>10);
     await page.screenshot({path:path.join(output,`river-detail-${width}.png`),fullPage:true});
     await detail.getByRole('button',{name:'中断したまま閉じる'}).click();
     await page.getByRole('dialog',{name:'中断中'}).waitFor();
     await page.getByRole('button',{name:'対局を続ける',exact:true}).click();
     await page.getByRole('dialog').waitFor({state:'hidden'});
    }
   }
   if(width===390){
    for(const [kind,text] of [['PON','ポン'],['CHI','チー'],['ANKAN','カン']]){
     let m;
     if(kind==='ANKAN'){
      m=createMatch({seed:20,now:100});m.round.players[0].hand='m2 m2 m2 m2 m3 m4 m5 p2 p3 p4 p6 p6 s6 s7'.split(' ');m.round.lastDrawnTile='s7';
     }else m=fixture(kind);
     await inject(page,m);
     if(kind==='ANKAN')await page.getByRole('button',{name:'カン',exact:true}).click();
     const blurred=await page.locator('.call-dialog').evaluate(el=>{const style=getComputedStyle(el);return [style.backdropFilter,style.webkitBackdropFilter].some(value=>value&&value!=='none');});
     assert.equal(blurred,false,'own call chooser keeps the hand sharp');
     await page.screenshot({path:path.join(output,`own-call-${kind}.png`),fullPage:true});
     if(kind==='PON'){
      await page.getByRole('dialog').getByRole('button',{name:'中断',exact:true}).click();
      await page.getByRole('dialog',{name:'中断中'}).waitFor();
      assert.ok(await page.getByRole('dialog',{name:'中断中'}).evaluate(el=>{const style=getComputedStyle(el);return [style.backdropFilter,style.webkitBackdropFilter].some(value=>value&&value!=='none');}),'other dialogs retain their background blur');
      await page.getByRole('button',{name:'対局を続ける',exact:true}).click();
     }
     await page.getByRole('button',{name:kind==='ANKAN'?'暗槓':text,exact:false}).first().click();
     await page.locator('.call-announcement').waitFor();
     await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.call-announcement')).opacity)===1);
     assert.equal(await page.locator('.call-announcement strong').textContent(),text);
     const centered=await page.locator('.call-announcement').evaluate(el=>{const r=el.getBoundingClientRect();return Math.abs(r.x+r.width/2-innerWidth/2)<1&&Math.abs(r.y+r.height/2-innerHeight/2)<1;});
     assert.ok(centered,'announcement at viewport center');
     await page.screenshot({path:path.join(output,`call-${kind}.png`),fullPage:true});
     await page.locator('.call-announcement').waitFor({state:'hidden'});
    }
   }
   await context.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: 320/390/430px layouts, selection magnifier, late/4-meld snapshots, 44px hand target height, actual pon/chi/ankan center announcements.');
 }finally{await browser.close();}
}
module.exports={fixture,inject};
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
