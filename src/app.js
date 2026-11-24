import {MY_TEAM,fmtTime,fmtShort,reconstruct,impactOf,lossOf,opportunityFor,requiredPlayers,stationHistory,findOperations,recentCaptures,eventFeed,dailyTickets,displayedScore} from './engine.js';
const paths=['topology.json','rules.json','checkpoint.json','captures.json'];
const liveCaptures='https://raw.githubusercontent.com/anlexcz/lalinia/main/data/captures.json';
const app=document.querySelector('#app');
let data={},state,view='overview',players=4,selected=null,search='',sortBy='value',now=Date.now(),operationsCache=[],showAreaPoints=true,eventTeam='all',eventKind='all',eventsLimit=30,includeAreaScore=true;
let strategicMap=null;
let selectedTeam=(()=>{try{return localStorage.getItem('lalinia-team')||'Cosa Nostra'}catch{return 'Cosa Nostra'}})(),expandedScore=null,operationTab='attack',opponent='all',mapTram=true,mapTrain=true,mapEdges=true,eventSearch='';
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
async function load(){
 try{
  const content=await Promise.all(paths.map(p=>p==='captures.json'?fetchCaptures():fetch('./data/'+p+'?v='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(p+' HTTP '+r.status);return r.json();})));
  [data.topology,data.rules,data.checkpoint,data.captures]=content;refresh();
 }catch(e){app.innerHTML=`<div class="loading bad">Nelze načíst data: ${esc(e.message)}</div>`;}
}
function refresh(){now=Date.now();state=reconstruct(data.topology,data.rules,data.checkpoint,data.captures,now);operationsCache=[];render();}
function nav(){return `<nav class="nav">${[['overview','Přehled'],['map','Mapa'],['strategy','Operace'],['events','Události']].map(([id,name])=>`<button data-view="${id}" class="${view===id?'active':''}">${name}</button>`).join('')}</nav>`;}
function top(){
 const warning=state.errors.length?`<div class="warning">${state.errors.length} chyb ve vstupních událostech: ${esc(state.errors[0])}</div>`:'';
 return `<header class="top"><div><div class="eyebrow">LA LINIA</div><h1>Herní přehled</h1></div><div class="top-controls"><label for="selected-team">Pohled týmu</label><select id="selected-team">${Object.keys(state.scoring).map(t=>`<option ${t===selectedTeam?'selected':''} value="${esc(t)}">${esc(t)}</option>`).join('')}</select><span class="stamp">Poslední událost ${state.latestEvent?fmtTime(state.latestEvent):'bez událostí'}</span></div></header>${warning}`;
}
function card(name,num){return `<div class="card"><span class="sub">${name}</span><strong>${num}</strong></div>`;}
function personFilter(){return `<div class="filter"><label for="players">Dostupní hráči</label><select id="players">${[3,4,5,6,7,8,9,10,12].map(n=>`<option value="${n}" ${players===n?'selected':''}>${n} hráčů</option>`).join('')}</select></div>`;}
function targets(){return [...state.states.values()].filter(t=>t.category==='tram'&&t.owner!==selectedTeam).map(t=>impactOf(state,t.id,data.rules,selectedTeam)).filter(Boolean).filter(t=>opponent==='all'||t.owner===opponent).sort((a,b)=>b.score-a.score)}
function overview(){
 const tickets=dailyTickets(state,data.rules,now);
 const ranking=Object.entries(state.scoring).sort((a,b)=>displayedScore(b[1],includeAreaScore)-displayedScore(a[1],includeAreaScore));
 const modes=`<div class="score-modes"><button data-score-mode="total" class="${includeAreaScore?'active':''}">Celkem</button><button data-score-mode="base" class="${!includeAreaScore?'active':''}">Bez území</button></div>`;
 const rows=ranking.map(([name,score],i)=>{
  const ticket=tickets.teams[name],expanded=expandedScore===name;
  const values=[['Tramvaje',score.tram],['Vlaky',score.train],['Metro',score.metro],['Území',score.area]],sum=values.reduce((n,[,v])=>n+Math.max(0,v),0);
  const details=expanded?`<div class="score-detail"><div class="score-breakdown">${values.map(([label,value])=>`<div><span>${label}</span><b>${cap(value)}</b></div>`).join('')}</div><div class="score-bar">${values.filter(([,v])=>v>0).map(([label,v])=>`<span title="${esc(label)}: ${cap(v)}" style="width:${sum?100*v/sum:0}%;background:${({'Tramvaje':'#5ac58d','Vlaky':'#75a7e8','Metro':'#dfb268','Území':'#a97bd8'})[label]}"></span>`).join('')}</div><div class="score-legend">Tramvaje · Vlaky · Metro · Území</div></div>`:'';
  return `<div class="score-entry"><button class="score-row score-button" data-expand-team="${esc(name)}" aria-expanded="${expanded}"><span class="teamline"><i class="dot" style="background:${teamColor(name)}"></i>${i+1}. ${esc(name)}</span><strong>${cap(displayedScore(score,includeAreaScore))}</strong><span class="ticket-remaining">${cap(ticket.remaining)} / ${ticket.limit}</span><span class="chevron">${expanded?'⌃':'⌄'}</span></button>${details}</div>`;
 }).join('');
 const recent=eventFeed(state).filter(x=>x.ms>=now-3600000);
 return `<section class="panel score-panel"><div class="score-panel-head"><h2>Pořadí týmů</h2>${modes}</div><div class="score-head"><span>Tým</span><span>Body</span><span>Jízdenky</span><span></span></div>${rows}</section><section class="panel recent-panel"><div class="section-head"><h2>Posledních 60 minut</h2><button data-view="events" class="text-link">Všechny události ›</button></div>${recent.length?recent.map(eventCard).join(''):'<div class="empty">Za posledních 60 minut není zaznamenána žádná událost.</div>'}</section>`;
}
function eventCard(e){
 const changes=e.impact?.changes||{},gain=changes[e.team],loss=e.previousOwner&&e.previousOwner!==e.team?changes[e.previousOwner]:null;
 const action=e.kind==='reinforce'?'posílil':e.kind==='first'?'obsadil':'převzal';
 const relation=e.previousOwner&&e.previousOwner!==e.team?`${esc(e.team)} převzal od ${esc(e.previousOwner)}`:`${esc(e.team)} ${action}`;
 const deltas=e.impact?`<div class="event-deltas"><span class="good">${gain?.direct>=0?'+':''}${cap(gain?.direct||0)} přímé · ${gain?.total>=0?'+':''}${cap(gain?.total||0)} celkem</span>${loss?`<span class="bad">${cap(loss.direct||0)} přímé · ${cap(loss.total||0)} celkem</span>`:''}</div>`:`<small>Bodové změny před checkpointem nejsou přesně doložené.</small>`;
 return `<div class="event-card"><button class="event-open" data-station="${e.stationId}"><i class="event-indicator" style="background:${teamColor(e.team)}"></i><span class="event-main"><b>${esc(e.station)}</b><small>${relation} · ${fmtShort(e.ms)}</small>${deltas}</span><span class="event-value ${e.category==='train'?'train':''}" style="background:${teamColor(e.team)}">${e.value}</span></button></div>`;
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
 const targetsHtml=`<div class="filter"><label for="opponent">${operationTab==='attack'?'Cílový tým':'Modelový útočník'}</label><select id="opponent"><option value="all">Všechny týmy</option>${Object.keys(state.scoring).filter(t=>t!==selectedTeam).map(t=>`<option value="${esc(t)}" ${opponent===t?'selected':''}>${esc(t)}</option>`).join('')}</select></div>`;
 const items=operationTab==='attack'?targets().filter(t=>t.cost<=players&&(!t.station.protectedUntil||now>=t.station.protectedUntil)).slice(0,100).map(t=>{
  const direct=t.cost*(t.station.is_terminus?data.rules.terminus_multiplier:1)+(t.owner?0:data.rules.first_capture_bonus);
  const lost=t.owner?t.station.value*(t.station.is_terminus?data.rules.terminus_multiplier:1):0;
  return `<button class="strategy-row" data-station="${t.station.id}"><span><b>${esc(t.station.name)}</b><small>${esc(t.owner||'Neutrální')} · ${t.cost} hráčů / jízdenek</small></span><span class="strategy-scores"><b class="good">+${cap(t.gain)} celkem</b><small>+${cap(direct)} přímé</small>${t.owner?`<b class="bad">−${cap(t.enemyLoss)} soupeř</b><small>−${cap(lost)} přímé</small>`:''}</span></button>`;
 }).join(''):defenses().slice(0,100).map(t=>{
  const mult=t.station.is_terminus?data.rules.terminus_multiplier:1;
  return `<button class="strategy-row" data-station="${t.station.id}"><span><b>${esc(t.station.name)}</b><small>Hodnota ${t.station.value} · potřebuje ${t.needed} hráčů</small></span><span class="strategy-scores"><b class="bad">−${cap(t.loss)} celkem</b><small>−${cap(t.station.value*mult)} přímé</small></span></button>`;
 }).join('');
 return `<div class="toolbar"><h2>Operace · ${esc(selectedTeam)}</h2>${modes}</div><div class="operation-filters">${personFilter()}${targetsHtml}</div><section class="panel strategy-list">${items||'<div class="empty">Žádný odpovídající cíl.</div>'}</section>`;
}
function eventsView(){
 const teams=Object.keys(state.scoring);
 const rows=eventFeed(state,{team:eventTeam,kind:eventKind}).filter(x=>!eventSearch||x.station.toLocaleLowerCase('cs').includes(eventSearch.toLocaleLowerCase('cs')));
 const select=(id,opts,value)=>`<select id="${id}">${opts.map(([v,label])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(label)}</option>`).join('')}</select>`;
 return `<div class="toolbar"><h2>Události</h2><span class="note">${rows.length} záznamů</span></div><div class="event-filters">${select('event-team',[['all','Všechny týmy'],...teams.map(t=>[t,t])],eventTeam)}${select('event-kind',[['all','Všechny typy'],['first','První obsazení'],['takeover','Převzetí'],['reinforce','Posílení']],eventKind)}<input id="event-search" placeholder="Hledat zastávku…" value="${esc(eventSearch)}"></div><section class="panel event-list">${rows.slice(0,eventsLimit).map(eventCard).join('')||'<div class="empty">Žádné odpovídající události.</div>'}</section>${rows.length>eventsLimit?`<button class="load-more" id="more-events">Načíst dalších 30 · zbývá ${rows.length-eventsLimit}</button>`:''}`;
}
function mapView(){
 const n=[...state.states.values()].filter(t=>t.category==='tram').length;
 return `<div class="toolbar"><h2>Herní mapa</h2><span class="note">${n} tramvajových zastávek</span></div><div class="map-layers"><label><input type="checkbox" id="map-tram" ${mapTram?'checked':''}> Tramvaje</label><label><input type="checkbox" id="map-train" ${mapTrain?'checked':''}> Vlaky</label><label><input type="checkbox" id="map-edges" ${mapEdges?'checked':''}> Spojnice</label></div><div class="map-wrap"><div id="strategic-map" class="strategic-map"></div></div>`;
}
function initStrategicMap(){
 const el=document.getElementById('strategic-map');if(!el)return;
 if(typeof window.L==='undefined'){el.innerHTML='<div class="empty">Mapovou knihovnu se nepodařilo načíst.</div>';return;}
 const points=[...state.states.values()].filter(s=>((s.category==='tram'&&mapTram)||(s.category==='train'&&mapTrain))&&Number.isFinite(s.lat)&&Number.isFinite(s.lon));
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
 map.on('moveend zoomend',()=>{if(strategicMap!==map)return;const center=map.getCenter();mapViewState={center:[center.lng,center.lat],zoom:map.getZoom(),userMoved:true};});
 if(mapEdges)data.topology.edges.forEach(e=>{
  const coords=(e.geometry?.length?e.geometry:[[state.states.get(e.from)?.lat,state.states.get(e.from)?.lon],[state.states.get(e.to)?.lat,state.states.get(e.to)?.lon]]).filter(p=>Number.isFinite(p?.[0])&&Number.isFinite(p?.[1]));
  if(coords.length>=2)L.polyline(coords,{color:'#7b9384',weight:2,opacity:.78,interactive:false}).addTo(map);
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
 setTimeout(()=>{if(strategicMap===map)map.invalidateSize();},40);
}
function stationDetail(id){
 const s=state.states.get(id);if(!s)return '';
 const impact=impactOf(state,id,data.rules,selectedTeam),risk=lossOf(state,id,data.rules,selectedTeam);
 const history=stationHistory(state,id);
 const historyHtml=history.length?history.map(e=>`<div class="history-row"><div class="history-marker" style="background:${teamColor(e.team)}"></div><div><b>${fmtTime(e.ms)}</b><div class="teamline"><i class="dot" style="background:${teamColor(e.team)}"></i>${esc(e.team)} · ${e.value} hráčů</div><div class="note">${e.kind==='first'?'První obsazení':e.kind==='reinforce'?'Posílení / opětovné obsazení':'Převzetí od '+esc(e.previousOwner)}${e.author?' · '+esc(e.author):''} · ID ${e.id}</div></div></div>`).join(''):'<div class="empty">Zatím žádné doložené obsazení.</div>';
 const currentProtection=s.protectedUntil&&s.protectedUntil>now;
 const decay=s.capture&&s.transitions.length?`<div class="timeline">${s.transitions.map(t=>`<div class="tick" style="opacity:${t.at<=now?.45:1}"><b>${fmtTime(t.at)}</b><small>${t.at<=now?'Proběhlý výpočet':'Předpověď'} · ${t.from} → ${t.to} · k převzetí stačí ${requiredPlayers(t.to,s.owner,data.rules)} hráčů</small></div>`).join('')}</div>`:'<div class="empty">Bez známých budoucích poklesů.</div>';
 return `<section class="panel detail"><div class="detail-top"><div><div class="eyebrow">DETAIL ZASTÁVKY</div><h2>${esc(s.name)}</h2><span class="teamline"><i class="dot" style="background:${teamColor(s.owner)}"></i>${esc(s.owner||'Neutrální')}${s.is_terminus?' · konečná':''}</span></div><button class="pill" id="close-detail">Zavřít ×</button></div>
 <div class="cards" style="grid-template-columns:repeat(2,1fr);margin-top:20px">${card('Aktuální hodnota',s.value)}${card('Potřeba hráčů na převzetí',s.needed)}</div>
 ${s.capture?`<div class="metric"><span>Poslední obsazení</span><b>${fmtTime(s.capture.ms)}</b></div><div class="metric"><span>Poslední skupina</span><b>${s.capture.value} hráčů</b></div><div class="metric"><span>Ochrana</span><b class="${currentProtection?'bad':''}">${currentProtection?'Do '+fmtTime(s.protectedUntil):'Ukončena'}</b></div>`:'<p class="note">V historii není obsazení této zastávky.</p>'}
 ${impact?`<div class="metric"><span>Samostatný útok</span><b class="good">+${cap(impact.gain)} nám · ${impact.owner?'−'+cap(impact.enemyLoss)+' soupeři':'neutrální'}</b></div>`:''}${risk?`<div class="metric"><span>Ztráta při převzetí</span><b class="bad">−${cap(risk.loss)} bodů</b></div>`:''}
 <h3 style="margin-top:25px">Časová osa hodnoty</h3>${decay}
 <h3 style="margin-top:25px">Historie obsazení (${history.length})</h3><div class="history-list">${historyHtml}</div>
 <div class="metric"><span>Herní sousedé</span><span class="neighbors">${(s.neighbors||[]).map(n=>`<button class="pill" data-station="${n}">${esc(state.states.get(n)?.name||n)}</button>`).join('')||'Žádní'}</span></div></section>`;
}

function render(){if(strategicMap){const m=strategicMap;strategicMap=null;m.remove();}const body=view==='overview'?overview():view==='map'?mapView():view==='strategy'?strategyView():view==='events'?eventsView():overview();app.innerHTML=`<div class="app">${top()}${nav()}${selected!==null?stationDetail(selected):body}</div>`; if(view==='map'&&selected===null) initStrategicMap();}
app.addEventListener('click',e=>{const exp=e.target.closest('[data-expand-team]');if(exp){expandedScore=expandedScore===exp.dataset.expandTeam?null:exp.dataset.expandTeam;render();return;}const tab=e.target.closest('[data-operation-tab]');if(tab){operationTab=tab.dataset.operationTab;render();return;}const st=e.target.closest('[data-station]');if(st){selected=Number(st.dataset.station);render();return;}const v=e.target.closest('[data-view]');if(v){selected=null;view=v.dataset.view;render();return;}if(e.target.closest('#close-detail')){selected=null;render();return;}if(e.target.closest('#more-events')){eventsLimit+=30;render();return;}const mode=e.target.closest('[data-score-mode]');if(mode){includeAreaScore=mode.dataset.scoreMode==='total';render();return;}});
app.addEventListener('change',e=>{if(e.target.id==='players'){players=Number(e.target.value);operationsCache=[];render();}if(e.target.id==='sort'){sortBy=e.target.value;render();}if(e.target.id==='area-points'){showAreaPoints=e.target.checked;render();}if(e.target.id==='event-team'){eventTeam=e.target.value;eventsLimit=30;render();}if(e.target.id==='event-kind'){eventKind=e.target.value;eventsLimit=30;render();}if(e.target.id==='selected-team'){selectedTeam=e.target.value;try{localStorage.setItem('lalinia-team',selectedTeam)}catch{}render();}if(e.target.id==='opponent'){opponent=e.target.value;render();}if(e.target.id==='map-tram'){mapTram=e.target.checked;render();}if(e.target.id==='map-train'){mapTrain=e.target.checked;render();}if(e.target.id==='map-edges'){mapEdges=e.target.checked;render();}});
app.addEventListener('input',e=>{if(e.target.id==='event-search'){eventSearch=e.target.value;eventsLimit=30;const pos=e.target.selectionStart;render();const el=document.getElementById('event-search');el?.focus();el?.setSelectionRange(pos,pos);return;}if(e.target.id==='search'){search=e.target.value; const pos=e.target.selectionStart;render();const el=document.getElementById('search');el?.focus();el?.setSelectionRange(pos,pos);}});
load();
setInterval(()=>{if(data.topology)refresh();},60000);
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
