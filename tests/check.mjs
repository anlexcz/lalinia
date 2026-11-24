import fs from 'node:fs';
import assert from 'node:assert/strict';
import {reconstruct,impactOf,lossOf,opportunityFor,parseCaptureTime,stationHistory,findOperations,evaluateOperation,eventFeed,dailyTickets,gameDayKey,displayedScore} from '../src/engine.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../data/'+name+'.json',import.meta.url)));
const topology=read('topology'),rules=read('rules'),checkpoint=read('checkpoint'),events=read('captures');
const at=parseCaptureTime('23. 11. 2026, 05:00:00');
const baseline=events.filter(e=>e.id<=checkpoint.checkpoint_event_id);
const state=reconstruct(topology,rules,checkpoint,baseline,at);
assert.equal(state.errors.length,0);assert.equal(state.warnings.length,0);assert.equal(state.scoring['Cosa Nostra'].total,798);
assert.equal(state.graph.stations.size,398);assert.equal(topology.edges.length,328);
assert.equal(state.eventsCount,328);
const pm=[...state.states.values()].find(s=>s.category==='tram'&&s.name==='Prašný most');
assert.equal(pm.needed,4);
assert.equal(impactOf(state,pm.id,rules).gain,15);
const mal=[...state.states.values()].find(s=>s.category==='tram'&&s.name==='Malovanka');
assert.equal(lossOf(state,mal.id,rules).loss,80);
const added={id:332,datetime:'23. 11. 2026, 18:42:00',station:'Prašný most',category:'tram',team:'Cosa Nostra',value:4,author:'TEST'};
const at2=parseCaptureTime('23. 11. 2026, 18:43:00');
const changed=reconstruct(topology,rules,checkpoint,[...baseline,added],at2);
assert.equal(changed.errors.length,0);assert.equal(changed.states.get(pm.id).owner,'Cosa Nostra');
assert.equal(changed.scoring['Cosa Nostra'].total,813);assert.equal(changed.added,1);
console.log('OK: initial data, score, graph, attack, defense, one manually appended capture');

const history=stationHistory(changed,pm.id);
assert.equal(history[0].kind,'takeover');
assert.equal(history[0].team,'Cosa Nostra');
assert.equal(history[0].previousOwner,'Zemunski klan');
const combinations=findOperations(state,rules,4,30);
assert.ok(combinations.length>10);
assert.ok(combinations.every(op=>op.ids.length>=2 && op.ids.length<=3 && op.maxPlayers<=4 && op.cost<=30));
const pair=evaluateOperation(state,combinations[0].ids,rules);
assert.deepEqual(pair.deltas,combinations[0].deltas);
console.log('OK: capture history, takeover classification, local combinations and full graph score deltas');

const recent=parseCaptureTime('23. 11. 2026, 20:38:00');
const historic=events.filter(e=>e.id<=409); // Fixed historical fixture; newer syncs can append.
const full=reconstruct(topology,rules,checkpoint,historic,recent);
assert.equal(historic.length,404);
assert.equal(full.eventsCount,404);
assert.equal(full.errors.length,0,full.errors.join(' | '));
assert.equal(full.latestEvent,parseCaptureTime('23. 11. 2026, 20:37:37'));
const all=eventFeed(full);
assert.equal(all.length,404);
assert.equal(all[0].id,409);
const gains=eventFeed(full,{kind:'gain'});
const losses=eventFeed(full,{kind:'loss'});
assert.ok(gains.length>90);
assert.ok(losses.length>0);
assert.ok(gains.every(e=>e.team==='Cosa Nostra'));
assert.ok(losses.every(e=>e.previousOwner==='Cosa Nostra'&&e.team!=='Cosa Nostra'));
const spiritiEvents=eventFeed(full,{team:'Spiriti'});
assert.ok(spiritiEvents.length>0);
assert.ok(spiritiEvents.every(e=>e.team==='Spiriti'||e.previousOwner==='Spiriti'),'Team filter must include captures and losses');
assert.ok(spiritiEvents.some(e=>e.team!=='Spiriti'&&e.previousOwner==='Spiriti'),'Team filter must include losses');
// Reconstruct all pre-checkpoint event impacts from the complete capture history.
// Their sum must equal every official checkpoint score, including area bonuses.
const historicalFeed=eventFeed(full).filter(e=>e.id<=checkpoint.checkpoint_event_id);
assert.equal(historicalFeed.length,baseline.length);
assert.ok(historicalFeed.every(e=>e.impact&&e.impact.source==='historical-replay'));
const historicalTotals=Object.fromEntries(checkpoint.teams.map(t=>[t.name,{direct:0,area:0,total:0}]));
for(const event of historicalFeed){
 for(const [name,change] of Object.entries(event.impact.changes)){
  historicalTotals[name].direct+=change.direct;
  historicalTotals[name].area+=change.area;
  historicalTotals[name].total+=change.total;
 }
}
for(const team of checkpoint.teams){
 assert.equal(historicalTotals[team.name].direct,team.tram_score+team.train_score+team.metro_score,team.name+' historical direct points');
 assert.equal(historicalTotals[team.name].area,team.area_score,team.name+' historical area points');
 assert.equal(historicalTotals[team.name].total,team.total_score,team.name+' historical total points');
}
const hostivar=historicalFeed.find(e=>e.id===326);
assert.equal(hostivar.station,'Nádraží Hostivař');
assert.equal(hostivar.impact.changes.Yakuza.total,13);
assert.equal(hostivar.impact.changes['Cosa Nostra'].total,-6);
const satalice=historicalFeed.find(e=>e.id===153);
assert.equal(satalice.impact.changes['Cosa Nostra'].total,6);
assert.equal(satalice.impact.changes.Yakuza.total,-4);
assert.equal(satalice.impact.retainedOnTakeover,0);
console.log('OK: full historical event score deltas reconstruct every official checkpoint team score');

console.log('OK: official 404-event history, team and gains/losses filters');

const daily=dailyTickets(full,rules,recent);
assert.equal(daily.day,'2026-11-23');
assert.equal(daily.limit,120);
assert.equal(daily.teams['Cosa Nostra'].spent,120);
assert.equal(daily.teams['Cosa Nostra'].remaining,0);
assert.equal(daily.teams['Spiriti'].remaining,2);
assert.equal(daily.teams['Yakuza'].remaining,4);
assert.equal(daily.teams['Zemunski klan'].remaining,56);
assert.equal(daily.teams['Los Bandidos'].remaining,120);
assert.equal(dailyTickets(full,rules,parseCaptureTime('24. 11. 2026, 02:59:59')).teams['Cosa Nostra'].remaining,0);
assert.equal(dailyTickets(full,rules,parseCaptureTime('24. 11. 2026, 03:00:00')).teams['Cosa Nostra'].remaining,120);
assert.equal(gameDayKey(parseCaptureTime('24. 11. 2026, 02:59:59')),'2026-11-23');
assert.equal(displayedScore(full.scoring['Cosa Nostra'],false),full.scoring['Cosa Nostra'].total-full.scoring['Cosa Nostra'].area);
assert.equal(displayedScore(full.scoring['Cosa Nostra'],true),full.scoring['Cosa Nostra'].total);
assert.equal(full.warnings.length,0,full.warnings.join(' | '));
// Referenční oficiální pořadí ze stránky hry po capture #417.
const officialAt=parseCaptureTime('24. 11. 2026, 00:01:00');
const official=reconstruct(topology,rules,checkpoint,events.filter(e=>e.id<=417),officialAt);
for(const [team,points] of Object.entries({'Cosa Nostra':1112,'Los Bandidos':88,'Spiriti':545,'Yakuza':589,'Zemunski klan':680})){
 assert.equal(official.scoring[team].total,points,'Score mismatch: '+team);
}
console.log('OK: scores match official scoreboard after event #417');
console.log('OK: ticket reset at 03:00, all team budgets, clean vs total score, train events');

// New events may arrive automatically: don't pin the live file to an old count.
assert.ok(events.length>=412);
assert.equal(new Set(events.map(e=>e.id)).size,events.length);
assert.ok(events.every((e,i)=>i===0||events[i-1].id<e.id));
console.log('OK: append-only event log extends without invalidating fixed historic tests');
