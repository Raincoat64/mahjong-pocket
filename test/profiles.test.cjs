const test=require('node:test');
const assert=require('node:assert/strict');
const {createInitialRound,getLegalActions}=require('../dist-test/engine/round.js');
const {chooseProfileTurnAction}=require('../dist-test/ai/profiles.js');
const {chooseProfileResponseAction}=require('../dist-test/ai/profiles.js');
const {discardTile}=require('../dist-test/engine/round.js');
const {MajiangCoreCalculator}=require('../dist-test/adapter/majiang-core.js');
const {MahjongSession}=require('../dist-test/engine/session.js');
const {MemoryMatchSaveRepository}=require('../dist-test/persistence/repository.js');
for(const difficulty of ['weak','normal','strong'])test(`${difficulty} CPU uses legal actions and ignores concealed data`,()=>{
  const state=createInitialRound(333,100);
  state.players[0].river=[{tile:'N',riichi:false,tsumogiri:false}];
  const calc=MajiangCoreCalculator.fromVendoredRuntime();
  const before=chooseProfileTurnAction(state,0,calc,difficulty);
  assert.ok(getLegalActions(state,0,calc).some(a=>JSON.stringify(a)===JSON.stringify(before)));
  for(const p of state.players.slice(1))p.hand=[];
  state.wall.tiles=state.wall.tiles.slice().reverse();
  const after=chooseProfileTurnAction(state,0,calc,difficulty);
  assert.deepEqual(after,before);
});
test('CPU difficulty persists through session restore; legacy defaults to normal',async()=>{
  const repository=new MemoryMatchSaveRepository();
  const deps={repository};
  const session=MahjongSession.createNew(333,deps,{difficulty:'strong',now:100});
  await session.saveNow();
  assert.equal((await MahjongSession.restore(deps)).controller.difficulty,'strong');
  const legacy=JSON.parse(repository.value);delete legacy.difficulty;
  repository.value=JSON.stringify(legacy);
  assert.equal((await MahjongSession.restore(deps)).controller.difficulty,'normal');
});

function responseFixture(hand,discard){
  const state=createInitialRound(432,100);
  const validator={canTsumo:()=>false,canRon:()=>false};
  state.players[1].hand=hand.split(' ');
  state.players[0].hand[13]=discard;
  state.lastDrawnTile=discard;
  discardTile(state,0,13,101,false,validator);
  return {state,actions:getLegalActions(state,1,validator)};
}
test('strong CPU avoids a yaku-less chi that normal accepts',()=>{
  const {state,actions}=responseFixture('m1 m2 p2 p3 p4 p6 p6 s3 s4 s5 s6 s8 p8','m3');
  assert.equal(chooseProfileResponseAction(state,1,actions,'normal').type,'CHI');
  assert.equal(chooseProfileResponseAction(state,1,actions,'strong').type,'PASS');
});
for(const [hand,discard,type] of [
  ['m2 m3 p2 p3 p4 p6 p6 s3 s4 s5 s6 s8 p8','m4','CHI'],
  ['P P p2 p3 p4 p6 p6 s3 s4 s5 s6 s8 m9','P','PON']
])test(`strong CPU accepts useful ${type} with open yaku and ignores concealed data`,()=>{
  const {state,actions}=responseFixture(hand,discard);
  const chosen=chooseProfileResponseAction(state,1,actions,'strong');
  assert.equal(chosen.type,type);
  assert.ok(actions.includes(chosen));
  state.players.filter(p=>p.id!==1).forEach(p=>{p.hand=[];});
  state.wall.tiles.reverse();
  assert.deepEqual(chooseProfileResponseAction(state,1,actions,'strong'),chosen);
});
test('strong response policy always keeps legal ron',()=>{
  const {state,actions}=responseFixture('m1 m2 p2 p3 p4 p6 p6 s3 s4 s5 s6 s8 p8','m3');
  const ron={type:'RON'};
  assert.equal(chooseProfileResponseAction(state,1,[...actions,ron],'strong'),ron);
});
