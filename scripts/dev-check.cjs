const path=require('node:path'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4176','--strictPort'],{cwd:root,windowsHide:true});
 let browser;
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Vite did not start')),15000);
   server.stdout.on('data',data=>{if(String(data).includes('127.0.0.1:4176')){clearTimeout(timer);resolve();}});
   server.stderr.on('data',data=>process.stderr.write(data));
   server.on('exit',code=>{clearTimeout(timer);reject(Error('Vite exited '+code));});
  });
  browser=await webkit.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4176/');await page.locator('[data-start="single"]').click();
  await page.locator('#pauseBtn').click();await page.getByRole('dialog',{name:'中断中'}).waitFor();
  assert.deepEqual(errors,[]);console.log('PASS: Vite dev loads vendored CommonJS scoring, starts game and saves pause in WebKit.');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
