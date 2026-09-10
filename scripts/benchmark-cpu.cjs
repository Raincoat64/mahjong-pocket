const {createMatch,settleCurrentRound,continueMatch}=require('../dist-test/engine/match.js');
const {getLegalActions,applyAction}=require('../dist-test/engine/round.js');
const {chooseProfileTurnAction,chooseProfileResponseAction}=require('../dist-test/ai/profiles.js');
const {chooseNormalResponseActionForState}=require('../dist-test/ai/action-policy.js');
const {MajiangCoreCalculator}=require('../dist-test/adapter/majiang-core.js');
const count=Number(process.argv[2]||100),base=['strong','normal','weak','normal'];
const stats=Object.fromEntries(['weak','normal','strong'].map(p=>[p,{matches:0,hands:0,placement:0,score:0,wins:0,dealIns:0,riichi:0,calls:0,tsumo:0,drawHands:0,drawTenpai:0}]));
for(let n=0;n<count;n++){
 const profiles=base.map((_,i)=>base[(i+n)%4]),calc=MajiangCoreCalculator.fromVendoredRuntime();
 const match=createMatch({seed:610000+n,now:100});let rounds=0;
 while(match.phase!=='MATCH_RESULT'){
  if(++rounds>60)throw Error('MATCH_LIMIT');
  const r=match.round;let steps=0;
  while(!['WIN_RESOLUTION','DRAW_RESOLUTION'].includes(r.phase)){
   if(++steps>1000)throw Error('STEP_LIMIT');
   const now=100+rounds*2000+steps;
   if(r.phase==='WAIT_DISCARD')applyAction(r,r.currentPlayer,chooseProfileTurnAction(r,r.currentPlayer,calc,profiles[r.currentPlayer]),now,calc);
   else if(r.phase==='DRAW')applyAction(r,r.currentPlayer,{type:'DRAW'},now,calc);
   else{
    const actor=r.pendingDiscard?.discarder??r.pendingKan?.playerId;
    for(const id of [0,1,2,3]){
     if(!['WAIT_CALL','WAIT_KAN_RON'].includes(r.phase))break;
     const pending=r.pendingDiscard??r.pendingKan;if(id===actor||pending.responses[id])continue;
     const actions=getLegalActions(r,id,calc);applyAction(r,id,chooseProfileResponseAction(r,id,actions,profiles[id]),now,calc);
    }
   }
  }
  for(const p of r.players){const s=stats[profiles[p.id]];s.hands++;s.riichi+=Number(p.riichi);s.calls+=Number(p.melds.some(m=>m.type!=='ankan'));s.wins+=Number(!!r.winResult?.winners.includes(p.id));s.dealIns+=Number(r.winResult?.loser===p.id);s.tsumo+=Number(r.winResult?.type==='TSUMO'&&r.winResult.winners.includes(p.id));if(r.drawResult?.reason==='EXHAUSTIVE'){s.drawHands++;s.drawTenpai+=Number(r.drawResult.tenpaiPlayers.includes(p.id));}}
  settleCurrentRound(match,calc,100+rounds*2000+1500);continueMatch(match,100+rounds*2000+1600);
 }
 for(const id of [0,1,2,3]){const s=stats[profiles[id]];s.matches++;s.placement+=match.result.ranks[id];s.score+=match.result.scores[id];}
}
const ratio=(a,b)=>b?Number((a/b).toFixed(4)):0;
const result=Object.fromEntries(Object.entries(stats).map(([p,s])=>[p,{matches:s.matches,hands:s.hands,averagePlacement:ratio(s.placement,s.matches),averageScore:ratio(s.score,s.matches),winRate:ratio(s.wins,s.hands),dealInRate:ratio(s.dealIns,s.hands),riichiRate:ratio(s.riichi,s.hands),callRate:ratio(s.calls,s.hands),tsumoRate:ratio(s.tsumo,s.hands),exhaustiveDrawTenpaiRate:ratio(s.drawTenpai,s.drawHands)}]));
console.log(JSON.stringify({seedStart:610000,matches:count,seatRotation:true,metrics:'Rates per player-hand; call rate means at least one open meld. Lower average placement is better.',profiles:result},null,2));

