import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {adaptApi} from '../src/api-adapter.mjs';
import {reconstruct} from '../src/engine.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=process.env.LALINIA_DATA_DIR||path.join(root,'runtime');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const write=async(name,value)=>{const target=path.join(dir,name),tmp=target+'.tmp';await fs.writeFile(tmp,JSON.stringify(value),{mode:0o644});await fs.rename(tmp,target);};
const rules=await read(path.join(root,'data/rules.json'));
const checkpoint=await read(path.join(root,'data/checkpoint.json'));
let previous=await read(path.join(dir,'snapshot.json')).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
let legacy=previous?.captures??await read(path.join(root,'data/captures.json'));
await fs.mkdir(dir,{recursive:true});
const once=process.argv.includes('--once');
let lastAttempt=0;
async function poll(){
 lastAttempt=Date.now();
 const response=await fetch('https://podsveti.cz/la_linia/api/game_history',{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}});
 if(!response.ok)throw Error('API HTTP '+response.status);
 const payload=await response.json();
 const adapted=adaptApi(payload,rules,legacy);
 const keys=new Set(adapted.captures.map(e=>e.id));
 if(legacy.some(e=>!keys.has(e.id)))throw Error('History correction requires reconciliation; retaining last valid snapshot');
 const now=Date.now();
 const state=reconstruct(adapted.topology,adapted.rules,checkpoint,adapted.captures,now);
 if(state.errors.length||state.warnings.length)throw Error([...state.errors,...state.warnings].join('; '));
 const snapshot={...adapted,checkpoint,fetchedAt:new Date(now).toISOString(),source:'official-api-v1'};
 await write('snapshot.json',snapshot);
 legacy=adapted.captures;previous=snapshot;
 console.log(snapshot.fetchedAt,'OK',adapted.captures.length,'captures');
}
do{
 try{await poll();}catch(e){console.error(new Date().toISOString(),e.message);if(once)process.exitCode=1;}
 if(!once)await new Promise(resolve=>setTimeout(resolve,Math.max(0,45000-(Date.now()-lastAttempt))));
}while(!once);
