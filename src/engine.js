export const MY_TEAM = 'Cosa Nostra';
const PRAGUE_OFFSET = '+01:00'; // Entire game 21 Nov – 5 Dec 2026 occurs in CET.
export function parseCaptureTime(raw) {
  const m=String(raw).match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})$/);
  if(!m) throw new Error('Neplatný čas události: '+raw);
  return Date.parse(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}T${m[4].padStart(2,'0')}:${m[5]}:${m[6]}${PRAGUE_OFFSET}`);
}
export const fmtTime = ms => new Intl.DateTimeFormat('cs-CZ',{timeZone:'Europe/Prague',day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(ms));
export const fmtShort = ms => new Intl.DateTimeFormat('cs-CZ',{timeZone:'Europe/Prague',day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(ms));
export function timeline(capture, rules) {
 if(!capture || capture.value < 3) return [];
 let t=capture.ms, v=capture.value;
 const result=[];
 for(let k=0;k<40 && v>=3;k++) {
   const hours=Number(rules.decay_hours[String(v)]);
   if(!Number.isFinite(hours)||hours<=0) break;
   t+=hours*3600000;
   result.push({at:t,from:v,to:v-1});v--;
 }
 return result;
}
export function valueAt(capture,rules,now) {
 if(!capture) return 0;
 let v=capture.value;
 for(const d of timeline(capture,rules)) { if(now>=d.at) v=d.to; else break; }
 return v;
}
export function requiredPlayers(value, owner, rules){return owner==null?rules.minimum_players:Math.max(rules.minimum_players,value+1);}
export function buildGraph(topology){
 const stations=new Map(topology.stations.map(s=>[s.id,s]));
 const adj=new Map(topology.stations.map(s=>[s.id,new Set()]));
 for(const e of topology.edges){if(!stations.has(e.from)||!stations.has(e.to))throw new Error('Chybná hrana '+e.from+'/'+e.to);adj.get(e.from).add(e.to);adj.get(e.to).add(e.from);}
 return {stations,adj};
}
export function areaOf(owners,graph,rules){
 const seen=new Set(), result={},components={};
 for(const [id,owner] of owners){
  if(!owner || seen.has(id)||graph.stations.get(id)?.category!=='tram') continue;
  const q=[id], group=[];seen.add(id);
  while(q.length){const a=q.pop();group.push(a);for(const b of graph.adj.get(a)||[]){if(!seen.has(b)&&owners.get(b)===owner){seen.add(b);q.push(b);}}}
  (components[owner]??=[]).push(group);result[owner]=(result[owner]||0)+(rules.area_scores[String(group.length)]||0);
 }
 return {scores:result,components};
}
function uniqueLookup(topology){const m=new Map();for(const s of topology.stations){const key=`${s.category}|${s.name}`;if(!m.has(key))m.set(key,[]);m.get(key).push(s);}return m;}
export function reconstruct(topology,rules,checkpoint,events,now=Date.now()){
 const graph=buildGraph(topology),lookups=uniqueLookup(topology),errors=[],warnings=[],seenIds=new Set();
 const ordered=[];
 for(const e of events){
  if(!Number.isInteger(e.id)||seenIds.has(e.id)){errors.push(`Duplicitní nebo neplatné ID události: ${e.id}`);continue;}seenIds.add(e.id);
  try {
   const ms=parseCaptureTime(e.datetime), value=Number(e.value);
   if(!Number.isInteger(value)||value<rules.minimum_players){errors.push(`Událost ${e.id}: neplatný počet hráčů`);continue;}
   const matches=lookups.get(`${e.category}|${e.station}`)||[];
   if(matches.length!==1){errors.push(`Událost ${e.id}: zastávka „${e.station}“ (${e.category}) má ${matches.length} shod`);continue;}
   ordered.push({...e,stationId:matches[0].id,ms,value});
  }catch(err){errors.push(`Událost ${e.id}: ${err.message}`);}
 }
 ordered.sort((a,b)=>a.ms-b.ms||a.id-b.id);
 const base=new Map(checkpoint.stations.map(s=>[s.id,{...s}]));
 const latestByStation=new Map();
 for(const e of ordered){if(e.id<=checkpoint.checkpoint_event_id){const prior=latestByStation.get(e.stationId);if(!prior||e.ms>=prior.ms)latestByStation.set(e.stationId,e);}}
 // Check snapshot against last capture prior to the baseline. Past captures are kept for decay only.
 for(const [id,e] of latestByStation){const s=base.get(id);if(s && (s.owner!==e.team || s.value>e.value)) {
   // Decay can explain a lower snapshot value, but not a higher one.
   warnings.push(`Kontrola výchozího stavu: ${graph.stations.get(id)?.name} neodpovídá poslednímu obsazení`);
 }}
 const owners=new Map([...base].map(([id,s])=>[id,s.owner]));
 const scoring=Object.fromEntries(checkpoint.teams.map(t=>[t.name,{total:t.total_score,tram:t.tram_score,area:t.area_score,train:t.train_score,metro:t.metro_score}]));
 let areas=areaOf(owners,graph,rules).scores;
 // Replay only captures occurring after the checkpoint; older history is the source of decay epochs.
 let added=0;
 for(const e of ordered){if(e.id<=checkpoint.checkpoint_event_id)continue;
   if(e.ms>now)continue;
   const station=graph.stations.get(e.stationId); const previous=base.get(e.stationId);if(!previous)continue;
   const existing=latestByStation.get(e.stationId);
   const oldValue=existing?valueAt(existing,rules,e.ms):previous.value;
   const oldOwner=previous.owner;
   const multiplier=station.is_terminus?rules.terminus_multiplier:1;
   if(!scoring[e.team]){warnings.push(`Neznámý tým v události ${e.id}: ${e.team}`);continue;}
   const add=(team,part,delta)=>{scoring[team][part]+=delta;scoring[team].total+=delta;};
   if(station.category==='tram'){
     if(oldOwner===e.team)add(e.team,'tram',(e.value-oldValue)*multiplier);
     else {if(oldOwner && scoring[oldOwner])add(oldOwner,'tram',-oldValue*multiplier);add(e.team,'tram',e.value*multiplier+(oldOwner?0:rules.first_capture_bonus));}
   }else if(station.category==='train') {warnings.push(`Událost ${e.id}: bodování vlakové události nelze automaticky ověřit; skóre může být nepřesné`);}
   // Update raw ownership state and refresh area bonuses after each capture.
   previous.owner=e.team; previous.value=e.value; owners.set(e.stationId,e.team);
   const newer=areaOf(owners,graph,rules).scores;
   for(const team of Object.keys(scoring)) {const delta=(newer[team]||0)-(areas[team]||0);scoring[team].area+=delta;scoring[team].total+=delta;}
   areas=newer;latestByStation.set(e.stationId,e);added++;
 }
 const states=new Map();for(const s of topology.stations){const cp=base.get(s.id),capture=latestByStation.get(s.id);const owner=cp?.owner||null;const value=capture?valueAt(capture,rules,now):cp?.value||0;
   const transitions=timeline(capture,rules);const pending=transitions.filter(x=>x.at>now);
   states.set(s.id,{...s,owner,value,capture:capture||null,transitions,pending,needed:requiredPlayers(value,owner,rules),protectedUntil:capture?capture.ms+rules.protection_minutes*60000:null});
 }
 const history=new Map();for(const e of ordered){if(!history.has(e.stationId))history.set(e.stationId,[]);history.get(e.stationId).push(e);}
 return {graph,states,scoring,history,orderedEvents:ordered,asOf:now,errors,warnings,eventsCount:ordered.length,added,checkpointId:checkpoint.checkpoint_event_id,latestEvent:ordered.length?ordered.at(-1).ms:null};
}
export function impactOf(state,targetId,rules,team=MY_TEAM){
 const {states,graph}=state,station=states.get(targetId);if(!station||station.owner===team||station.category!=='tram')return null;
 const n=station.needed,owners=new Map([...states].map(([id,s])=>[id,s.owner]));
 const before=areaOf(owners,graph,rules).scores;
 owners.set(targetId,team);const after=areaOf(owners,graph,rules).scores;
 const mult=station.is_terminus?rules.terminus_multiplier:1;
 const gain=n*mult+(station.owner?0:rules.first_capture_bonus)+(after[team]||0)-(before[team]||0);
 const enemyLoss=station.owner?station.value*mult+(before[station.owner]||0)-(after[station.owner]||0):0;
 return {station,gain,enemyLoss,cost:n,owner:station.owner,score:gain+enemyLoss,areaGain:(after[team]||0)-(before[team]||0)};
}
export function lossOf(state,targetId,rules){
 const station=state.states.get(targetId);if(station.owner!==MY_TEAM||station.category!=='tram')return null;
 const owners=new Map([...state.states].map(([id,s])=>[id,s.owner]));const before=areaOf(owners,state.graph,rules).scores;
 owners.set(targetId,'__rival__');const after=areaOf(owners,state.graph,rules).scores;
 return {station,loss:station.value*(station.is_terminus?rules.terminus_multiplier:1)+(before[MY_TEAM]||0)-(after[MY_TEAM]||0),needed:station.needed};
}
export function opportunityFor(station,rules,group,now){
 if(station.owner===MY_TEAM || station.category!=='tram')return null;
 const firstLegal=Math.max(now,station.protectedUntil||0);
 // An already affordable target can become available as soon as protection ends.
 if(station.needed<=group)return {at:firstLegal,needed:station.needed,now:firstLegal<=now};
 for(const d of station.pending){const need=requiredPlayers(d.to,station.owner,rules);if(need<=group){const at=Math.max(d.at,firstLegal);return {at,needed:need,now:at<=now};}}
 return null;
}

// History is read from the one manually maintained event log. No history is synthesized.
export function stationHistory(state, stationId) {
 const captures=(state.history?.get(stationId)||[]).filter(e=>e.ms<=state.asOf);
 return captures.map((event,index)=>({
  ...event,
  kind:index===0?'first':captures[index-1].team===event.team?'reinforce':'takeover',
  previousOwner:index?captures[index-1].team:null
 })).reverse();
}

// Recompute components after all operations; never add individual station impacts.
export function evaluateOperation(state,ids,rules,team=MY_TEAM){
 const owners=new Map([...state.states].map(([id,s])=>[id,s.owner]));
 const before=areaOf(owners,state.graph,rules).scores;
 const gains={}; const costs=[];let cost=0,maxPlayers=0;
 for(const id of ids){
  const s=state.states.get(id);
  if(!s||s.category!=='tram'||s.owner===team)return null;
  const needed=s.needed;
  if(s.protectedUntil && state.asOf<s.protectedUntil)return null;
  cost+=needed;maxPlayers=Math.max(maxPlayers,needed);
  const mult=s.is_terminus?rules.terminus_multiplier:1;
  gains[team]=(gains[team]||0)+needed*mult+(s.owner?0:rules.first_capture_bonus);
  if(s.owner)gains[s.owner]=(gains[s.owner]||0)-s.value*mult;
  costs.push({id,needed});owners.set(id,team);
 }
 const after=areaOf(owners,state.graph,rules).scores;
 const deltas={};for(const name of Object.keys(state.scoring)) deltas[name]=(gains[name]||0)+(after[name]||0)-(before[name]||0);
 const leaders=Object.entries(state.scoring).filter(([name])=>name!==team).sort((a,b)=>b[1].total-a[1].total);
 const leader=leaders[0]?.[0];
 return {ids:[...ids],cost,maxPlayers,costs,deltas,ourGain:deltas[team]||0,leader,leaderGapChange:(deltas[team]||0)-(deltas[leader]||0),opponentLoss:Object.entries(deltas).filter(([name])=>name!==team).reduce((a,[,v])=>a+Math.max(0,-v),0),score:(deltas[team]||0)+Object.entries(deltas).filter(([name])=>name!==team).reduce((a,[,v])=>a+Math.max(0,-v),0)};
}
function localDistance(a,b){const y=(a.lat-b.lat)*111,x=(a.lon-b.lon)*71;return Math.hypot(x,y);}
export function findOperations(state,rules,players=4,maxTickets=30){
 const candidates=[...state.states.values()].filter(s=>s.category==='tram'&&s.owner!==MY_TEAM&&s.needed<=players&&(!s.protectedUntil||s.protectedUntil<=state.asOf));
 const singles=candidates.map(s=>evaluateOperation(state,[s.id],rules)).filter(Boolean).sort((a,b)=>b.score-a.score);
 // Search relevant local pairs, not all combinatorial subsets of Prague.
 const anchors=new Set(singles.slice(0,65).map(x=>x.ids[0]));
 const options=new Map(singles.filter(x=>anchors.has(x.ids[0])).map(x=>[x.ids[0],x]));
 const pairs=[];
 for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
  const a=candidates[i],b=candidates[j];if(!anchors.has(a.id)&&!anchors.has(b.id))continue;
  if(a.needed+b.needed>maxTickets)continue;
  if(localDistance(a,b)>2.4&&!state.graph.adj.get(a.id)?.has(b.id))continue;
  const op=evaluateOperation(state,[a.id,b.id],rules);if(op)pairs.push(op);
 }
 pairs.sort((a,b)=>b.score-a.score);
 const triples=[];const seen=new Set();
 for(const p of pairs.slice(0,75)){
  for(const c of candidates){if(p.ids.includes(c.id)||p.cost+c.needed>maxTickets)continue;
   if(!p.ids.some(id=>localDistance(state.states.get(id),c)<1.8||state.graph.adj.get(id)?.has(c.id)))continue;
   const ids=[...p.ids,c.id].sort((a,b)=>a-b),key=ids.join(',');if(seen.has(key))continue;seen.add(key);
   const op=evaluateOperation(state,ids,rules);if(op)triples.push(op);
  }
 }
 return [...pairs,...triples].filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.cost-b.cost).slice(0,60);
}
export function recentCaptures(state,count=15){return (state.orderedEvents||[]).filter(e=>e.ms<=state.asOf).slice(-count).reverse();}
