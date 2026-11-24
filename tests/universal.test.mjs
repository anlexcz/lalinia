import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reconstruct, eventFeed, impactOf, lossOf, parseCaptureTime, displayedScore, trainLockAt} from '../src/engine.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../data/'+name+'.json',import.meta.url)));
const top=read('topology'),rules=read('rules'),checkpoint=read('checkpoint');
const events=read('captures').filter(e=>e.id<=428);
const now=parseCaptureTime('24. 11. 2026, 08:10:00');
const state=reconstruct(top,rules,checkpoint,events,now);
assert.deepEqual(state.errors,[]);
assert.equal(Object.keys(state.scoring).length,5);
const last=eventFeed(state)[0];
assert.equal(last.id,428);
assert.equal(last.team,'Los Bandidos');
assert.equal(last.previousOwner,'Spiriti');
assert.equal(last.impact.changes['Los Bandidos'].direct,4);
assert.equal(last.impact.changes['Los Bandidos'].total,7);
assert.equal(last.impact.changes['Spiriti'].direct,-3);
assert.equal(last.impact.changes['Spiriti'].total,-19);
assert.ok(last.impact.retainedOnTakeover>=0);
assert.ok(eventFeed(state,{team:'Spiriti'}).some(e=>e.id===428),'team filter must include losses');
assert.ok(eventFeed(state,{team:'Los Bandidos'}).some(e=>e.id===428),'team filter must include gains');
assert.ok(eventFeed(state,{kind:'takeover'}).every(e=>e.kind==='takeover'));
for(const [team,score] of Object.entries(state.scoring)){
 assert.equal(displayedScore(score,true)-displayedScore(score,false),score.area);
 const atRisk=[...state.states.values()].filter(s=>s.category==='tram'&&s.owner===team).reduce((n,s)=>n+s.value*(s.is_terminus?rules.terminus_multiplier:1),0);
 assert.equal(atRisk+(score.tram-atRisk)+score.train+score.metro+score.area,score.total);
 const enemy=[...state.states.values()].find(s=>s.category==='tram'&&s.owner!==team&&s.needed<=5);
 if(enemy)assert.ok(impactOf(state,enemy.id,rules,team));
 const own=[...state.states.values()].find(s=>s.category==='tram'&&s.owner===team);
 if(own)assert.ok(lossOf(state,own.id,rules,team));
}

const braníkId=top.stations.find(s=>s.category==='train'&&s.name==='Braník').id;
const beforeLock=reconstruct(top,rules,checkpoint,events,parseCaptureTime('22. 11. 2026, 02:59:59'));
const afterLock=reconstruct(top,rules,checkpoint,events,parseCaptureTime('22. 11. 2026, 03:00:00'));
const muchLater=reconstruct(top,rules,checkpoint,events,parseCaptureTime('24. 11. 2026, 13:30:00'));
assert.equal(trainLockAt(parseCaptureTime('21. 11. 2026, 08:06:43'),rules),parseCaptureTime('22. 11. 2026, 03:00:00'));
assert.equal(beforeLock.states.get(braníkId).locked,false);
assert.equal(afterLock.states.get(braníkId).locked,true);
assert.equal(beforeLock.states.get(braníkId).value,8);
assert.equal(afterLock.states.get(braníkId).value,8);
assert.equal(muchLater.states.get(braníkId).value,8,'train value never decays, including during its event day');
assert.equal(muchLater.states.get(braníkId).needed,null,'locked train cannot be recaptured');
assert.deepEqual(muchLater.states.get(braníkId).pending,[],'locked train has no future decay');
assert.equal(muchLater.states.get(braníkId).owner,'Yakuza');
assert.equal(muchLater.scoring.Yakuza.train,8,'train score is retained after the end of its event day');
assert.equal(muchLater.scoring['Cosa Nostra'].train,20);
const kolovraty=top.stations.find(s=>s.category==='train'&&s.name==='Kolovraty').id;
assert.equal(muchLater.states.get(kolovraty).owner,'Zemunski klan','same-day train takeover remains valid');
assert.equal(muchLater.scoring['Zemunski klan'].train,24);

// Train captures are won by a strictly larger group, with no decay even 12+ hours later.
const sataliceId=top.stations.find(s=>s.category==='train'&&s.name==='Satalice').id;
const sataliceBefore=reconstruct(top,rules,checkpoint,events,parseCaptureTime('21. 11. 2026, 20:00:00'));
assert.equal(sataliceBefore.states.get(sataliceId).value,4,'train value stays at last group's size');
assert.equal(sataliceBefore.states.get(sataliceId).needed,5);
assert.equal(afterLock.states.get(sataliceId).value,6,'winning train group is retained without decay');
assert.equal(afterLock.states.get(sataliceId).owner,'Cosa Nostra');
assert.deepEqual(beforeLock.states.get(braníkId).transitions,[],'train events have no decay timeline');
// There is no future decay to show even while the train event is still open.
const early=reconstruct(top,rules,checkpoint,events,parseCaptureTime('21. 11. 2026, 20:00:00'));
assert.deepEqual(early.states.get(braníkId).pending,[]);
assert.equal(early.states.get(braníkId).needed,9);

console.log('OK: trains lock at 03:00, preserve their owner and value, retain scores and use zero tickets');

console.log('OK: universal team scores, decay retention, event changes, event filters and team-based operations');
