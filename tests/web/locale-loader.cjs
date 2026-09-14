const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();
 await page.route('https://**/*',route=>route.abort());
 await page.addInitScript(()=>{window.wx={postMessage:()=>{}};});
 const host=process.env.U1_TEST_ORIGIN||'http://127.0.0.1:18791';
 const translated=page.waitForResponse(r=>r.url().includes('/i10n/pt-BR.json'),{timeout:45000});
 await page.goto(host+'/web/flutter_web/index.html?path=2&locale=pt-BR&dark_mode=1');
 await page.evaluate(()=>fetch('assets/assets/i10n/en.json'));
 const response=await translated;assert.equal(response.status(),200);
 const data=await response.json();assert.equal(data['Device control'],'Controle do dispositivo');
 assert.equal(await page.locator('html').getAttribute('lang'),'pt-BR');
 // Both transport paths used by Flutter resolve the Portuguese asset.
 const xhr=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=new XMLHttpRequest();r.open('GET','assets/assets/i10n/en.json');r.onload=()=>resolve(JSON.parse(r.responseText)['Unconnected device']);r.onerror=reject;r.send();}));
 assert.equal(xhr,'Dispositivo desconectado');
 await page.goto(host+'/web/flutter_web/index.html?path=2&locale=en-US');
 const english=await page.evaluate(async()=>{const r=await fetch('assets/assets/i10n/en.json');return (await r.json())['Camera'];});
 assert.equal(english,'Camera');
 await browser.close();console.log('PASS: Flutter entry point loads Portuguese catalog; XHR and fetch localized; English locale preserved.');
})().catch(e=>{console.error(e);process.exit(1);});
