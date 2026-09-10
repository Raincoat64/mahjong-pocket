const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialRound}=require('../dist-test/engine/round.js');
const {captureMelds,detectMeldAnnouncement}=require('../dist-test/ui/meld-announcement.js');
for(const [type,label] of [['chi','チー'],['pon','ポン'],['daiminkan','カン'],['ankan','カン']])test(`${type} announcement only on committed meld`,()=>{
 const round=createInitialRound(42,100),before=captureMelds(round);
 assert.equal(detectMeldAnnouncement(before,round),null);
 round.players[2].melds.push({type,tiles:['m2','m2','m2']});
 assert.equal(detectMeldAnnouncement(before,round).label,label);
 assert.equal(detectMeldAnnouncement(before,round).playerId,2);
 assert.equal(detectMeldAnnouncement(captureMelds(round),round),null);
});
test('added kan is announced but new round and restore do not replay previous calls',()=>{
 const round=createInitialRound(42,100);round.players[0].melds.push({type:'pon',tiles:['m2','m2','m2']});
 const before=captureMelds(round);round.players[0].melds[0].type='kakan';
 assert.equal(detectMeldAnnouncement(before,round).detail,'加槓');
 assert.equal(detectMeldAnnouncement(captureMelds(round),JSON.parse(JSON.stringify(round))),null);
 round.gameId='new-round';assert.equal(detectMeldAnnouncement(before,round),null);
});
