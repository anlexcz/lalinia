import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {notificationEvents,dailyReport} from './notifications.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=process.env.LALINIA_DATA_DIR||path.join(root,'runtime');
const file=path.join(dir,'telegram-state.json');
const token=process.env.TELEGRAM_BOT_TOKEN,chat=process.env.TELEGRAM_CHAT_ID,team=Number(process.env.LALINIA_TEAM_ID||3);
const dry=process.argv.includes('--dry-run');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
if(!dry&&(!token||!chat))throw Error('Missing Telegram configuration');
let ledger=await read(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
async function save(){const tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(ledger),{mode:0o600});await fs.rename(tmp,file);}
async function send(html){
 let r;try{r=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text:html,parse_mode:'HTML',link_preview_options:{is_disabled:true}}),signal:AbortSignal.timeout(15000)});}catch{throw Error('Telegram network failure; delivery uncertain');}
 let d;try{d=await r.json();}catch{throw Error('Telegram response invalid; delivery uncertain');}
 if(!d.ok)throw Error('Telegram rejected message: HTTP '+r.status+' / '+d.error_code);
 return d.result.message_id;
}
async function tick(){
 const s=await read(path.join(dir,'snapshot.json'));
 const watermark=Date.parse(s.fetchedAt),start=Date.parse(s.rules.game_start_datetime),end=Date.parse(s.rules.game_end_datetime);
 if(s.source!=='official-api-v1'||![watermark,start,end].every(Number.isFinite))throw Error('Invalid snapshot');
 const events=notificationEvents(s,team);
 if(dry){console.log('Snapshot:',s.fetchedAt,'Events:',events.length);for(const e of events.slice(-3))console.log(e.html);const boundary=start+Math.floor((Math.min(watermark,end)-start)/86400000)*86400000;if(boundary>start)console.log(dailyReport(s,team,boundary,events));return;}
 if(!ledger){if(Date.now()-watermark>120000)throw Error('Waiting for fresh initial snapshot');ledger={version:1,team,chat,baseline:watermark,seen:Object.fromEntries(events.map(e=>[e.key,true])),pending:null};await save();console.log('Baseline initialized; historical notifications skipped');return;}
 if(ledger.version!==1||ledger.team!==team||ledger.chat!==chat)throw Error('Ledger identity mismatch');
 const queue=events.filter(e=>!ledger.seen[e.key]);
 for(let boundary=start+86400000;boundary<=end&&boundary+60000<=watermark;boundary+=86400000){
  const key='report|'+boundary;
  if(boundary+60000>ledger.baseline&&!ledger.seen[key])queue.push({key,at:boundary+60000,html:dailyReport(s,team,boundary,events)});
 }
 queue.sort((a,b)=>a.at-b.at||a.key.localeCompare(b.key));
 if(ledger.pending){console.error('Uncertain previous delivery:',ledger.pending.key,'; resolve ledger before continuing');return;}
 for(const e of queue){
  ledger.pending={key:e.key,at:e.at};await save();
  let id;try{id=await send(e.html);}catch(err){console.error(err.message);if(err.message.startsWith('Telegram rejected message:')){ledger.pending=null;await save();}return;}
  ledger.seen[e.key]=id;ledger.pending=null;await save();console.log('Sent',e.key,id);await new Promise(r=>setTimeout(r,3100));
 }
}
if(dry){await tick();}else{for(;;){try{await tick();}catch(e){console.error('Notification tick:',e.message);}await new Promise(r=>setTimeout(r,10000));}}
