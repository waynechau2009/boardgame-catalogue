const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 let shared=JSON.parse(fs.readFileSync('games.json','utf8')), sha='initial',reject=false,writes=0;
 const context=await browser.newContext();
 const errors=[];
 await context.route('**/games.json',r=>r.fulfill({json:shared}));
 await context.route('https://api.github.com/**',async r=>{
  const req=r.request(),url=req.url();
  if(!req.headers().authorization)return r.fulfill({status:401,json:{}});
  if(req.method()==='PUT'){
   writes++;const body=req.postDataJSON();
   if(reject)return r.fulfill({status:403,json:{}});
   if(body.sha!==sha)return r.fulfill({status:409,json:{}});
   shared=JSON.parse(Buffer.from(body.content,'base64').toString());sha+='x';return r.fulfill({json:{commit:{sha}}});
  }
  if(url.includes('/contents/'))return r.fulfill({json:{sha}});
  if(url.includes('/git/blobs/'))return r.fulfill({json:{content:Buffer.from(JSON.stringify(shared)).toString('base64')}});
  return r.fulfill({json:{permissions:{admin:true}}});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8000/');await page.waitForFunction(()=>document.querySelectorAll('.card').length===165);
 assert.equal(await page.locator('#addGameBtn').isVisible(),false);
 await page.locator('#q').fill('zzzz-no-game');assert.equal(await page.locator('.card').count(),0);await page.locator('#q').fill('');
 await page.locator('#players').selectOption('4');assert.ok(await page.locator('.card').count()>0);await page.locator('#players').selectOption('');
 await page.locator('[data-filter="expansion"]').click();assert.equal(await page.locator('.card:not([data-kind="expansion"])').count(),0);await page.locator('[data-filter="all"]').click();
 await page.locator('#ownerBtn').click();await page.locator('#ownerToken').fill('test-only-not-a-real-token');await page.locator('#ownerForm button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#addGameBtn').hidden);
 async function add(name){await page.locator('#addGameBtn').click();for(const [id,value]of Object.entries({gameName:name,gameRating:'8',minTime:'20',maxTime:'30'}))await page.locator('#'+id).fill(value);await page.locator('#saveGameBtn').click();}
 await add('Shared Test 棋');await page.waitForFunction(()=>!document.querySelector('#addDialog').open);assert.equal(shared.length,166);
 const visitor=await context.newPage();await visitor.goto('http://127.0.0.1:8000/');await visitor.waitForFunction(()=>document.querySelectorAll('.card').length===166);assert.equal(await visitor.locator('#addGameBtn').isVisible(),false);
 const card=page.locator('.card').filter({has:page.locator('.name',{hasText:'Shared Test 棋'})});await card.getByText('Edit',{exact:true}).click();await page.locator('#gameName').fill('Renamed shared game');await page.locator('#saveGameBtn').click();await page.waitForFunction(()=>!document.querySelector('#addDialog').open);assert.ok(shared.some(g=>g.name==='Renamed shared game'));
 reject=true;await add('Rejected save');await page.locator('#formError').waitFor({state:'visible'});assert.equal(shared.length,166);assert.equal(await page.locator('.card').count(),166);await page.locator('#cancelAdd').click();reject=false;
 // Simulate another owner changing this game while the edit dialog is open.
 const renamed=page.locator('.card').filter({has:page.locator('.name',{hasText:'Renamed shared game'})});await renamed.getByText('Edit',{exact:true}).click();shared.find(g=>g.name==='Renamed shared game').rating=9;await page.locator('#gameRating').fill('7');await page.locator('#saveGameBtn').click();await page.locator('#formError').waitFor({state:'visible'});assert.match(await page.locator('#formError').textContent(),/changed/);assert.equal(shared.find(g=>g.name==='Renamed shared game').rating,9);await page.locator('#cancelAdd').click();
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.card').length===166);assert.equal(await page.locator('#addGameBtn').isVisible(),false);assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})).then(x=>x.includes('test-only')),false);
 // Explicit migration, with duplicate names skipped and local backup preserved.
 await page.evaluate(()=>localStorage.setItem('boardgame-catalogue-added-games-v1',JSON.stringify([{name:'Legacy imported game',rating:7,min:1,max:4,time:30,type:'standalone',cover:'',id:''}])));
 await page.locator('#ownerBtn').click();await page.locator('#ownerToken').fill('test-only');await page.locator('#ownerForm button[type="submit"]').click();await page.locator('#importBtn').waitFor({state:'visible'});page.on('dialog',d=>d.accept());await page.locator('#importBtn').click();await page.waitForFunction(()=>document.querySelectorAll('.card').length===167);assert.equal(shared.length,167);
 const imported=page.locator('.card').filter({has:page.locator('.name',{hasText:'Legacy imported game'})});await imported.getByText('Delete',{exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.card').length===166);assert.equal(shared.length,166);
 await page.locator('#ownerBtn').click();assert.equal(await page.locator('.owner-actions').count(),0);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 console.log('PASS: public read, search/filters, owner controls, shared add/edit/delete, fresh visitor persistence, rejected saves, conflicting edits, explicit local migration, sign-out, token not persisted, mobile width; mocked GitHub writes:',writes);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
