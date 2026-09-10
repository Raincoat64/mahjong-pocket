const test=require('node:test'),assert=require('node:assert/strict');
const {MahjongSession}=require('../dist-test/engine/session.js');
const {MemoryMatchSaveRepository}=require('../dist-test/persistence/repository.js');
function fixture(){const repository=new MemoryMatchSaveRepository();const session=MahjongSession.createNew(31,{repository},{now:100});return {repository,session};}
for(const [name,mutate] of [
 ['missing player',e=>e.match.round.players.pop()],
 ['invalid tile',e=>e.match.round.players[0].hand[0]='bad'],
 ['invalid current player',e=>e.match.round.currentPlayer=9],
 ['invalid score',e=>e.match.scores[0]='25000'],
 ['missing pending call',e=>{e.match.round.phase='WAIT_CALL';delete e.match.round.pendingDiscard;}],
 ['invalid wall',e=>e.match.round.wall.tiles=[]],
 ['invalid pause',e=>e.paused='false']
 ,['invalid history',e=>e.match.history=[{pointChanges:'invalid',scoresAfter:[25000,25000,25000,25000]}]]
 ,['invalid draw players',e=>e.match.round.drawResult={reason:'NAGASHI_MANGAN',nagashiPlayers:'invalid'}]
 ,['invalid call response',e=>{const r=e.match.round;r.players[0].river.push({tile:'N',tsumogiri:false,riichi:false});r.pendingDiscard={discarder:0,tile:'N',riverIndex:0,riichiDeclaration:false,responses:{1:{type:'PON'}}};}]
 ,['invalid point changes',e=>e.match.round.winResult={type:'TSUMO',winners:[0],winningTile:'N',pointChanges:{}}]
])test(`corrupt save rejected without deletion: ${name}`,async()=>{
 const {repository,session}=fixture(),raw=JSON.parse(session.serialize());mutate(raw);repository.value=JSON.stringify(raw);
 const before=repository.value;await assert.rejects(MahjongSession.restore({repository}),/CORRUPT_SESSION/);assert.equal(repository.value,before);
});
test('malformed JSON and unsupported future versions do not overwrite data',async()=>{
 const {repository,session}=fixture();repository.value='{bad';await assert.rejects(MahjongSession.restore({repository}),/CORRUPT_SESSION/);
 const raw=JSON.parse(session.serialize());raw.schemaVersion=99;repository.value=JSON.stringify(raw);
 await assert.rejects(MahjongSession.restore({repository}),/UNSUPPORTED_SESSION/);assert.equal(JSON.parse(repository.value).schemaVersion,99);
});
test('nested legacy round schema is migrated on session restore',async()=>{
 const {repository,session}=fixture(),raw=JSON.parse(session.serialize());raw.match.round.schemaVersion=2;
 raw.match.round.players.forEach(p=>delete p.doubleRiichi);delete raw.difficulty;
 repository.value=JSON.stringify(raw);const restored=await MahjongSession.restore({repository});
 assert.equal(restored.match.round.schemaVersion,3);assert.equal(restored.difficulty,'normal');assert.equal(restored.match.round.players[0].doubleRiichi,false);
});
