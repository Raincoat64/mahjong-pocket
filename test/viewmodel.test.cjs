const test = require('node:test');
const assert = require('node:assert/strict');
const { createMatch, settleCurrentRound } = require('../dist-test/engine/match.js');
const { buildTableViewModel } = require('../dist-test/ui/table-view-model.js');

const scorer={ settleWin(){return {pointChanges:[8000,-8000,0,0]}} };

test('table view maps physical seats self/right/top/left and hides opponent hands', () => {
  const m=createMatch({seed:20,now:100});
  const vm=buildTableViewModel(m,0);
  assert.equal(vm.players.self.playerId,0);
  assert.equal(vm.players.right.playerId,1);
  assert.equal(vm.players.top.playerId,2);
  assert.equal(vm.players.left.playerId,3);
  assert.ok(vm.players.right.hand.every(x=>x==='back'));
  assert.ok(vm.players.self.hand.some(x=>x!=='back'));
});

test('called discard is omitted from river view to avoid duplicate physical tile', () => {
  const m=createMatch({seed:21,now:100});
  m.round.players[0].river=[
    {tile:'m1',tsumogiri:false,riichi:false,calledBy:1},
    {tile:'p1',tsumogiri:false,riichi:false}
  ];
  m.round.players[1].melds=[{type:'pon',tiles:['m1','m1','m1'],calledFrom:0,calledTile:'m1'}];
  const vm=buildTableViewModel(m,0);
  assert.deepEqual(vm.players.self.river.map(x=>x.tile),['p1']);
  // own hand + meld includes the physical m1 exactly once through the meld representation.
  assert.ok(vm.hint.visibleRemaining.get('m1') >= 0);
});

test('round result reveals CPU hands for exhaustive/win result screen', () => {
  const m=createMatch({seed:22,now:100});
  m.round.winResult={type:'RON',winners:[0],loser:1,winningTile:'m1'};
  m.round.phase='WIN_RESOLUTION';
  settleCurrentRound(m,scorer,200);
  const vm=buildTableViewModel(m,0);
  assert.equal(vm.result.type,'WIN');
  assert.ok(vm.players.right.hand.every(x=>x!=='back'));
  assert.ok(vm.players.top.hand.every(x=>x!=='back'));
});


test('view model exposes chronological recent discards and current turn number', () => {
  const m=createMatch({seed:23,now:100});
  m.round.players[0].river=[
    {tile:'m1',tsumogiri:false,riichi:false,sequence:1},
    {tile:'p2',tsumogiri:false,riichi:false,sequence:3}
  ];
  m.round.players[1].river=[
    {tile:'s3',tsumogiri:false,riichi:false,sequence:2}
  ];
  m.round.discardSerial=3;
  m.round.currentPlayer=1;
  const vm=buildTableViewModel(m,0);
  assert.deepEqual(vm.recentDiscards.map(x=>[x.playerId,x.tile,x.sequence]),[
    [0,'m1',1],[1,'s3',2],[0,'p2',3]
  ]);
  assert.equal(vm.currentTurn.playerId,1);
  assert.equal(vm.currentTurn.seat,'right');
  assert.equal(vm.currentTurn.turnNumber,2);
  assert.equal(vm.players.self.river.at(-1).latest,true);
});

test('view model call prompt identifies source player, tile and concrete legal choices', () => {
  const m=createMatch({seed:24,now:100});
  m.round.phase='WAIT_CALL';
  m.round.currentPlayer=3;
  m.round.players[3].river=[{tile:'m3',tsumogiri:false,riichi:false,sequence:1}];
  m.round.discardSerial=1;
  m.round.pendingDiscard={
    discarder:3,
    tile:'m3',
    riverIndex:0,
    riichiDeclaration:false,
    responses:{1:{type:'PASS'},2:{type:'PASS'}}
  };
  // Give human a legal chi shape on upper player's discard.
  m.round.players[0].hand=['m1','m2','p1','p2','p3','s1','s2','s3','z1','z1','z2','z2','z3'];
  const vm=buildTableViewModel(m,0);
  assert.ok(vm.callPrompt);
  assert.equal(vm.callPrompt.sourcePlayerId,3);
  assert.equal(vm.callPrompt.sourceSeat,'left');
  assert.equal(vm.callPrompt.tile,'m3');
  assert.ok(vm.callPrompt.choices.some(a=>a.type==='CHI'));
});


test('win result view exposes winner/loser relationship, winning tile and point changes', () => {
  const m=createMatch({seed:25,now:100});
  m.round.winResult={
    type:'RON',
    winners:[0],
    loser:1,
    winningTile:'p5',
    context:'DISCARD',
    pointChanges:[8000,-8000,0,0]
  };
  m.round.players[0].score=33000;
  m.round.players[1].score=17000;
  m.round.phase='ROUND_RESULT';
  m.phase='ROUND_RESULT';
  const vm=buildTableViewModel(m,0);
  assert.equal(vm.result.type,'WIN');
  assert.equal(vm.result.winType,'RON');
  assert.deepEqual(vm.result.winners,[0]);
  assert.equal(vm.result.loser,1);
  assert.equal(vm.result.winningTile,'p5');
  assert.deepEqual(vm.result.pointChanges,[8000,-8000,0,0]);
  assert.deepEqual(vm.result.scores,[33000,17000,25000,25000]);
});

test('draw result view exposes point changes for result score presentation', () => {
  const m=createMatch({seed:26,now:100});
  m.round.drawResult={
    reason:'EXHAUSTIVE',
    tenpaiPlayers:[0,2],
    pointChanges:[1500,-1500,1500,-1500]
  };
  m.round.players.forEach((p,i)=>p.score=[26500,23500,26500,23500][i]);
  m.round.phase='ROUND_RESULT';
  m.phase='ROUND_RESULT';
  const vm=buildTableViewModel(m,0);
  assert.equal(vm.result.type,'DRAW');
  assert.deepEqual(vm.result.pointChanges,[1500,-1500,1500,-1500]);
});
