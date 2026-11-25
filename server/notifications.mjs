import {timeline,gameDayKey,trainLockAt,reconstruct} from '../src/engine.js';
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const colors={2:'🟠',3:'🟢',4:'🟣',5:'🔵',6:'🔴'};
const fmt=new Intl.DateTimeFormat('cs-CZ',{timeZone:'Europe/Prague',day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'});
const time=t=>fmt.format(new Date(t));
const signed=n=>n>0?'+'+n:String(n);
export function notificationEvents(s,teamId=3){
 const teams=new Map(s.teams.map(t=>[t.id,t.name])),stations=new Map(s.topology.stations.map(t=>[t.id,t]));
 if(!teams.has(teamId))throw Error('Unknown notification team');
 const label=id=>id==null?'⚪ Neutrální':(colors[id]||'⚪')+' '+esc(teams.get(id));
 const limit=s.rules.tickets_per_day,until=Math.min(Date.parse(s.fetchedAt),Date.parse(s.rules.game_end_datetime));
 const rows=s.captures.map(c=>({...c,ms:Date.parse(c.datetime_created)})).filter(c=>c.ms<=until).sort((a,b)=>a.ms-b.ms||a.id-b.id);
 const previous=new Map(),spent=new Map(),out=[];
 const add=(key,at,html,kind,points=0)=>out.push({key,at,html,kind,points});
 function decay(c,end,inclusive){
  const st=stations.get(c.station_id);if(st.category!=='tram'||c.team_id!==teamId)return 0;
  const steps=timeline(c,s.rules),mult=st.is_terminus?s.rules.terminus_multiplier:1;let points=0;
  for(let i=0;i<steps.length;i++){const d=steps[i];if(d.at>end||(!inclusive&&d.at===end))break;points+=mult;
   add('decay|'+c.key+'|'+d.at,d.at,'<b>📉 DECAY</b>\n🚏 <b>'+esc(st.name)+'</b>\n\nHodnota: <b>'+d.from+' → '+d.to+'</b>\n🏆 <b>+'+mult+' '+(mult===1?'bod':'body')+'</b>'+(st.is_terminus?' (konečná)':'')+'\n'+(steps[i+1]?'🕒 Další decay: <i>'+time(steps[i+1].at)+'</i>':'🔒 Dosažena minimální hodnota'),'decay',mult);
  }return points;
 }
 for(const c of rows){
  const st=stations.get(c.station_id),old=previous.get(c.station_id),day=gameDayKey(c.ms),k=day+'|'+c.team_id;
  if(!st||!teams.has(c.team_id))throw Error('Invalid capture reference');
  const retained=old?decay(old,c.ms,false):0;
  if(st.category==='tram')spent.set(k,(spent.get(k)||0)+c.value);
  if(c.team_id===teamId||old?.team_id===teamId){
   const own=c.team_id===teamId,reinforce=own&&old?.team_id===teamId,loss=!own;
   const title=loss?'❌ ZTRACENO':reinforce?'🛡️ POSÍLENO':old?'⚔️ OBSAZENO':'🚩 OBSAZENO';
   let html='<b>'+title+'</b>\n'+(st.category==='train'?'🚆':'🚏')+' <b>'+esc(st.name)+'</b>\n\n'+(reinforce?label(teamId):label(old?.team_id)+' → '+label(c.team_id))+'\n👥 Počet hráčů: <b>'+c.value+'</b>';
   if(loss&&retained)html+='\n🏆 Uchováno díky decay: <b>'+retained+'</b>';
   if(own&&st.category==='tram')html+='\n🎫 Jízdenky: <b>'+Math.max(0,limit-(spent.get(k)||0))+'/'+limit+'</b>';
   if(st.category==='train')html+='\n🔒 Uzávěrka: <i>'+time(trainLockAt(c.ms,s.rules))+'</i>';
   html+='\n<i>'+time(c.ms)+'</i>';
   add('capture|'+c.key,c.ms,html,loss?'loss':reinforce?'reinforce':old?'takeover':'first',own&&!old&&st.category==='tram'?s.rules.first_capture_bonus:0);
  }
  previous.set(c.station_id,c);
 }
 for(const c of previous.values())decay(c,until,true);
 return out.sort((a,b)=>a.at-b.at||a.key.localeCompare(b.key));
}
export function dailyReport(s,teamId,end,events){
 const start=end-86400000,team=s.teams.find(t=>t.id===teamId),day=gameDayKey(start);
 const e=events.filter(x=>x.at>=start&&x.at<end),count=k=>e.filter(x=>x.kind===k).length;
 const state=reconstruct(s.topology,s.rules,s.checkpoint,s.captures,end-1);
 if(state.errors.length||state.warnings.length)throw Error('Report state invalid');
 const spent=s.captures.filter(c=>c.team_id===teamId&&c.category==='tram'&&gameDayKey(Date.parse(c.datetime_created))===day).reduce((n,c)=>n+c.value,0);
 const owned=[...state.states.values()].filter(x=>x.owner===team.name),train=owned.filter(x=>x.category==='train'&&x.lockAt===end).reduce((n,x)=>n+x.value,0);
 const decay=e.filter(x=>x.kind==='decay').reduce((n,x)=>n+x.points,0),bonus=e.filter(x=>x.kind==='first').reduce((n,x)=>n+x.points,0);
 const ranking=Object.entries(state.scoring).sort((a,b)=>b[1].total-a[1].total).map(([name,v],i)=>{const t=s.teams.find(t=>t.name===name);return (i+1)+'. '+(colors[t?.id]||'⚪')+' '+esc(name)+' – <b>'+v.total+'</b>';}).join('\n');
 const next=owned.filter(x=>x.category==='tram').flatMap(x=>x.pending.map(p=>({...p,name:x.name,mult:x.is_terminus?s.rules.terminus_multiplier:1}))).sort((a,b)=>a.at-b.at);
 const forecast=next.filter(x=>x.at<end+86400000&&x.at<=Date.parse(s.rules.game_end_datetime)).reduce((n,x)=>n+x.mult,0);
 return '<b>📊 '+esc(team.name.toUpperCase())+' | DENNÍ REPORT</b>\n<i>'+day+' · 03:00–02:59</i>\n\n<b>🚏 Zastávky</b>\nPrvní obsazení: '+count('first')+'\nPřevzato: '+count('takeover')+'\nZtraceno: '+count('loss')+'\nPosíleno: '+count('reinforce')+'\nBilance: <b>'+signed(count('first')+count('takeover')-count('loss'))+'</b>\nCelkem vlastníme: '+owned.length+'\n\n<b>🏆 Jisté body</b>\nDecay: '+signed(decay)+'\nPrvní bonusy: '+signed(bonus)+'\nUzavřené vlakové eventy: '+signed(train)+'\n\n<b>🎫 Jízdenky</b>\nVyužito: '+spent+'/'+s.rules.tickets_per_day+'\nNevyužito: '+Math.max(0,s.rules.tickets_per_day-spent)+'\n\n<b>🏅 Pořadí týmů</b>\n'+ranking+'\n\n<b>🔮 Výhled</b>\nPotenciální decay: '+signed(forecast)+(next.length?'\nNejbližší: 🚏 '+esc(next[0].name)+' – '+time(next[0].at):'')+'\n\n🎫 Nový herní den: '+s.rules.tickets_per_day+'/'+s.rules.tickets_per_day;
}
