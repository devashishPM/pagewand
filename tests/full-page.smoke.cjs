const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

for (const [dpr, zoom, classic, panel] of [[1,1],[2,1],[1,0.8],[1,1.25],[1,1.5],[1,1,true],[1,1,false,true],[2,1,false,true]]) test(`real screenshot stitching, editor export and recovery at DPR ${dpr}, zoom ${zoom}, scrollbars ${Boolean(classic)}, panel ${Boolean(panel)}`, { timeout: 90000 }, async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'pw-full-'));
  const extension = path.join(profile, 'extension');
  const root = path.resolve(__dirname, '..');
  await fs.mkdir(extension);
  for (const f of ['background.js','css_export.js','downloads.js','edit_manager.js','capture.js','screenshot_editor.js','ui.js','content.js','styles.css']) {
    await fs.copyFile(path.join(root,f),path.join(extension,f));
  }
  await fs.cp(path.join(root,'icons'),path.join(extension,'icons'),{recursive:true});
  const manifest = JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
  // Test-only permission replaces the toolbar user gesture in headless Chromium.
  // Shipping manifest remains unchanged. Chrome's real screenshot API is used.
  manifest.host_permissions = ['<all_urls>'];
  manifest.content_scripts = [{matches:['http://127.0.0.1/*'],css:['styles.css'],js:['css_export.js','downloads.js','edit_manager.js','capture.js','screenshot_editor.js','ui.js','content.js']}];
  await fs.writeFile(path.join(extension,'manifest.json'),JSON.stringify(manifest));
  const server = http.createServer((_req,res) => {
    if(_req.url==='/lazy.svg') {res.setHeader('Content-Type','image/svg+xml');setTimeout(()=>res.end('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="rgb(0,180,0)"/></svg>'),250);return;}
    res.setHeader('Content-Type','text/html');
    if(panel) {
      res.end(`<!doctype html><style>html,body{margin:0;height:100%;overflow:hidden}header{position:fixed;top:0;height:60px;background:red;width:100%}#workspace{position:fixed;left:100px;top:80px;width:calc(100% ${dpr===2 ? '+ 20px' : '- 120px'});height:calc(100% - 100px);overflow:auto;scroll-behavior:smooth;border:1px solid black}aside{position:sticky;top:0;height:40px;background:rgb(10,20,30)}section{height:100px}#widget{position:absolute;left:480px;top:400px;height:120px;width:150px;overflow:auto;background:white}</style><header>App shell</header><main id="workspace"><aside>Sticky title</aside><img alt="Lazy fixture" loading="lazy" src="/lazy.svg" style="position:absolute;left:400px;top:1100px;width:40px;height:40px">${Array.from({length:23},(_,i)=>`<section style="background:rgb(${30+i*8},80,120)">${i+1}</section>`).join('')}<div id="widget"><div style="height:1000px">Independent widget</div></div></main>`);
      return;
    }
    res.end(`<!doctype html><style>${classic ? "html{overflow:scroll}body{min-width:1200px}::-webkit-scrollbar{width:16px;height:16px}" : ""}html{scroll-behavior:smooth}body{margin:0}header{position:fixed;top:0;height:20px;background:black;width:100%;z-index:2}aside{position:sticky;top:0;height:40px;background:rgb(10,20,30)}section{height:100px;box-sizing:border-box}</style><header>Fixed header</header><aside>Sticky title</aside><img alt="Lazy fixture" loading="lazy" src="/lazy.svg" style="position:absolute;left:400px;top:1100px;width:40px;height:40px">${Array.from({length:23},(_,i)=>`<section style="background:rgb(${30+i*8},80,120)">${i+1}</section>`).join('')}`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let context;
  try {
    context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:800,height:600},deviceScaleFactor:dpr,acceptDownloads:true,args:[`--force-device-scale-factor=${dpr}`,`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
    const page=context.pages()[0];
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const ui=page.locator('#pw-ui-host');
    if(zoom!==1) await worker.evaluate(async zoom=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.tabs.setZoom(tab.id,zoom);},zoom);
    const scale=dpr*zoom;
    const outputWidth=await page.evaluate(({scale,panel})=>Math.round((panel ? Math.min(document.querySelector('#workspace').clientWidth,innerWidth-document.querySelector('#workspace').getBoundingClientRect().left-document.querySelector('#workspace').clientLeft) : document.scrollingElement.clientWidth)*scale),{scale,panel});
    await ui.locator('.start-mode[data-mode="screenshot"]').first().click();
    await ui.evaluate(host=>{window.__notices=[];new MutationObserver(()=>{const t=host.shadowRoot.querySelector('.toast');if(t) window.__notices.push(t.textContent);}).observe(host.shadowRoot,{subtree:true,childList:true});});
    await page.evaluate(panel=>{(panel ? document.querySelector('#workspace') : window).scrollTo({top:450,behavior:'instant'});if(panel) document.querySelector('#widget').scrollTop=45;},panel);
    await ui.locator('[data-action="full-page"]').click();
    const canvas=page.locator('#pw-screenshot-host canvas');
    try { await canvas.waitFor({timeout:15000}); } catch (e) { console.log(await page.evaluate(()=>({notices:window.__notices,inner:[innerWidth,innerHeight],client:[document.documentElement.clientWidth,document.documentElement.clientHeight],root:[document.scrollingElement.clientWidth,document.scrollingElement.clientHeight],vv:[visualViewport.width,visualViewport.height]}))); throw e; }
    assert.ok(Math.abs(await page.evaluate(panel=>panel ? document.querySelector('#workspace').scrollTop : scrollY,panel)-450)<1);
    assert.equal(await page.locator('header').evaluate(el=>el.style.visibility),'');
    assert.equal(await page.locator(panel ? '#workspace > aside' : 'body > aside').evaluate(el=>el.style.position),'');
    const pixels=await canvas.evaluate((c,scale)=>({width:c.width,height:c.height,rows:Array.from({length:23},(_,i)=>Array.from(c.getContext('2d').getImageData(Math.round(200*scale),Math.round((40+i*100+50)*scale),1,1).data))}),scale);
    assert.equal(pixels.width,outputWidth);assert.equal(pixels.height,Math.round(2340*scale));
    for(let i=0;i<23;i++) assert.deepEqual(pixels.rows[i],[30+i*8,80,120,255],`row ${i+1}`);
    // Check every row away from text, including all stitching boundaries.
    if(zoom===1) assert.equal(await canvas.evaluate((c,dpr)=>{
      const data=c.getContext('2d').getImageData(200*dpr,40*dpr,1,2300*dpr).data;
      for(let y=0;y<2300*dpr;y++) if(data[y*4]!==30+Math.floor(y/(100*dpr))*8) return y;
      return -1;
    },dpr),-1);
    assert.deepEqual(await canvas.evaluate((c,scale)=>Array.from(c.getContext('2d').getImageData(Math.round(420*scale),Math.round(1120*scale),1,1).data),scale),[0,180,0,255]);
    const editor=page.locator('#pw-screenshot-host');
    if(dpr===1 && zoom===1 && !classic && !panel) {await fs.mkdir(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/full-page-editor.png')});}
    await editor.locator('[data-tool="redact"]').click();
    await editor.locator('.canvas-wrap').evaluate(el=>el.scrollTop=el.scrollHeight);
    const box=await canvas.boundingBox();
    const wrap=await editor.locator('.canvas-wrap').boundingBox();
    const x=box.x+200,y=wrap.y+wrap.height-60;
    const sample=()=>canvas.evaluate((c,{x,y})=>{const b=c.getBoundingClientRect();return Array.from(c.getContext('2d').getImageData(Math.floor((x-b.x)*c.width/b.width),Math.floor((y-b.y)*c.height/b.height),1,1).data);},{x:x+20,y:y+15});
    const beforeRedact=await sample();
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+70,y+30);await page.mouse.up();
    assert.equal(await canvas.evaluate(c=>c.width),outputWidth);
    assert.deepEqual(await sample(),[17,24,39,255]);
    await editor.locator('[data-action="undo"]').click();
    assert.deepEqual(await sample(),beforeRedact);
    // Export should decode to the same full-size dimensions, even after editor scroll.
    const download=page.waitForEvent('download');await editor.locator('[data-action="download"]').click();
    const file=await (await download).path();const png=await fs.readFile(file);
    assert.equal(png.readUInt32BE(16),outputWidth);assert.equal(png.readUInt32BE(20),Math.round(2340*scale));
    await editor.locator('[data-action="close"]').click();
    await ui.locator('[data-action="full-page"]').click();
    await ui.locator('.capture-progress').waitFor({state:'visible'});
    await page.keyboard.press('Escape');
    await ui.locator('.toolbar').waitFor({state:'visible'});
    assert.equal(await page.locator('#pw-screenshot-host').count(),0);
    assert.ok(Math.abs(await page.evaluate(panel=>panel ? document.querySelector('#workspace').scrollTop : scrollY,panel)-450)<1);
    assert.equal(await page.locator(panel ? '#workspace > aside' : 'body > aside').evaluate(el=>el.style.position),'');
    // Resize aborts and restores styles without producing a partial editor.
    await ui.locator('[data-action="full-page"]').click();
    await page.setViewportSize({width:780,height:600});
    await ui.locator('.toolbar').waitFor({state:'visible'});
    assert.equal(await page.locator('#pw-screenshot-host').count(),0);
    assert.equal(await page.locator('header').evaluate(el=>el.style.visibility),'');
    if(dpr===1 && zoom===1 && !classic && !panel) {
      // Reject oversized pages before allocating a bitmap.
      await page.evaluate(()=>document.body.style.minHeight='100000px');
      await ui.locator('[data-action="full-page"]').click();
      await ui.locator('.toast').filter({hasText:'too large'}).waitFor();
      assert.equal(await page.locator('#pw-screenshot-host').count(),0);
      await page.evaluate(()=>document.body.style.minHeight='');
      // Height changes during capture must not produce a truncated success.
      await ui.locator('[data-action="full-page"]').click();
      await ui.locator('.capture-progress span').filter({hasText:'Capturing section'}).waitFor();
      await page.evaluate(()=>document.body.style.minHeight='2440px');
      await ui.locator('.toolbar').waitFor({state:'visible'});
      assert.equal(await page.locator('#pw-screenshot-host').count(),0);
      await page.evaluate(()=>document.body.style.minHeight='');
      // Switching away cancels; a late screenshot never opens an editor.
      await ui.locator('[data-action="full-page"]').click();
      await ui.locator('.capture-progress span').filter({hasText:'Capturing section'}).waitFor();
      const other=await context.newPage();await other.bringToFront();
      await ui.locator('.toolbar').waitFor({state:'visible'});
      await other.close();await page.bringToFront();
      assert.equal(await page.locator('#pw-screenshot-host').count(),0);
      assert.equal(await page.locator('header').evaluate(el=>el.style.visibility),'');
    }
    if(panel) assert.equal(await page.locator('#widget').evaluate(el=>el.scrollTop),45);
    assert.deepEqual(errors,[]);
  } finally {
    if(context) await context.close();
    await new Promise(resolve=>server.close(resolve));
    await fs.rm(profile,{recursive:true,force:true});
  }
});
