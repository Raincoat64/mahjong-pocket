const { MajiangCoreCalculator } = require('../dist-test/adapter/majiang-core.js');
const { createMatch, settleCurrentRound, continueMatch } = require('../dist-test/engine/match.js');
const { getLegalActions, applyAction } = require('../dist-test/engine/round.js');
const { chooseNormalTurnAction, chooseNormalResponseActionForState } = require('../dist-test/ai/action-policy.js');

const ids=[0,1,2,3];


function playRound(round, baseNow, scorer){
  let steps=0;
  while(!['WIN_RESOLUTION','DRAW_RESOLUTION'].includes(round.phase)){
    if(++steps>1000) throw new Error(`ROUND_STEP_LIMIT phase=${round.phase}`);
    const now=baseNow+steps;
    if(round.phase==='WAIT_DISCARD'){
      const p=round.currentPlayer;
      applyAction(round,p,chooseNormalTurnAction(round,p,scorer),now,scorer);
    } else if(round.phase==='DRAW'){
      const p=round.currentPlayer;
      const a=getLegalActions(round,p,scorer).find(x=>x.type==='DRAW');
      if(!a) throw new Error('DRAW_MISSING');
      applyAction(round,p,a,now,scorer);
    } else if(round.phase==='WAIT_CALL'){
      const discarder=round.pendingDiscard.discarder;
      for(const p of ids){
        if(round.phase!=='WAIT_CALL'||p===discarder||round.pendingDiscard.responses[p]) continue;
        const actions=getLegalActions(round,p,scorer);
        applyAction(round,p,chooseNormalResponseActionForState(round,p,actions),now,scorer);
      }
    } else if(round.phase==='WAIT_KAN_RON'){
      const actor=round.pendingKan.playerId;
      for(const p of ids){
        if(round.phase!=='WAIT_KAN_RON'||p===actor||round.pendingKan.responses[p]) continue;
        const actions=getLegalActions(round,p,scorer);
        applyAction(round,p,chooseNormalResponseActionForState(round,p,actions),now,scorer);
      }
    } else throw new Error(`UNHANDLED:${round.phase}`);
  }
  return steps;
}

function playMatch(seed){
  const scorer=MajiangCoreCalculator.fromVendoredRuntime();
  const m=createMatch({seed,now:seed});
  let rounds=0,totalSteps=0;
  while(m.phase!=='MATCH_RESULT'){
    if(++rounds>60) throw new Error(`MATCH_ROUND_LIMIT seed=${seed}`);
    totalSteps+=playRound(m.round,seed+rounds*2000,scorer);
    settleCurrentRound(m,scorer,seed+rounds*2000+1500);
    continueMatch(m,seed+rounds*2000+1600);
  }
  return {rounds,totalSteps,scores:m.result.scores};
}

const count=Number(process.argv[2]||25);
let maxRounds=0,maxSteps=0,totalRounds=0;
for(let i=0;i<count;i++){
  const r=playMatch((20260830+i)>>>0);
  maxRounds=Math.max(maxRounds,r.rounds);
  maxSteps=Math.max(maxSteps,r.totalSteps);
  totalRounds+=r.rounds;
}
console.log(JSON.stringify({matches:count,completed:count,totalRounds,maxRounds,maxSteps},null,2));

