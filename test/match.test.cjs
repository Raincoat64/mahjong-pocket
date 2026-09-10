const test = require('node:test');
const assert = require('node:assert/strict');

const { createMatch, settleCurrentRound, continueMatch, serializeMatchState, restoreMatchState } = require('../dist-test/engine/match.js');
const { forceExhaustiveDrawForTest } = require('../dist-test/engine/round.js');

function fixed(pointChanges) {
  return { settleWin() { return { pointChanges }; } };
}

function setWin(match, winners, loser, pointChanges) {
  const r = match.round;
  r.winResult = { type: loser == null ? 'TSUMO' : 'RON', winners, loser, winningTile: 'm1', pointChanges };
  r.phase = 'WIN_RESOLUTION';
}

test('match starts East 1 with supplied dealer and scores', () => {
  const m = createMatch({ seed: 1, now: 100, initialDealer: 2, scores: [26000,25000,24000,25000] });
  assert.equal(m.round.handNumber, 1);
  assert.equal(m.round.dealer, 2);
  assert.deepEqual(m.round.players.map(p => p.wind), ['W','N','E','S']);
  assert.deepEqual(m.scores, [26000,25000,24000,25000]);
});

test('dealer win repeats the hand, increments honba, and preserves result until continue', () => {
  const m = createMatch({ seed: 2, now: 100 });
  setWin(m, [0], 1);
  settleCurrentRound(m, fixed([12000,-12000,0,0]), 200);
  assert.equal(m.phase, 'ROUND_RESULT');
  assert.equal(m.round.phase, 'ROUND_RESULT');
  assert.deepEqual(m.round.winResult.winners, [0]);
  const finishedHand = m.round.players[0].hand.slice();
  continueMatch(m, 300);
  assert.equal(m.phase, 'PLAYING');
  assert.equal(m.round.handNumber, 1);
  assert.equal(m.round.dealer, 0);
  assert.equal(m.round.honba, 1);
  assert.notDeepEqual(m.round.players[0].hand, finishedHand);
  assert.deepEqual(m.scores, [37000,13000,25000,25000]);
});

test('child win advances dealer and hand number, resetting honba', () => {
  const m = createMatch({ seed: 3, now: 100 });
  m.round.honba = 2;
  setWin(m, [1], 0);
  settleCurrentRound(m, fixed([-8000,8000,0,0]), 200);
  assert.equal(m.pendingNext, 'ADVANCE');
  continueMatch(m, 300);
  assert.equal(m.round.handNumber, 2);
  assert.equal(m.round.dealer, 1);
  assert.equal(m.round.honba, 0);
  assert.deepEqual(m.round.players.map(p=>p.score), [17000,33000,25000,25000]);
});

test('exhaustive draw with dealer tenpai repeats and increments honba', () => {
  const m = createMatch({ seed: 4, now: 100 });
  const tenpai = ['m1','m2','m3','m4','m5','m6','m7','m8','m9','p1','p2','p3','E'];
  const noten = ['m1','m1','m4','m7','p1','p4','p7','s1','s4','s7','E','F','C'];
  m.round.players[0].hand = tenpai.slice();
  m.round.players[1].hand = noten.slice();
  m.round.players[2].hand = noten.slice();
  m.round.players[3].hand = noten.slice();
  forceExhaustiveDrawForTest(m.round, 200);
  settleCurrentRound(m, undefined, 201);
  assert.equal(m.pendingNext, 'REPEAT');
  assert.deepEqual(m.scores, [28000,24000,24000,24000]);
  continueMatch(m, 300);
  assert.equal(m.round.handNumber, 1);
  assert.equal(m.round.honba, 1);
});

test('East 4 dealer agari-yame ends if dealer is first', () => {
  const m = createMatch({ seed: 5, now: 100, scores: [31000,25000,23000,21000] });
  m.round.handNumber = 4;
  m.round.honba = 1;
  setWin(m, [0], 3);
  settleCurrentRound(m, fixed([12000,0,0,-12000]), 200);
  assert.equal(m.pendingNext, 'MATCH_END');
  continueMatch(m, 300);
  assert.equal(m.phase, 'MATCH_RESULT');
  assert.equal(m.result.ranking[0], 0);
});

test('East 4 dealer win repeats when dealer is not first', () => {
  const m = createMatch({ seed: 6, now: 100, scores: [20000,45000,20000,15000] });
  m.round.handNumber = 4;
  setWin(m, [0], 3);
  settleCurrentRound(m, fixed([8000,0,0,-8000]), 200);
  assert.equal(m.pendingNext, 'REPEAT');
  continueMatch(m, 300);
  assert.equal(m.round.handNumber, 4);
  assert.equal(m.round.dealer, 0);
});

test('tobi uses negative score only; exact zero does not end early', () => {
  const zero = createMatch({ seed: 7, now: 100, scores: [8000,42000,25000,25000] });
  setWin(zero, [1], 0);
  settleCurrentRound(zero, fixed([-8000,8000,0,0]), 200);
  assert.equal(zero.scores[0], 0);
  assert.notEqual(zero.pendingNext, 'MATCH_END');

  const neg = createMatch({ seed: 8, now: 100, scores: [7000,43000,25000,25000] });
  setWin(neg, [1], 0);
  settleCurrentRound(neg, fixed([-8000,8000,0,0]), 200);
  assert.equal(neg.scores[0], -1000);
  assert.equal(neg.pendingNext, 'MATCH_END');
});

test('unclaimed riichi sticks go to first place at match end', () => {
  const m = createMatch({ seed: 9, now: 100, mode: 'ONE_HAND', scores: [30000,26000,24000,20000] });
  m.round.riichiSticks = 2;
  m.round.drawResult = { reason: 'KYUUSHU_KYUUHAI' };
  m.round.phase = 'DRAW_RESOLUTION';
  settleCurrentRound(m, undefined, 200);
  continueMatch(m, 300);
  assert.equal(m.phase, 'MATCH_RESULT');
  assert.equal(m.result.scores[0], 32000);
  assert.equal(m.round.riichiSticks, 0);
});

test('match serialization round-trips exactly', () => {
  const m = createMatch({ seed: 10, now: 100 });
  const s = serializeMatchState(m);
  assert.equal(serializeMatchState(restoreMatchState(s)), s);
});
