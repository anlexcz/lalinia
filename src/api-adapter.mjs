// Official API v1 adapter. Gallery IDs are preserved for historical fixtures only.
export function captureKey(c) {
 return [new Date(c.datetime_created).toISOString(),c.station_id,c.team_id,c.value].join('|');
}
export function adaptApi(payload, legacyRules, legacyCaptures=[]) {
 if(String(payload.version)!=='1.0') throw Error('Unsupported API version');
 const d=payload.data;
 for(const k of ['stations','edges','teams','captures','metro_events_to_date']) if(!Array.isArray(d[k])) throw Error('Missing '+k);
 const index=(rows)=>{const m=new Map();for(const r of rows){if(!Number.isInteger(r.id)||m.has(r.id))throw Error('Invalid ID');m.set(r.id,r);}return m;};
 const stations=index(d.stations),teams=index(d.teams);index(d.edges);
 const p=d.public_settings;
 const rules={...legacyRules,area_scores:p.area_scores,decay_hours:p.decay,tickets_per_day:p.daily_tickets,first_capture_bonus:p.first_capture_bonus,terminus_multiplier:p.terminus_station_multiplier,protection_minutes:p.grace_period_minutes,capture_max_value:p.capture_max_value,reset_hour_prague:Number(p.new_day_time.split(':')[0]),game_start_datetime:p.game_start_datetime,game_end_datetime:p.game_end_datetime};
 const topology={stations:d.stations.map(s=>({...s,category:s.category||'unspecified'})),edges:d.edges.map(e=>{if(!stations.has(e.station_a_id)||!stations.has(e.station_b_id))throw Error('Unknown edge endpoint');return {id:e.id,from:e.station_a_id,to:e.station_b_id,geometry:e.coordinates};})};
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const legacyKey=e=>{const m=e.datetime.match(/^(\d+)\.\s*(\d+)\.\s*(\d+),?\s*(\d+):(\d+):(\d+)$/);if(!m)throw Error('Invalid legacy time');return [Date.parse(m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0')+'T'+m[4].padStart(2,'0')+':'+m[5]+':'+m[6]+'+01:00'),e.station,e.category,e.team,e.value].join('|');};
 const old=new Map(legacyCaptures.map(e=>[legacyKey(e),e.id]));
 let next=Math.max(0,...legacyCaptures.map(e=>e.id))+1;
 const seen=new Set();
 const captures=[...d.captures].sort((a,b)=>Date.parse(a.datetime_created)-Date.parse(b.datetime_created)).map(c=>{
  const s=stations.get(c.station_id),t=teams.get(c.team_id);
  if(!s||!t||!Number.isInteger(c.value)||c.value<rules.minimum_players)throw Error('Invalid capture');
  const key=captureKey(c);if(seen.has(key))throw Error('Duplicate capture');seen.add(key);
  const ms=Date.parse(c.datetime_created),v=Object.fromEntries(fmt.formatToParts(new Date(ms)).map(p=>[p.type,p.value]));
  const category=s.category||'unspecified',id=old.get([ms,s.name,category,t.name,c.value].join('|'))??next++;
  return {id,key,datetime:v.day+'. '+v.month+'. '+v.year+', '+v.hour+':'+v.minute+':'+v.second,station:s.name,category,team:t.name,value:c.value,station_id:s.id,team_id:t.id,datetime_created:c.datetime_created};
 });
 return {topology,rules,captures,teams:d.teams,metroEvents:d.metro_events_to_date};
}
