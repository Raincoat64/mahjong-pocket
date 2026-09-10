const test=require('node:test'),assert=require('node:assert/strict');
const {MahjongSession}=require('../dist-test/engine/session.js');
const {MemoryMatchSaveRepository}=require('../dist-test/persistence/repository.js');
const {MajiangCoreCalculator}=require('../dist-test/adapter/majiang-core.js');
const {chooseProfileTurnAction,chooseProfileResponseAction}=require('../dist-test/ai/profiles.js');

test('all checkpoints in eight generated one-hand games restore exactly, including responses and results',async()=>{
 const phases=new Set();let checkpoints=0;
 for(let seed=8000;seed<8008;seed++){
  const calculator=MajiangCoreCalculator.fromVendoredRuntime(),repository=new MemoryMatchSaveRepository();
  const deps={repository,winValidator:calculator,settlementProvider:calculator};
  const session=MahjongSession.createNew(seed,deps,{mode:'ONE_HAND',difficulty:'strong',now:100});
  await session.saveNow();
  for(let step=0;step<1200;step++){
   const restored=await MahjongSession.restore(deps);
   assert.equal(restored.serialize(),session.serialize());checkpoints++;
   phases.add(session.match.round.phase);phases.add(session.match.phase);
   if(session.match.phase==='MATCH_RESULT')break;
   if(step===1199)assert.fail('Game did not finish');
   const stop=await session.advanceOneStep(100+step);
   if(stop?.reason==='HUMAN_ACTION'){
    const r=session.match.round;
    const action=r.phase==='WAIT_DISCARD'?chooseProfileTurnAction(r,0,calculator,'strong'):chooseProfileResponseAction(r,0,stop.legalActions,'strong');
    await session.applyHumanAction(action,100+step);
   }else if(stop?.reason==='ROUND_RESULT'){
    session.controller.continueAfterRound(100+step);await session.saveNow();
   }
  }
 }
 assert.ok(checkpoints>500);
 for(const phase of ['WAIT_DISCARD','WAIT_CALL','DRAW','ROUND_RESULT','MATCH_RESULT'])assert.ok(phases.has(phase),phase);
});
