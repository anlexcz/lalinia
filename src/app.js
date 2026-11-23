import {MY_TEAM,fmtTime,fmtShort,reconstruct,impactOf,lossOf,opportunityFor,requiredPlayers,stationHistory,findOperations,recentCaptures,eventFeed} from './engine.js';
const paths=['topology.json','rules.json','checkpoint.json','captures.json'];
const app=document.querySelector('#app');
let data={},state,view='overview',players=4,selected=null,search='',sortBy='value',now=Date.now(),operationsCache=[],showAreaPoints=true,eventTeam='all',eventKind='all',eventsLimit=40;
let strategicMap=null;
let mapViewState={center:[14.42,50.087],zoom:11.4,userMoved:false};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const teamColor=owner=>({'Cosa Nostra':'#32b968','Spiriti':'#5797db','Zemunski klan':'#a475d8','Yakuza':'#e56a67','Los Bandidos':'#dcb467'})[owner]||'#64746b';
const cap=n=>Number(n||0).toLocaleString('cs-CZ');
async function load(){try{const content=await Promise.all(paths.map(p=>fetch(`./data/${p}?v=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(p+' HTTP '+r.status);return r.json();})));[data.topology,data.rules,data.checkpoint,data.captures]=content;refresh();}catch(e){app.innerHTML=`<div class="loading bad">Nelze načíst data: ${esc(e.message)}</div>`;}}
function refresh(){now=Date.now();state=reconstruct(data.topology,data.rules,data.checkpoint,data.captures,now);operationsCache=[];render();}
function nav(){return `<nav class="nav">${[['overview','Přehled'],['map','Mapa'],['targets','Útok'],['operations','Operace'],['opportunities','Decay'],['defense','Obrana'],['events','Události']].map(([id,name])=>`<button data-view="${id}" class="${view===id?'active':''}">${name}</button>`).join('')}</nav>`;}
function top(){let issue=state.errors.length?`<div class="warning"><b>${state.errors.length} chyb ve vstupních událostech</b><p>${state.errors.slice(0,4).map(esc).join('<br>')}</p></div>`:'';
 const freshness=state.latestEvent?fmtTime(state.latestEvent):'bez událostí';
 return `<header class="top"><div><div class="eyebrow">LA LINIA</div><h1>Cosa Nostra</h1></div><div class="stamp">Data <b>${freshness}</b></div></header>${issue}${state.warnings.length?`<div class="warning">${state.warnings.length} upozornění při rekonstrukci. ${esc(state.warnings[0])}</div>`:''}`;}
function card(name,num){return `<div class="card"><span class="sub">${name}</span><strong>${num}</strong></div>`;}
function personFilter(){return `<div class="filter"><label for="players">Dostupní hráči</label><select id="players">${[3,4,5,6,7,8,9,10,12].map(n=>`<option value="${n}" ${players===n?'selected':''}>${n} hráčů</option>`).join('')}</select></div>`;}
function targets(){return [...state.states.values()].filter(s=>s.category==='tram'&&s.owner!==MY_TEAM).map(s=>impactOf(state,s.id,data.rules)).filter(Boolean).sort((a,b)=>b.score-a.score);}
function overview(){const own=state.scoring[MY_TEAM];const ranking=Object.entries(state.scoring).sort((a,b)=>b[1].total-a[1].total),rank=ranking.findIndex(([t])=>t===MY_TEAM)+1;
 const topNow=targets().filter(t=>t.cost<=players).slice(0,6),risks=defenses().slice(0,5),next=opportunities().filter(o=>!o.now).slice(0,5); const displayed=own.total-(showAreaPoints?0:own.area); const areaControl=`<label class="score-toggle"><input type="checkbox" id="area-points" ${showAreaPoints?'checked':''}/><span>Území</span></label>`;
 return `<div class="toolbar"><h2>Aktuální situace</h2>${personFilter()}</div><div class="score-strip"><span>Skóre Cosa Nostra <small>${showAreaPoints?'Celkem':'Bez území'}</small></span><strong>${cap(displayed)}</strong>${areaControl}<span class="area-component">Území +${cap(own.area)}</span></div><div class="cards">${card('Pořadí',rank+'. / '+ranking.length)}${card('Naše zastávky',[...state.states.values()].filter(s=>s.owner===MY_TEAM&&s.category==='tram').length)}${card('Poslední událost',state.latestEvent?fmtShort(state.latestEvent):'—')}</div><div class="cols"><section class="panel"><h3>Nejlepší dostupné útoky</h3>${topNow.length?topNow.map(x=>targetRowSimple(x)).join(''):'<div class="empty">Pro tuto skupinu momentálně není známý převzitelný tramvajový cíl.</div>'}</section><section class="panel"><h3>Nejbližší nové příležitosti</h3>${next.length?next.map(o=>`<div class="row"><button data-station="${o.station.id}">${esc(o.station.name)}<br><span class="muted">${fmtShort(o.at)}</span></button><span class="pill">${o.needed} hráči</span></div>`).join(''):'<div class="empty">Žádný další pokles v dostupnosti pro danou skupinu.</div>'}</section></div><div class="cols" style="margin-top:16px"><section class="panel"><h3>Nejohroženější vlastní spojnice</h3>${risks.map(x=>`<div class="row"><button data-station="${x.station.id}">${esc(x.station.name)}</button><b class="bad">−${cap(x.loss)} b.</b></div>`).join('')}</section><section class="panel"><h3>Pořadí týmů</h3>${ranking.map(([name,score],i)=>`<div class="row"><span class="teamline"><i class="dot" style="background:${teamColor(name)}"></i>${i+1}. ${esc(name)}</span><b>${cap(score.total)}</b></div>`).join('')}</section></div><section class="panel" style="margin-top:16px"><h3>Poslední obsazení</h3>${recentCaptures(state,8).map(e=>`<div class="row"><button data-station="${e.stationId}"><b>${esc(e.station)}</b><br><span class="note">${fmtTime(e.ms)} · ${esc(e.team)} · ${e.value} hráčů</span></button><span class="note">#${e.id}</span></div>`).join('')}</section>`;}
function targetRowSimple(x){return `<div class="row"><button data-station="${x.station.id}"><b>${esc(x.station.name)}</b><br><span class="muted">${esc(x.owner||'Neutrální')} · ${x.cost} jízdenek · území ${x.areaGain>=0?'+':''}${x.areaGain}</span></button><span><strong class="good">+${cap(x.gain)}</strong>${x.owner?`<br><span class="bad note">−${cap(x.enemyLoss)} soupeř</span>`:''}</span></div>`;}
function defenses(){return [...state.states.values()].filter(s=>s.owner===MY_TEAM&&s.category==='tram').map(s=>lossOf(state,s.id,data.rules)).filter(Boolean).sort((a,b)=>b.loss-a.loss);}
function opportunities(){return [...state.states.values()].filter(s=>s.category==='tram'&&s.owner!==MY_TEAM).map(s=>{const op=opportunityFor(s,data.rules,players,now);return op?{station:s,...op,impact:impactOf(state,s.id,data.rules)}:null;}).filter(Boolean).sort((a,b)=>a.now!==b.now?(a.now?-1:1):a.now?b.impact.score-a.impact.score:a.at-b.at);}
function attackView(){const items=targets().filter(x=>x.cost<=players&&x.station.name.toLocaleLowerCase('cs').includes(search.toLocaleLowerCase('cs')));items.sort((a,b)=>sortBy==='value'?b.score-a.score:sortBy==='cost'?a.cost-b.cost:b.gain-a.gain);return `<div class="toolbar"><h2>Výhodné útoky</h2>${personFilter()}<div class="filter"><input id="search" placeholder="Hledat zastávku…" value="${esc(search)}"/><select id="sort"><option value="value" ${sortBy==='value'?'selected':''}>Celkový dopad</option><option value="gain" ${sortBy==='gain'?'selected':''}>Náš zisk</option><option value="cost" ${sortBy==='cost'?'selected':''}>Cena</option></select></div></div><div class="panel"><div class="list-head"><span>Zastávka</span><span>Hráčů</span><span>Náš zisk</span><span>Soupeř</span></div>${items.map(x=>`<div class="target-row"><button data-station="${x.station.id}">${esc(x.station.name)}<br><span class="note">${esc(x.owner||'Neutrální')}${x.station.is_terminus?' · konečná':''}</span></button><span>${x.cost}</span><span class="score good">+${cap(x.gain)}</span><span class="score bad">${x.owner?'−'+cap(x.enemyLoss):'—'}</span></div>`).join('')||'<div class="empty">Žádné cíle při zvoleném počtu hráčů.</div>'}</div>`;}
function opportunitiesView(){const o=opportunities();return `<div class="toolbar"><h2>Časová okna decay</h2>${personFilter()}</div><div class="panel"><h3>Dostupné nyní</h3>${o.filter(x=>x.now).slice(0,30).map(x=>`<div class="row"><button data-station="${x.station.id}">${esc(x.station.name)} <span class="note">${esc(x.station.owner||'Neutrální')}</span></button><b>${x.needed} hráči</b></div>`).join('')||'<div class="empty">Žádné dostupné zastávky.</div>'}<h3 style="margin-top:25px">Budoucí dostupnost</h3>${o.filter(x=>!x.now).map(x=>`<div class="row"><button data-station="${x.station.id}"><b>${esc(x.station.name)}</b><br><span class="note">${esc(x.station.owner)} · hodnota ${x.station.value} → při poklesu bude stačit ${x.needed}</span></button><b>${fmtShort(x.at)}</b></div>`).join('')||'<div class="empty">Žádná nová příležitost.</div>'}</div>`;}
function defenseView(){return `<div class="toolbar"><h2>Obrana našich území</h2></div><div class="panel">${defenses().map(x=>`<div class="row"><button data-station="${x.station.id}"><b>${esc(x.station.name)}</b><br><span class="note">Hodnota ${x.station.value} · soupeř potřebuje ${x.needed} hráčů${x.station.pending.length?' · další pokles '+fmtShort(x.station.pending[0].at):''}</span></button><b class="bad">−${cap(x.loss)}</b></div>`).join('')}</div>`;}
function operationsView(){
 if(!operationsCache.length||operationsCache.players!==players){operationsCache=findOperations(state,data.rules,players,36);operationsCache.players=players;}
 const best=operationsCache.filter(o=>o.cost<=36).slice(0,24);
 return `<div class="toolbar"><h2>Společné operace</h2>${personFilter()}</div><section class="panel">${best.map((o,i)=>`<div class="operation"><div class="operation-heading"><b>${i+1}. ${o.ids.map(id=>esc(state.states.get(id).name)).join(' + ')}</b><strong class="good">+${cap(o.ourGain)} nám</strong></div><div class="op-details"><span>${o.maxPlayers} hráčů max.</span><span>${o.cost} jízdenek</span><span class="bad">−${cap(o.opponentLoss)} soupeřům</span><span>Proti lídrovi +${cap(o.leaderGapChange)}</span></div><div class="operation-links">${o.ids.map(id=>`<button class="pill" data-station="${id}">${esc(state.states.get(id).name)} ↗</button>`).join('')}</div></div>`).join('')||'<div class="empty">Pro tuto skupinu zatím žádné dostupné kombinace.</div>'}</section>`;
}
function eventsView(){
 const teams=Object.keys(state.scoring);
 const rows=eventFeed(state,{team:eventTeam,kind:eventKind});
 const shown=rows.slice(0,eventsLimit);
 const teamOpts=[['all','Všechny týmy'],...teams.map(t=>[t,t])];
 const kindOpts=[['all','Všechny události'],['gain','Naše zisky'],['loss','Naše ztráty'],['reinforce','Naše posílení'],['takeover','Převzetí zastávky']];
 const select=(id,options,value)=>'<select id="'+id+'">'+options.map(([v,label])=>'<option value="'+esc(v)+'" '+(v===value?'selected':'')+'>'+esc(label)+'</option>').join('')+'</select>';
 const rowsHtml=shown.map(e=>{
  const name=e.scope==='loss'?'Ztráta':e.scope==='gain'?'Zisk':e.scope==='reinforce'?'Posílení':e.kind==='first'?'První obsazení':'Převzetí';
  const other=e.previousOwner&&e.previousOwner!==e.team?' · '+esc(e.previousOwner)+' → '+esc(e.team):' · '+esc(e.team);
  return '<div class="event-row"><button data-station="'+e.stationId+'"><strong>'+esc(e.station)+'</strong><span class="event-sub"><i class="dot" style="background:'+teamColor(e.team)+'"></i>'+name+other+'</span></button><div class="event-right"><b>'+e.value+' hráčů</b><span>'+fmtTime(e.ms)+'</span></div></div>';
 }).join('');
 return '<div class="toolbar"><h2>Události</h2><span class="note">'+rows.length+' záznamů</span></div>'
 +'<div class="event-filters">'+select('event-team',teamOpts,eventTeam)+select('event-kind',kindOpts,eventKind)+'</div>'
 +'<section class="panel event-list">'+(rowsHtml||'<div class="empty">Žádné události.</div>')+'</section>'
 +(shown.length<rows.length?'<button class="load-more" id="more-events">Další události ('+(rows.length-shown.length)+')</button>':'');
}
function mapView(){const tram=[...state.states.values()].filter(s=>s.category==='tram');
 return `<div class="toolbar"><h2>Herní mapa</h2><span class="note">${tram.length} zastávek · ${data.topology.edges.length} spojnic</span></div><div class="map-wrap"><div id="strategic-map" class="strategic-map" aria-label="Interaktivní mapa Prahy"></div></div><div class="filter" style="margin-top:12px;gap:12px;">${Object.keys(state.scoring).map(t=>`<span class="teamline"><i class="dot" style="background:${teamColor(t)}"></i>${esc(t)}</span>`).join('')}</div>`;}
function initStrategicMap(){
 const el=document.getElementById('strategic-map');if(!el)return;
 if(typeof window.L==='undefined'){el.innerHTML='<div class="empty">Mapovou knihovnu se nepodařilo načíst.</div>';return;}
 const tram=[...state.states.values()].filter(s=>s.category==='tram'&&Number.isFinite(s.lat)&&Number.isFinite(s.lon));
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
 data.topology.edges.forEach(e=>{
  const coords=(e.geometry?.length?e.geometry:[[state.states.get(e.from)?.lat,state.states.get(e.from)?.lon],[state.states.get(e.to)?.lat,state.states.get(e.to)?.lon]]).filter(p=>Number.isFinite(p?.[0])&&Number.isFinite(p?.[1]));
  if(coords.length>=2)L.polyline(coords,{color:'#7b9384',weight:2,opacity:.78,interactive:false}).addTo(map);
 });
 tram.forEach(s=>{
  const marker=L.circleMarker([s.lat,s.lon],{radius:7,fillColor:teamColor(s.owner),fillOpacity:.97,color:'#121715',weight:1.5});
  marker.bindTooltip(esc(s.name)+' · '+esc(s.owner||'Neutrální')+' · '+s.value,{direction:'top'});
  marker.on('click',()=>{selected=s.id;render();});
  marker.addTo(map);
 });
 if(!mapViewState.userMoved){
  const bounds=L.latLngBounds(tram.map(s=>[s.lat,s.lon]));
  map.fitBounds(bounds.pad(.06),{animate:false});
  const center=map.getCenter();mapViewState={center:[center.lng,center.lat],zoom:map.getZoom(),userMoved:false};
 }
 setTimeout(()=>{if(strategicMap===map)map.invalidateSize();},40);
}
function stationDetail(id){
 const s=state.states.get(id);if(!s)return '';
 const impact=impactOf(state,id,data.rules),risk=lossOf(state,id,data.rules);
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

function render(){if(strategicMap){const m=strategicMap;strategicMap=null;m.remove();}const body=view==='overview'?overview():view==='map'?mapView():view==='targets'?attackView():view==='operations'?operationsView():view==='opportunities'?opportunitiesView():view==='events'?eventsView():defenseView();app.innerHTML=`<div class="app">${top()}${nav()}${selected!==null?stationDetail(selected):body}</div>`; if(view==='map'&&selected===null) initStrategicMap();}
app.addEventListener('click',e=>{const st=e.target.closest('[data-station]');if(st){selected=Number(st.dataset.station);render();return;}const v=e.target.closest('[data-view]');if(v){selected=null;view=v.dataset.view;render();return;}if(e.target.closest('#close-detail')){selected=null;render();return;}if(e.target.closest('#more-events')){eventsLimit+=40;render();return;}});
app.addEventListener('change',e=>{if(e.target.id==='players'){players=Number(e.target.value);operationsCache=[];render();}if(e.target.id==='sort'){sortBy=e.target.value;render();}if(e.target.id==='area-points'){showAreaPoints=e.target.checked;render();}if(e.target.id==='event-team'){eventTeam=e.target.value;eventsLimit=40;render();}if(e.target.id==='event-kind'){eventKind=e.target.value;eventsLimit=40;render();}});
app.addEventListener('input',e=>{if(e.target.id==='search'){search=e.target.value; const pos=e.target.selectionStart;render();const el=document.getElementById('search');el?.focus();el?.setSelectionRange(pos,pos);}});
load();setInterval(()=>{if(data.topology)refresh();},60000);
