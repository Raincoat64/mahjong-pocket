const test=require('node:test');
const assert=require('node:assert/strict');
const {createMatch,settleCurrentRound,continueMatch}=require('../dist-test/engine/match.js');
const {forceExhaustiveDrawForTest}=require('../dist-test/engine/round.js');
const {buildTableViewModel}=require('../dist-test/ui/table-view-model.js');
function fixture(winners){
  const match=createMatch({seed:22,now:100});
  for(const player of match.round.players){
    player.hand=['m1','m2','m4','m5','m7','p1','p3','p5','p7','s1','s3','s5','s7'];
    player.river=(winners.includes(player.id)?['m1','p9','E']:['m2']).map(tile=>({tile,riichi:false,tsumogiri:false}));
  }
  return match;
}
test('child nagashi has mangan tsumo payments, no noten/honba/stick award',()=>{
  const match=fixture([1]);match.round.honba=2;match.round.riichiSticks=3;
  forceExhaustiveDrawForTest(match.round,101);
  assert.equal(match.round.drawResult.reason,'NAGASHI_MANGAN');
  assert.deepEqual(match.round.drawResult.pointChanges,[-4000,8000,-2000,-2000]);
  assert.equal(match.round.riichiSticks,3);
  settleCurrentRound(match,undefined,102);
  assert.deepEqual(buildTableViewModel(match).result.winners,[1]);
  continueMatch(match,103);
  assert.equal(match.round.dealer,1);assert.equal(match.round.honba,3);assert.equal(match.round.riichiSticks,3);
});
test('parent and child simultaneous nagashi payments are accumulated',()=>{
  const match=fixture([0,2]);forceExhaustiveDrawForTest(match.round,101);
  assert.deepEqual(match.round.drawResult.pointChanges,[8000,-6000,4000,-6000]);
});
test('called terminal discard disqualifies nagashi; empty river never qualifies',()=>{
  const match=fixture([1]);match.round.players[1].river[0].calledBy=2;match.round.players[3].river=[];
  forceExhaustiveDrawForTest(match.round,101);
  assert.equal(match.round.drawResult.reason,'EXHAUSTIVE');
});
test('nagashi continuation is based on dealer tenpai, even if another player qualifies',()=>{
  const match=fixture([1]);
  match.round.players[0].hand=['m1','m2','m3','m4','m5','m6','p2','p3','p4','s6','s7','E','E'];
  forceExhaustiveDrawForTest(match.round,101);settleCurrentRound(match,undefined,102);
  assert.equal(match.pendingNext,'REPEAT');
});
