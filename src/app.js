import {MY_TEAM,fmtTime,fmtShort,reconstruct,impactOf,lossOf,opportunityFor,requiredPlayers,stationHistory,findOperations,recentCaptures,eventFeed,dailyTickets,displayedScore} from './engine.js?v=20261124-universal1';
const paths=['topology.json','rules.json','checkpoint.json','captures.json'];
const liveCaptures='https://raw.githubusercontent.com/anlexcz/lalinia/main/data/captures.json';
const liveSyncStatus='https://raw.githubusercontent.com/anlexcz/lalinia/main/data/sync-status.json';
let lastSuccessfulSync=null;
const app=document.querySelector('#app');
const routes={overview:'prehled',map:'mapa',strategy:'operace',events:'udalosti'};
const viewFromHash=()=>Object.keys(routes).find(key=>'#/'+routes[key]===window.location.hash)||'overview';
let data={},state,view=viewFromHash(),players=4,selected=null,search='',sortBy='value',now=Date.now(),operationsCache=[],showAreaPoints=true,eventTeam='all',eventKind='all',eventsLimit=30,includeAreaScore=true,scoreMode='total';
let strategicMap=null;
let selectedTeam=(()=>{try{return localStorage.getItem('lalinia-team')||'Cosa Nostra'}catch{return 'Cosa Nostra'}})(),expandedScore=null,operationTab='attack',opponent='all',mapTram=true,mapTrain=true,mapEdges=true,eventSearch='',operationSearch='';
let mapViewState={center:[14.42,50.087],zoom:11.4,userMoved:false};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const teamColor=owner=>({'Cosa Nostra':'#32b968','Spiriti':'#5797db','Zemunski klan':'#a475d8','Yakuza':'#e56a67','Los Bandidos':'#dcb467'})[owner]||'#64746b';
const cap=n=>Number(n||0).toLocaleString('cs-CZ');
async function fetchCaptures(){
 // GitHub Actions commits made with GITHUB_TOKEN do not trigger a Pages rebuild.
 // Read the public raw file on main directly; fall back to the published snapshot.
 try {
  const r=await fetch(liveCaptures+'?v='+Math.floor(Date.now()/120000),{cache:'no-store'});
  if(!r.ok)throw new Error('Raw '+r.status);
  const events=await r.json();
  if(!Array.isArray(events)||!events.length)throw new Error('Prázdná historie');
  return events;
 }catch(err){
  console.warn('GitHub raw data unavailable, using Pages snapshot:',err);
  const r=await fetch('./data/captures.json?v='+Math.floor(Date.now()/120000),{cache:'no-store'});
  if(!r.ok)throw new Error('captures.json HTTP '+r.status);
  const events=await r.json();
  if(!Array.isArray(events)||!events.length)throw new Error('Prázdná historie');
  return events;
 }
}
async function fetchSyncStatus(){
 try{
  const r=await fetch(liveSyncStatus+'?v='+Math.floor(Date.now()/60000),{cache:'no-store'});
  if(!r.ok)return;
  const status=await r.json();
  const ms=Date.parse(status.last_success_utc||'');
  if(Number.isFinite(ms)&&ms>0&&ms<=Date.now()+60000)lastSuccessfulSync=ms;
 }catch(err){console.warn('Čas poslední úspěšné synchronizace není dostupný:',err);}
}
function syncTimestamp(){
 if(!lastSuccessfulSync)return 'Čeká na první ověřenou synchronizaci';
 const date=new Date(lastSuccessfulSync);
 const formatDay=ms=>new Date(ms).toLocaleDateString('sv-SE',{timeZone:'Europe/Prague'});
 const time=date.toLocaleTimeString('cs-CZ',{timeZone:'Europe/Prague',hour:'2-digit',minute:'2-digit'});
 return formatDay(lastSuccessfulSync)===formatDay(Date.now())?'Dnes '+time:date.toLocaleDateString('cs-CZ',{timeZone:'Europe/Prague',day:'numeric',month:'numeric'})+' '+time;
}
async function load(){
 try{
  const content=await Promise.all(paths.map(p=>p==='captures.json'?fetchCaptures():fetch('./data/'+p+'?v='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(p+' HTTP '+r.status);return r.json();})));
  [data.topology,data.rules,data.checkpoint,data.captures]=content;
  await fetchSyncStatus();refresh();
 }catch(e){app.innerHTML=`<div class="loading bad">Nelze načíst data: ${esc(e.message)}</div>`;}
}
function refresh(){now=Date.now();state=reconstruct(data.topology,data.rules,data.checkpoint,data.captures,now);operationsCache=[];render(true);}
function nav(){return `<nav class="nav">${[['overview','Přehled'],['map','Mapa'],['strategy','Operace'],['events','Události']].map(([id,name])=>`<a href="#/${routes[id]}" data-view="${id}" class="${view===id?'active':''}" ${view===id?'aria-current="page"':''}>${name}</a>`).join('')}</nav>`;}
function top(){
 const warning=state.errors.length?`<div class="warning">${state.errors.length} chyb ve vstupních událostech: ${esc(state.errors[0])}</div>`:'';
 return `<header class="top"><div><div class="eyebrow">LA LINIA</div><h1>Herní přehled</h1></div><div class="top-controls"><label for="selected-team">Pohled týmu</label><select id="selected-team">${Object.keys(state.scoring).map(t=>`<option ${t===selectedTeam?'selected':''} value="${esc(t)}">${esc(t)}</option>`).join('')}</select><span class="stamp" id="sync-stamp">Poslední aktualizace: ${syncTimestamp()}</span></div></header>${warning}`;
}
function card(name,num){return `<div class="card"><span class="sub">${name}</span><strong>${num}</strong></div>`;}
function personFilter(){return `<div class="filter"><label for="players">Dostupní hráči</label><select id="players">${[3,4,5,6,7,8,9,10,12].map(n=>`<option value="${n}" ${players===n?'selected':''}>${n} hráčů</option>`).join('')}</select></div>`;}
function targets(){return [...state.states.values()].filter(t=>t.category==='tram'&&t.owner!==selectedTeam).map(t=>impactOf(state,t.id,data.rules,selectedTeam)).filter(Boolean).filter(t=>opponent==='all'||t.owner===opponent).sort((a,b)=>b.score-a.score)}
function overview(){
 const tickets=dailyTickets(state,data.rules,now);
 // Decay view = tramvajové body, které již nejsou odečitatelné přes aktuální hodnoty vlastněných zastávek.
 const decayPoints=name=>{
  const score=state.scoring[name];
  const atRisk=[...state.states.values()].filter(t=>t.category==='tram'&&t.owner===name).reduce((sum,t)=>sum+t.value*(t.is_terminus?data.rules.terminus_multiplier:1),0);
  return score.tram-atRisk;
 };
 const ranking=Object.entries(state.scoring).sort((a,b)=>{
  const points=([name,score])=>scoreMode==='decay'?decayPoints(name):displayedScore(score,scoreMode==='total');
  return points([b[0],b[1]])-points([a[0],a[1]])||a[0].localeCompare(b[0],'cs');
 });
 const modes=`<div class="score-modes"><button data-score-mode="total" class="${scoreMode==='total'?'active':''}">Celkem</button><button data-score-mode="base" class="${scoreMode==='base'?'active':''}">Bez území</button><button data-score-mode="decay" class="${scoreMode==='decay'?'active':''}">Decay</button></div>`;
 const rows=ranking.map(([name,score],i)=>{
  const ticket=tickets.teams[name],expanded=expandedScore===name;
  const atRisk=[...state.states.values()].filter(t=>t.category==='tram'&&t.owner===name).reduce((sum,t)=>sum+t.value*(t.is_terminus?data.rules.terminus_multiplier:1),0);
  const retained=decayPoints(name);
  const values=[['Tramvaje',atRisk],['Decay',retained],['Vlaky',score.train],['Metro',score.metro],['Území',score.area]],sum=values.reduce((n,[,v])=>n+Math.max(0,v),0);
  const details=expanded?`<div class="score-detail"><div class="score-breakdown">${values.map(([label,value])=>`<div><span>${label}</span><b>${cap(value)}</b></div>`).join('')}</div><div class="score-bar">${values.filter(([,v])=>v>0).map(([label,v])=>`<span title="${esc(label)}: ${cap(v)}" style="width:${sum?100*v/sum:0}%;background:${({'Tramvaje':'#5ac58d','Decay':'#b4d98f','Vlaky':'#75a7e8','Metro':'#dfb268','Území':'#a97bd8'})[label]}"></span>`).join('')}</div><div class="score-legend">Tramvaje v riziku · Decay · Vlaky · Metro · Území</div></div>`:'';
  return `<div class="score-entry"><button class="score-row score-button" data-expand-team="${esc(name)}" aria-expanded="${expanded}"><span class="teamline"><i class="dot" style="background:${teamColor(name)}"></i>${i+1}. ${esc(name)}</span><strong>${cap(scoreMode==='decay'?retained:displayedScore(score,scoreMode==='total'))}</strong><span class="ticket-remaining">${cap(ticket.remaining)} / ${ticket.limit}</span><span class="chevron">${expanded?'⌃':'⌄'}</span></button>${details}</div>`;
 }).join('');
 const recent=eventFeed(state).filter(x=>x.ms>=now-3600000);
 return `<section class="panel score-panel"><div class="score-panel-head"><h2>Pořadí týmů</h2>${modes}</div><div class="score-head"><span>Tým</span><span>Body</span><span>Jízdenky</span><span></span></div>${rows}</section><section class="panel recent-panel"><div class="section-head"><h2>Posledních 60 minut</h2><button data-view="events" class="text-link">Všechny události ›</button></div>${recent.length?recent.map(eventCard).join(''):'<div class="empty">Za posledních 60 minut není zaznamenána žádná událost.</div>'}</section>`;
}
function eventCard(e){
 const changes=e.impact?.changes||{},gain=changes[e.team],loss=e.previousOwner&&e.previousOwner!==e.team?changes[e.previousOwner]:null;
 const relation=e.kind==='takeover'?`${esc(e.team)} · převzetí od ${esc(e.previousOwner)}`:`${esc(e.team)} · ${e.kind==='reinforce'?'posílení':'první obsazení'}`;
 const signed=n=>`${n>0?'+':n<0?'−':''}${cap(Math.abs(n))}`;
 const retained=e.impact?.retainedOnTakeover||0;
 const score=e.impact?`<div class="event-score-line">${gain?`<span class="event-score-gain">${esc(e.team)} <strong class="good">${signed(gain.total)}</strong></span>`:''}${loss?`<span class="event-score-loss">${esc(e.previousOwner)} <strong class="bad">${signed(loss.total)}</strong>${e.kind==='takeover'?` <small class="event-retained">(+${cap(retained)} decay)</small>`:''}</span>`:''}</div>`:'<small class="event-unverified">Bodové změny před checkpointem nejsou přesně doložené.</small>';
 const terminal=state.graph.stations.get(e.stationId)?.is_terminus;
 return `<div class="event-card"><button class="event-open" data-station="${e.stationId}"><span class="event-value-wrap"><span class="event-value ${e.category==='train'?'train':''}" style="background:${teamColor(e.team)}">${e.value}</span></span><span class="event-main"><b class="${terminal?'terminus-name':''}" ${terminal?'title="Konečná zastávka: přímé body ×2"':''}>${esc(e.station)}</b><small>${relation}</small><small class="event-time">${fmtShort(e.ms)} · ${e.value} hráčů</small>${score}</span><span class="event-chevron" aria-hidden="true">›</span></button></div>`;
}
function targetRowSimple(x){return `<div class="row"><button data-station="${x.station.id}"><b>${esc(x.station.name)}</b><br><span class="muted">${esc(x.owner||'Neutrální')} · ${x.cost} jízdenek · území ${x.areaGain>=0?'+':''}${x.areaGain}</span></button><span><strong class="good">+${cap(x.gain)}</strong>${x.owner?`<br><span class="bad note">−${cap(x.enemyLoss)} soupeř</span>`:''}</span></div>`;}
function defenses(){return [...state.states.values()].filter(t=>t.category==='tram'&&t.owner===selectedTeam).map(t=>lossOf(state,t.id,data.rules,selectedTeam)).filter(Boolean).sort((a,b)=>b.loss-a.loss)}
function opportunities(){return [...state.states.values()].filter(t=>t.category==='tram'&&t.owner!==selectedTeam).map(t=>{const o=opportunityFor(t,data.rules,players,now,selectedTeam);return o?{station:t,...o,impact:impactOf(state,t.id,data.rules,selectedTeam)}:null}).filter(Boolean).sort((a,b)=>a.at-b.at)}
function attackView(){const items=targets().filter(x=>x.cost<=players&&x.station.name.toLocaleLowerCase('cs').includes(search.toLocaleLowerCase('cs')));items.sort((a,b)=>sortBy==='value'?b.score-a.score:sortBy==='cost'?a.cost-b.cost:b.gain-a.gain);return `<div class="toolbar"><h2>Výhodné útoky</h2>${personFilter()}<div class="filter"><input id="search" placeholder="Hledat zastávku…" value="${esc(search)}"/><select id="sort"><option value="value" ${sortBy==='value'?'selected':''}>Celkový dopad</option><option value="gain" ${sortBy==='gain'?'selected':''}>Náš zisk</option><option value="cost" ${sortBy==='cost'?'selected':''}>Cena</option></select></div></div><div class="panel"><div class="list-head"><span>Zastávka</span><span>Hráčů</span><span>Náš zisk</span><span>Soupeř</span></div>${items.map(x=>`<div class="target-row"><button data-station="${x.station.id}">${esc(x.station.name)}<br><span class="note">${esc(x.owner||'Neutrální')}${x.station.is_terminus?' · konečná':''}</span></button><span>${x.cost}</span><span class="score good">+${cap(x.gain)}</span><span class="score bad">${x.owner?'−'+cap(x.enemyLoss):'—'}</span></div>`).join('')||'<div class="empty">Žádné cíle při zvoleném počtu hráčů.</div>'}</div>`;}
function opportunitiesView(){const o=opportunities();return `<div class="toolbar"><h2>Časová okna decay</h2>${personFilter()}</div><div class="panel"><h3>Dostupné nyní</h3>${o.filter(x=>x.now).slice(0,30).map(x=>`<div class="row"><button data-station="${x.station.id}">${esc(x.station.name)} <span class="note">${esc(x.station.owner||'Neutrální')}</span></button><b>${x.needed} hráči</b></div>`).join('')||'<div class="empty">Žádné dostupné zastávky.</div>'}<h3 style="margin-top:25px">Budoucí dostupnost</h3>${o.filter(x=>!x.now).map(x=>`<div class="row"><button data-station="${x.station.id}"><b>${esc(x.station.name)}</b><br><span class="note">${esc(x.station.owner)} · hodnota ${x.station.value} → při poklesu bude stačit ${x.needed}</span></button><b>${fmtShort(x.at)}</b></div>`).join('')||'<div class="empty">Žádná nová příležitost.</div>'}</div>`;}
function defenseView(){return `<div class="toolbar"><h2>Obrana našich území</h2></div><div class="panel">${defenses().map(x=>`<div class="row"><button data-station="${x.station.id}"><b>${esc(x.station.name)}</b><br><span class="note">Hodnota ${x.station.value} · soupeř potřebuje ${x.needed} hráčů${x.station.pending.length?' · další pokles '+fmtShort(x.station.pending[0].at):''}</span></button><b class="bad">−${cap(x.loss)}</b></div>`).join('')}</div>`;}
function operationsView(){
 if(!operationsCache.length||operationsCache.players!==players){operationsCache=findOperations(state,data.rules,players,36);operationsCache.players=players;}
 const best=operationsCache.filter(o=>o.cost<=36).slice(0,24);
 return `<div class="toolbar"><h2>Společné operace</h2>${personFilter()}</div><section class="panel">${best.map((o,i)=>`<div class="operation"><div class="operation-heading"><b>${i+1}. ${o.ids.map(id=>esc(state.states.get(id).name)).join(' + ')}</b><strong class="good">+${cap(o.ourGain)} nám</strong></div><div class="op-details"><span>${o.maxPlayers} hráčů max.</span><span>${o.cost} jízdenek</span><span class="bad">−${cap(o.opponentLoss)} soupeřům</span><span>Proti lídrovi +${cap(o.leaderGapChange)}</span></div><div class="operation-links">${o.ids.map(id=>`<button class="pill" data-station="${id}">${esc(state.states.get(id).name)} ↗</button>`).join('')}</div></div>`).join('')||'<div class="empty">Pro tuto skupinu zatím žádné dostupné kombinace.</div>'}</section>`;
}
function strategyView(){
 const modes=`<div class="score-modes"><button data-operation-tab="attack" class="${operationTab==='attack'?'active':''}">Útok</button><button data-operation-tab="defense" class="${operationTab==='defense'?'active':''}">Obrana</button></div>`;
 const teamFilter=operationTab==='attack'?`<div class="filter"><label for="opponent">Cílový tým</label><select id="opponent"><option value="all">Všechny týmy</option>${Object.keys(state.scoring).filter(t=>t!==selectedTeam).map(t=>`<option value="${esc(t)}" ${opponent===t?'selected':''}>${esc(t)}</option>`).join('')}</select></div>`:'';
 const query=operationSearch.trim().toLocaleLowerCase('cs');
 const matchName=t=>!query||t.station.name.toLocaleLowerCase('cs').includes(query);
 const list=operationTab==='attack'?targets().filter(t=>t.cost<=players&&(!t.station.protectedUntil||now>=t.station.protectedUntil)&&matchName(t)).slice(0,100).map(t=>{
  const direct=t.cost*(t.station.is_terminus?data.rules.terminus_multiplier:1)+(t.owner?0:data.rules.first_capture_bonus);
  return `<button class="strategy-row" data-station="${t.station.id}"><span class="strategy-subject"><b>${esc(t.station.name)}</b><small><i class="dot" style="background:${teamColor(t.owner)}"></i>${esc(t.owner||'Neutrální')} · ${t.cost} hráčů</small></span><span class="strategy-scores"><b class="good">+${cap(t.gain)} bodů</b><small>+${cap(direct)} přímé${t.owner?` · soupeř −${cap(t.enemyLoss)}`:''}</small></span></button>`;
 }).join(''):defenses().filter(matchName).slice(0,100).map(t=>{
  const mult=t.station.is_terminus?data.rules.terminus_multiplier:1;
  return `<button class="strategy-row" data-station="${t.station.id}"><span class="strategy-subject"><b>${esc(t.station.name)}</b><small>Hodnota ${t.station.value} · k převzetí ${t.needed} hráčů</small></span><span class="strategy-scores"><b class="bad">−${cap(t.loss)} bodů</b><small>−${cap(t.station.value*mult)} přímé${t.station.protectedUntil&&t.station.protectedUntil>now?' · chráněná':''}</small></span></button>`;
 }).join('');
 return `<div class="toolbar"><h2>Operace · ${esc(selectedTeam)}</h2>${modes}</div><div class="operation-filters">${operationTab==='attack'?personFilter():''}${teamFilter}<div class="filter operation-search-filter"><label for="operation-search">Zastávka</label><input id="operation-search" type="search" autocomplete="off" placeholder="Hledat zastávku…" value="${esc(operationSearch)}"></div></div><div class="strategy-context">${operationTab==='attack'?'Možný zisk včetně území':'Možná ztráta včetně území'}</div><section class="panel strategy-list">${list||'<div class="empty">Žádné odpovídající zastávky.</div>'}</section>`;
}
function eventsView(){
 const teams=Object.keys(state.scoring);
 const rows=eventFeed(state,{team:eventTeam,kind:eventKind}).filter(x=>!eventSearch||x.station.toLocaleLowerCase('cs').includes(eventSearch.toLocaleLowerCase('cs')));
 const select=(id,opts,value)=>`<select id="${id}">${opts.map(([v,label])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(label)}</option>`).join('')}</select>`;
 const formatDay=ms=>new Date(ms).toLocaleDateString('sv-SE',{timeZone:'Europe/Prague'});
 const today=formatDay(now),yesterday=formatDay(now-86400000);
 const prettyDay=ms=>new Date(ms).toLocaleDateString('cs-CZ',{timeZone:'Europe/Prague',weekday:'long',day:'numeric',month:'long'});
 let previousDay=null;
 const list=rows.slice(0,eventsLimit).map(e=>{
  const day=formatDay(e.ms),heading=day!==previousDay?`<div class="event-day-heading">${day===today?'Dnes':day===yesterday?'Včera':prettyDay(e.ms)}</div>`:'';
  previousDay=day;
  return heading+eventCard(e);
 }).join('');
 return `<div class="toolbar"><h2>Události</h2><span class="note">${rows.length} záznamů</span></div><div class="event-filters">${select('event-team',[['all','Všechny týmy'],...teams.map(t=>[t,t])],eventTeam)}${select('event-kind',[['all','Všechny typy'],['first','První obsazení'],['takeover','Převzetí'],['reinforce','Posílení']],eventKind)}<input id="event-search" placeholder="Hledat zastávku…" value="${esc(eventSearch)}"></div><section class="panel event-list">${list||'<div class="empty">Žádné odpovídající události.</div>'}</section>${rows.length>eventsLimit?`<button class="load-more" id="more-events">Načíst dalších 30 · zbývá ${rows.length-eventsLimit}</button>`:''}`;
}
function mapView(){
 const n=[...state.states.values()].filter(t=>t.category==='tram').length;
 return `<div class="toolbar"><h2>Herní mapa</h2><span class="note">${n} tramvajových zastávek</span></div><div class="map-layers"><label><input type="checkbox" id="map-tram" ${mapTram?'checked':''}> Tramvaje</label><label><input type="checkbox" id="map-train" ${mapTrain?'checked':''}> Vlaky</label><label><input type="checkbox" id="map-edges" ${mapEdges?'checked':''}> Spojnice</label></div><div class="map-wrap"><div id="strategic-map" class="strategic-map"></div></div>`;
}
function initStrategicMap(){
 const el=document.getElementById('strategic-map');if(!el)return;
 if(typeof window.L==='undefined'){el.innerHTML='<div class="empty">Mapovou knihovnu se nepodařilo načíst.</div>';return;}
 const points=[...state.states.values()].filter(s=>((s.category==='tram'&&mapTram)||(s.category==='train'&&mapTrain&&s.value>0))&&Number.isFinite(s.lat)&&Number.isFinite(s.lon));
 const map=L.map(el,{zoomControl:false,minZoom:9,maxZoom:19,preferCanvas:true,scrollWheelZoom:true});
 strategicMap=map;
 map.setView([mapViewState.center[1],mapViewState.center[0]],mapViewState.zoom,{animate:false});
 L.control.zoom({position:'topright'}).addTo(map);
 let tilesLoaded=false,tilesFailed=0;
 const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
   attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
   maxZoom:19, minZoom:9, className:'osm-gray',crossOrigin:false
 });
 tiles.on('tileload',()=>{tilesLoaded=true;const warning=el.querySelector('.map-load-warning');if(warning)warning.remove();});
 tiles.on('tileerror',()=>{tilesFailed++;if(tilesFailed>=4&&!tilesLoaded&&!el.querySelector('.map-load-warning')){const warning=document.createElement('div');warning.className='map-load-warning';warning.textContent='Podklad nedostupný';el.appendChild(warning);}});
 tiles.addTo(map);
 const updateMarkerDensity=()=>{if(strategicMap===map)map.getContainer().classList.toggle('map-distant',map.getZoom()<11);};
 map.on('zoomend',updateMarkerDensity);
 map.on('moveend zoomend',()=>{if(strategicMap!==map)return;const center=map.getCenter();mapViewState={center:[center.lng,center.lat],zoom:map.getZoom(),userMoved:true};});
 // Spojnice vyjadřují pouze skutečně propojená území: obě koncové
 // tramvajové zastávky musejí patřit STEJNÉMU nenulovému týmu.
 // Hrany mezi soupeři ani neutrálními zastávkami se nekreslí.
 const edgeHalo=map.createPane('edge-halo'),edgeLine=map.createPane('edge-lines');
 edgeHalo.style.zIndex='410';edgeLine.style.zIndex='415';
 edgeHalo.style.pointerEvents='none';edgeLine.style.pointerEvents='none';
 if(mapEdges&&mapTram)data.topology.edges.forEach(e=>{
  const from=state.states.get(e.from),to=state.states.get(e.to);
  if(!from||!to||from.category!=='tram'||to.category!=='tram'||!from.owner||from.owner!==to.owner)return;
  const coords=(e.geometry?.length?e.geometry:[[from.lat,from.lon],[to.lat,to.lon]]).filter(p=>Number.isFinite(p?.[0])&&Number.isFinite(p?.[1]));
  if(coords.length>=2){
   L.polyline(coords,{pane:'edge-halo',color:'#0d1712',weight:5.5,opacity:.95,interactive:false,smoothFactor:1}).addTo(map);
   L.polyline(coords,{pane:'edge-lines',color:teamColor(from.owner),weight:3,opacity:1,interactive:false,smoothFactor:1}).addTo(map);
  }
 });
 points.forEach(s=>{
   const icon=L.divIcon({html:'<div class="map-point '+(s.category==='train'?'train':'')+'" style="background:'+teamColor(s.owner)+'">'+s.value+'</div>',className:'map-point-wrap',iconSize:[27,27],iconAnchor:[13,13]});
   const marker=L.marker([s.lat,s.lon],{icon});
   marker.bindTooltip(esc(s.name)+' · '+esc(s.owner||'Neutrální')+' · '+s.value,{direction:'top'});
   marker.on('click',()=>{selected=s.id;render();});
   marker.addTo(map);
 });
 if(!mapViewState.userMoved){
  const bounds=L.latLngBounds(points.map(s=>[s.lat,s.lon]));
  if(points.length)map.fitBounds(bounds.pad(.06),{animate:false});
  const center=map.getCenter();mapViewState={center:[center.lng,center.lat],zoom:map.getZoom(),userMoved:false};
 }
 updateMarkerDensity();
 setTimeout(()=>{if(strategicMap===map)map.invalidateSize();},40);
}
function stationDetail(id){
 const s=state.states.get(id);if(!s)return '';
 const own=s.owner===selectedTeam;
 const mult=s.is_terminus?data.rules.terminus_multiplier:1;
 const impact=s.category==='tram'&&!own?impactOf(state,id,data.rules,selectedTeam):null;
 const risk=s.category==='tram'&&own?lossOf(state,id,data.rules,selectedTeam):null;
 const history=stationHistory(state,id);
 const historyHtml=history.length?history.map(e=>`<div class="history-row"><span class="history-marker" style="background:${teamColor(e.team)}"></span><div class="history-content"><b>${fmtTime(e.ms)}</b><span class="history-team"><i class="dot" style="background:${teamColor(e.team)}"></i>${esc(e.team)} · ${e.value} hráčů</span><span class="note">${e.kind==='first'?'První obsazení':e.kind==='reinforce'?'Posílení':'Převzetí od '+esc(e.previousOwner)}${e.author?' · '+esc(e.author):''}</span></div></div>`).join(''):'<div class="empty">Zatím žádné doložené obsazení.</div>';
 const currentProtection=Boolean(s.protectedUntil&&s.protectedUntil>now);
 const future=s.pending||[];
 const decay=future.length?`<div class="decay-list">${future.map(t=>`<div class="decay-item"><span class="decay-values">${t.from} → ${t.to}</span><span class="decay-meta"><b>${fmtTime(t.at)}</b><small>K převzetí ${requiredPlayers(t.to,s.owner,data.rules)} hráči</small></span></div>`).join('')}</div><p class="detail-caption">Předpověď podle modelu hry; serverové časy decay nejsou nezávisle ověřené.</p>`:'<div class="empty compact-empty">Žádné další poklesy hodnoty.</div>';
 const metric=(title,value,extra='')=>`<div class="detail-metric"><span>${title}</span><b class="${extra}">${value}</b></div>`;
 const number=n=>`${n>0?'+':n<0?'−':''}${cap(Math.abs(n))}`;
 let scoreHtml='';
 if(impact){
  const directGain=impact.cost*mult+(s.owner?0:data.rules.first_capture_bonus);
  const directLoss=s.owner?s.value*mult:0;
  scoreHtml=`<div class="detail-section"><h3>Možný útok</h3><div class="detail-score-table"><div class="score-table-head"><span></span><span>${esc(selectedTeam)}</span><span>${s.owner?esc(s.owner):'Neutrální'}</span></div><div class="score-table-line"><span>Přímé body</span><b class="good">${number(directGain)}</b><b class="bad">${s.owner?number(-directLoss):'—'}</b></div><div class="score-table-line strong"><span>Celkem s územím</span><b class="good">${number(impact.gain)}</b><b class="bad">${s.owner?number(-impact.enemyLoss):'—'}</b></div></div></div>`;
 }else if(risk){
  const directLoss=s.value*mult;
  const kept=s.capture?Math.max(0,(s.capture.value-s.value)*mult):0;
  scoreHtml=`<div class="detail-section"><h3>Možná ztráta</h3>${metric('Přímé body',number(-directLoss),'bad')}${metric('Celkem s územím',number(-risk.loss),'bad')}${kept?metric('Zůstane díky decay',number(kept),'good'):''}<p class="detail-caption">Zisk případného útočníka nelze bez jeho týmu určit.</p></div>`;
 }else if(s.category==='train'){
  scoreHtml='<div class="detail-section"><h3>Vlakový event</h3><p class="detail-caption">Územní ani tramvajový model útoku se na tento event nepoužívá.</p></div>';
 }
 return `<section class="panel detail"><div class="detail-top"><div class="detail-heading"><div class="eyebrow">DETAIL ZASTÁVKY</div><div class="detail-name-line"><h2 class="${s.is_terminus?'terminus-name':''}" ${s.is_terminus?'title="Konečná zastávka: přímé body ×2"':''}>${esc(s.name)}</h2><span class="detail-value ${s.category==='train'?'train':''}" style="background:${teamColor(s.owner)}">${s.value}</span></div><span class="teamline"><i class="dot" style="background:${teamColor(s.owner)}"></i>${esc(s.owner||'Neutrální')}${s.is_terminus?' · konečná':''}</span></div><button id="close-detail" aria-label="Zavřít detail zastávky" title="Zavřít detail" type="button">×</button></div>
 <div class="detail-section detail-facts">
 ${metric('K převzetí',s.needed+' hráči')}
 ${s.capture?metric('Poslední obsazení',fmtTime(s.capture.ms))+metric('Poslední skupina',s.capture.value+' hráči')+metric('Ochrana',currentProtection?'Do '+fmtTime(s.protectedUntil):'Ukončena',currentProtection?'bad':''):'<p class="note">Zatím bez zaznamenaného obsazení.</p>'}
 </div>
 ${scoreHtml}
 <div class="detail-section"><h3>Budoucí decay</h3>${decay}</div>
 <div class="detail-section"><h3>Historie obsazení <span class="detail-count">(${history.length})</span></h3><div class="history-list">${historyHtml}</div></div></section>`;
}

function render(preserveScroll=false){const scrollY=window.scrollY;if(strategicMap){const m=strategicMap;strategicMap=null;m.remove();}const body=view==='overview'?overview():view==='map'?mapView():view==='strategy'?strategyView():view==='events'?eventsView():overview();app.innerHTML=`<div class="app">${top()}${nav()}${selected!==null?stationDetail(selected):body}</div>`; if(view==='map'&&selected===null) initStrategicMap();if(preserveScroll)window.scrollTo(0,scrollY);}
app.addEventListener('click',e=>{const exp=e.target.closest('[data-expand-team]');if(exp){expandedScore=expandedScore===exp.dataset.expandTeam?null:exp.dataset.expandTeam;render();return;}const tab=e.target.closest('[data-operation-tab]');if(tab){operationTab=tab.dataset.operationTab;render();return;}const st=e.target.closest('[data-station]');if(st){selected=Number(st.dataset.station);render();return;}const v=e.target.closest('[data-view]');if(v){const route=v.dataset.view;selected=null;if(view===route){render();return;}view=route;window.location.hash='/'+routes[route];render();window.scrollTo(0,0);return;}if(e.target.closest('#close-detail')){selected=null;render();return;}if(e.target.closest('#more-events')){eventsLimit+=30;render();return;}const mode=e.target.closest('[data-score-mode]');if(mode){scoreMode=mode.dataset.scoreMode;includeAreaScore=scoreMode==='total';render();return;}});
app.addEventListener('change',e=>{if(e.target.id==='players'){players=Number(e.target.value);operationsCache=[];render();}if(e.target.id==='sort'){sortBy=e.target.value;render();}if(e.target.id==='area-points'){showAreaPoints=e.target.checked;render();}if(e.target.id==='event-team'){eventTeam=e.target.value;eventsLimit=30;render();}if(e.target.id==='event-kind'){eventKind=e.target.value;eventsLimit=30;render();}if(e.target.id==='selected-team'){selectedTeam=e.target.value;try{localStorage.setItem('lalinia-team',selectedTeam)}catch{}render();}if(e.target.id==='opponent'){opponent=e.target.value;render();}if(e.target.id==='map-tram'){mapTram=e.target.checked;render();}if(e.target.id==='map-train'){mapTrain=e.target.checked;render();}if(e.target.id==='map-edges'){mapEdges=e.target.checked;render();}});
app.addEventListener('input',e=>{if(e.target.id==='event-search'){eventSearch=e.target.value;eventsLimit=30;const pos=e.target.selectionStart;render();const el=document.getElementById('event-search');el?.focus();el?.setSelectionRange(pos,pos);return;}if(e.target.id==='operation-search'){operationSearch=e.target.value;const pos=e.target.selectionStart;render();const el=document.getElementById('operation-search');el?.focus();el?.setSelectionRange(pos,pos);return;}if(e.target.id==='search'){search=e.target.value; const pos=e.target.selectionStart;render();const el=document.getElementById('search');el?.focus();el?.setSelectionRange(pos,pos);}});
window.addEventListener('hashchange',()=>{const next=viewFromHash();if(next!==view||selected!==null){view=next;selected=null;if(state){render();window.scrollTo(0,0);}}});
load();
setInterval(()=>{if(data.topology)refresh();},60000);
setInterval(async()=>{if(!data.topology)return;await fetchSyncStatus();const el=document.getElementById('sync-stamp');if(el)el.textContent='Poslední aktualizace: '+syncTimestamp();},60000);
setInterval(async()=>{
 if(!data.topology)return;
 try{
  const captures=await fetchCaptures();
  const previousId=Math.max(...data.captures.map(e=>e.id));
  const incomingId=Math.max(...captures.map(e=>e.id));
  if(incomingId>previousId && captures.length>=data.captures.length){
   data.captures=captures;refresh();
  }
 }catch(e){console.warn('Aktualizaci historie nelze načíst:',e);}
},120000);
