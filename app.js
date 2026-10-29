'use strict';
const $ = s => document.querySelector(s);
const api = 'https://api.github.com/repos/waynechau2009/boardgame-catalogue';
const storageKey = 'boardgame-catalogue-added-games-v1';
let games = [], token = '', kind = 'all', editing = null, busy = false, loaded = false, pendingSnapshot = null, pendingUntil = 0;
const status = message => { $('#status').textContent = message; };
function validate(items) {
  if (!Array.isArray(items)) throw new Error('Invalid catalogue data.');
  const names = new Set();
  for (const g of items) {
    if (!g || typeof g.name !== 'string' || !g.name.trim() || g.name.length > 120 || names.has(g.name.toLowerCase())) throw new Error('Invalid or duplicate game name.');
    names.add(g.name.toLowerCase());
    if (!['standalone', 'expansion'].includes(g.type) || !['min','max','rating','time'].every(k => Number.isFinite(g[k])) || g.min < (g.type === 'expansion' ? 0 : 1) || g.max < g.min || g.max > 99 || g.rating < 0 || g.rating > 10 || g.time < 1) throw new Error('Invalid game details.');
    if (g.id && !/^\d+$/.test(String(g.id))) throw new Error('Invalid BoardGameGeek ID.');
    if (g.cover && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(g.cover)) throw new Error('Invalid cover image.');
  }
  return items;
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function render() {
  const term = $('#q').value.trim().toLowerCase(), p = Number($('#players').value), mode = $('#sort').value;
  const visible = games.filter(g => g.name.toLowerCase().includes(term) && (kind === 'all' || kind === g.type) && (!p || (g.min <= p && g.max >= p)));
  visible.sort((a,b) => mode === 'rating' ? b.rating-a.rating : mode === 'time' ? a.time-b.time : a.name.localeCompare(b.name));
  $('#grid').replaceChildren();
  for (const g of visible) {
    const card = el('article','card'); card.dataset.name=g.name.toLowerCase();card.dataset.kind=g.type;
    const href = g.id ? 'https://boardgamegeek.com/boardgame/'+g.id : 'https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q='+encodeURIComponent(g.name);
    const cover=el('a','cover');cover.href=href;cover.target='_blank';cover.rel='noopener';cover.setAttribute('aria-label','View '+g.name+' on BoardGameGeek');
    const fallback=el('div','placeholder',g.name);fallback.style.display=g.cover?'none':'grid';
    if(g.cover){const img=el('img');img.src=g.cover;img.alt=g.name+' box cover';img.loading='lazy';img.onerror=()=>{img.hidden=true;fallback.style.display='grid';};cover.append(img);}
    cover.append(fallback,el('span','badge',g.type==='expansion'?'Expansion':'Game'));
    const details=el('div','details'), name=el('a','name',g.name);name.href=href;name.target='_blank';name.rel='noopener';details.append(name);
    if(g.type!=='expansion') { const meta=el('div','meta');const time=g.minTime&&g.maxTime&&g.minTime!==g.maxTime?g.minTime+'–'+g.maxTime:g.time;meta.append(el('span','star','★ '+g.rating.toFixed(2)),el('span',null,'♟ '+g.min+(g.min===g.max?'':'–'+g.max)+' players'),el('span',null,'◷ '+(g.time===99999?'Not listed':time+' min')));details.append(meta); }
    if(token){const actions=el('div','owner-actions');const edit=el('button',null,'Edit'),remove=el('button',null,'Delete');edit.type=remove.type='button';edit.disabled=remove.disabled=busy;edit.onclick=()=>openAdd(g);remove.onclick=()=>deleteGame(g);actions.append(edit,remove);details.append(actions);}
    card.append(cover,details);$('#grid').append(card);
  }
  $('#count').textContent=visible.length+' of '+games.length+' items';$('#addGameBtn').hidden=!token;$('#addGameBtn').disabled=busy||!loaded;$('#importBtn').hidden=!token||!localGames().length;$('#importBtn').disabled=busy;$('#ownerBtn').textContent=token?'Sign out':'Owner sign in';$('#ownerBtn').disabled=busy;
}
function localGames() { try {const v=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(v)?v:[];}catch{return [];} }
async function load() {
  try {const r=await fetch('games.json',{cache:'no-store'});if(!r.ok)throw Error();const next=validate(await r.json());if(pendingSnapshot && JSON.stringify(next)!==pendingSnapshot && Date.now()<pendingUntil)return;pendingSnapshot=null;if(!busy&&!$('#addDialog').open){games=next;loaded=true;render();}}
  catch {status('Could not refresh the shared catalogue. Please reload to try again.');}
}
async function request(path, options={}) {
  const r=await fetch(api+path,{...options,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',...options.headers}});
  if(!r.ok) {if(r.status===401||r.status===403)throw Error('Publishing was denied. Check your token expiry and Contents read/write permission for this repository.');if(r.status===409||r.status===422)throw Error('The catalogue changed while saving. Try again to use its latest version.');throw Error('GitHub request failed ('+r.status+'). Nothing was published.');}
  return r.json();
}
function decode64(text){const bytes=Uint8Array.from(atob(text.replace(/\s/g,'')),c=>c.charCodeAt(0));return new TextDecoder().decode(bytes);}
function encode64(text){let binary='';for(const b of new TextEncoder().encode(text))binary+=String.fromCharCode(b);return btoa(binary);}
async function publish(transform,message) {
  if(!token||busy)throw Error('Sign in as the owner before publishing.');busy=true;render();
  try {
    // Read by blob SHA so the data and optimistic concurrency SHA always match.
    const file=await request('/contents/games.json?ref=main');
    const blob=await request('/git/blobs/'+file.sha);
    const current=validate(JSON.parse(decode64(blob.content))),next=validate(transform(current));
    await request('/contents/games.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,branch:'main',sha:file.sha,content:encode64(JSON.stringify(next,null,2)+'\n')})});
    games=next;pendingSnapshot=JSON.stringify(next);pendingUntil=Date.now()+300000;status('Published to GitHub. Visitors will see this update after the site redeploys, usually within a few minutes.');
  } finally {busy=false;render();}
}
function openAdd(game=null) {
  editing=game;$('#addForm').reset();$('#formError').hidden=true;$('#addTitle').textContent=game?'Edit game':'Add a game';
  const fields={gameName:'name',gameRating:'rating',bggId:'id',minPlayers:'min',maxPlayers:'max',minTime:'minTime',maxTime:'maxTime',gameType:'type'};
  if(game)for(const [id,key] of Object.entries(fields))$('#'+id).value=game[key]??(key==='minTime'||key==='maxTime'?game.time:'');
  $('#saveGameBtn').textContent='Publish game';$('#addDialog').showModal();$('#gameName').focus();
}
async function imageData(file) {
  if(!file)return editing?.cover||'';
  if(file.size>12000000)throw Error('Please choose an image smaller than 12 MB.');
  const image=await createImageBitmap(file);try{const scale=Math.min(1,320/image.width,450/image.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',0.78);}finally{image.close();}
}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function replaceGame(current,original,next) {
  if(original){const i=current.findIndex(g=>g.name.toLowerCase()===original.name.toLowerCase());if(i<0||!same(current[i],original))throw Error('This game changed since you opened it. Reload before editing.');current.splice(i,1);}
  if(next){if(current.some(g=>g.name.toLowerCase()===next.name.toLowerCase()))throw Error('That game is already in the shared catalogue.');current.push(next);}return current;
}
$('#addForm').onsubmit=async e=>{
  e.preventDefault();if(busy)return;$('#formError').hidden=true;$('#saveGameBtn').disabled=true;
  try{const minTime=Number($('#minTime').value),maxTime=Number($('#maxTime').value);if(minTime>maxTime)throw Error('Longest playtime must be at least the shortest.');const game={name:$('#gameName').value.trim(),rating:Number($('#gameRating').value),id:$('#bggId').value.trim(),min:Number($('#minPlayers').value),max:Number($('#maxPlayers').value),minTime,maxTime,time:maxTime,type:$('#gameType').value,cover:await imageData($('#coverFile').files[0])};validate([game]);await publish(current=>replaceGame(current,editing,game),(editing?'Update ':'Add ')+game.name);$('#addDialog').close();}
  catch(err){$('#formError').textContent=err.message;$('#formError').hidden=false;}finally{$('#saveGameBtn').disabled=false;}
};
async function deleteGame(game){if(!confirm('Permanently remove “'+game.name+'” from the shared catalogue?'))return;try{await publish(current=>replaceGame(current,game,null),'Remove '+game.name);}catch(err){status(err.message);}}
$('#ownerBtn').onclick=()=>{if(token){token='';render();status('Signed out.');return;}$('#ownerForm').reset();$('#ownerError').textContent='';$('#ownerDialog').showModal();};
$('#ownerCancel').onclick=()=>{$('#ownerToken').value='';$('#ownerDialog').close();};
$('#ownerDialog').addEventListener('close',()=>{$('#ownerToken').value='';});
$('#ownerForm').onsubmit=async e=>{e.preventDefault();const button=$('#ownerForm button[type="submit"]');button.disabled=true;token=$('#ownerToken').value.trim();$('#ownerToken').value='';try{const repo=await request('');if(repo.permissions?.admin!==true)throw Error('Sign in with the repository owner’s token.');$('#ownerDialog').close();status('Owner mode. Changes are published for everyone.');render();}catch(err){token='';$('#ownerError').textContent=err.message;}finally{button.disabled=false;}};
$('#importBtn').onclick=async()=>{const added=localGames();if(!confirm('Publish '+added.length+' browser-saved games so everyone can see them? Existing names will be skipped.'))return;try{await publish(current=>{for(const g of validate(added))if(!current.some(x=>x.name.toLowerCase()===g.name.toLowerCase()))current.push(g);return current;},'Import browser-saved games');status('Browser games published. Your local backup was kept. The site will redeploy shortly.');}catch(err){status(err.message);}};
$('#addGameBtn').onclick=()=>openAdd();for(const id of ['closeDialog','cancelAdd'])$('#'+id).onclick=()=>{if(!busy)$('#addDialog').close();};
$('#addDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
for(const id of ['q','players','sort'])$('#'+id).addEventListener('input',render);
for(const tab of document.querySelectorAll('.tab'))tab.onclick=()=>{kind=tab.dataset.filter;document.querySelector('.tab.active').classList.remove('active');tab.classList.add('active');render();};
render();load();setInterval(()=>{if(!document.hidden)load();},60000);
