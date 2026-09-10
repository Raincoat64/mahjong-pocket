const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {fixture,inject}=require('./design-check.cjs');
const output=path.resolve(__dirname,'../test-results/iphone');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await webkit.launch({headless:true});
 const fixtures=['late','melds'].map(kind=>[kind,fixture(kind)]);
 try{
  for(const [width,height] of [[375,548],[390,664],[430,752]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true}),page=await context.newPage();
   await page.goto(process.env.TEST_URL||'http://127.0.0.1:4174/');await page.locator('[data-start="single"]').waitFor();
   for(const [kind,match] of fixtures){
    await inject(page,match);
    await page.screenshot({path:path.join(output,`${kind}-${width}x${height}.png`),fullPage:true});
    const fit=await page.evaluate(()=>{
     const inside=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight;};
     const center=document.querySelector('.center-board').getBoundingClientRect();
     const hidden=[...document.querySelectorAll('.river-tile img')].some(tile=>{
      const r=tile.getBoundingClientRect();return Math.min(r.right,center.right)-Math.max(r.left,center.left)>1&&Math.min(r.bottom,center.bottom)-Math.max(r.top,center.top)>1;
     });
     return {pause:inside('#pauseBtn'),hand:inside('#hand'),actions:inside('.action-bar'),scroll:document.documentElement.scrollHeight>innerHeight+1,hidden};
    });
    assert.deepEqual(fit,{pause:true,hand:true,actions:true,scroll:false,hidden:false},`${width}x${height} ${kind}`);
   }
   await context.close();
  }
  console.log('PASS: simulated short iPhone viewports375x548/390x664/430x752, late and4meld states, visible pause/hand/actions, no scrolling or center overlap. Not a real iPhone test.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
