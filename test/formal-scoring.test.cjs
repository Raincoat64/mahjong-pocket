const test = require('node:test');
const assert = require('node:assert/strict');
const { MajiangCoreCalculator } = require('../dist-test/adapter/majiang-core.js');
const { createInitialRound, getLegalActions } = require('../dist-test/engine/round.js');

function tiles(text) { return text.split(' '); }
function fixture(hand, {winner = 1, tsumo = false, tile = 's8', melds = [], riichi = false} = {}) {
  const state = createInitialRound(123, 123);
  state.callsMade = 1;
  for (const p of state.players) {
    p.river = [{tile: 'N', tsumogiri: false, riichi: false}];
    p.riichi = false; p.doubleRiichi = false; p.ippatsuEligible = false;
  }
  state.players[winner].hand = tiles(hand);
  state.players[winner].melds = melds;
  state.players[winner].riichi = riichi;
  state.currentPlayer = winner;
  state.lastDrawnTile = tile;
  state.lastDrawSource = 'WALL';
  state.wall.tiles[state.wall.deadWallStart + 4] = 'W';
  state.wall.tiles[state.wall.deadWallStart + 5] = 'W';
  state.winResult = tsumo
    ? {type: 'TSUMO', winners: [winner], winningTile: tile}
    : {type: 'RON', winners: [winner], loser: 0, winningTile: tile, context: 'DISCARD', discardDrawSource: 'WALL'};
  return state;
}
function score(state) { return MajiangCoreCalculator.fromVendoredRuntime().calculateScore(state, state.winResult.winners[0]); }

test('formal pinfu tsumo: child 20 fu 2 han, 400/700', () => {
  const r = score(fixture('m1 m2 m3 m4 m5 m6 p2 p3 p4 p6 p6 s6 s7 s8', {tsumo: true}));
  assert.equal(r.fu, 20); assert.equal(r.fanshu, 2);
  assert.deepEqual(r.fenpei, [-700, 1500, -400, -400]);
});

test('formal no-yaku shape and dora alone cannot ron', () => {
  const state = fixture('m1 m2 m3 m4 m5 m6 p2 p3 p4 E E s6 s7');
  state.wall.tiles[state.wall.deadWallStart + 4] = 'm3';
  assert.equal(MajiangCoreCalculator.fromVendoredRuntime().canRon(state, 1, 's8', 0, 'DISCARD'), false);
});

test('formal open no-yaku shape cannot tsumo or offer TSUMO', () => {
  const state = fixture('m4 m5 m6 p2 p3 p4 E E s6 s7 s8', {tsumo: true,
    melds: [{type: 'chi', tiles: tiles('m1 m2 m3'), calledFrom: 0, calledTile: 'm3'}]});
  const calc = MajiangCoreCalculator.fromVendoredRuntime();
  assert.equal(calc.canTsumo(state, 1), false);
  assert.equal(getLegalActions(state, 1, calc).some(a => a.type === 'TSUMO'), false);
});

test('formal open tanyao parent ron is 30 fu 1 han 1500', () => {
  const state = fixture('m4 m5 m6 p2 p3 p4 p6 p6 s6 s7', {winner: 0,
    melds: [{type: 'chi', tiles: tiles('m2 m3 m4'), calledFrom: 3, calledTile: 'm4'}]});
  state.winResult.loser = 3;
  const r = score(state);
  assert.equal(r.fu, 30); assert.equal(r.fanshu, 1); assert.equal(r.defen, 1500);
  assert.deepEqual(r.fenpei, [1500, 0, 0, -1500]);
});

test('formal ankan stays menzen: riichi+tanyao, 50 fu 2 han 3200', () => {
  const r = score(fixture('m4 m5 m6 p2 p3 p4 p6 p6 s6 s7', {riichi: true,
    melds: [{type: 'ankan', tiles: tiles('m2 m2 m2 m2')}] }));
  assert.equal(r.fu, 50); assert.equal(r.fanshu, 2); assert.equal(r.defen, 3200);
  assert.deepEqual(r.hupai, [{name: '立直', fanshu: 1}, {name: '断幺九', fanshu: 1}]);
});

for (const type of ['pon', 'daiminkan', 'kakan']) {
  test(`formal ${type} encodes open meld and honors yaku`, () => {
    const r = score(fixture('m4 m5 m6 p2 p3 p4 p6 p6 s6 s7', {
      melds: [{type, tiles: tiles(type === 'pon' ? 'P P P' : 'P P P P'), calledFrom: 2, calledTile: 'P'}]
    }));
    assert.deepEqual(r.hupai, [{name: '翻牌 白', fanshu: 1}]);
    assert.equal(r.fanshu, 1);
    assert.equal(r.fu, type === 'pon' ? 30 : 40);
  });
}

test('formal red five in chi contributes red dora', () => {
  const r = score(fixture('m2 m3 m4 p2 p3 p4 p6 p6 s6 s7', {
    melds: [{type: 'chi', tiles: tiles('m4 mr m6'), calledFrom: 0, calledTile: 'mr'}]
  }));
  assert.equal(r.fanshu, 2);
  assert.ok(r.hupai.some(y => y.name === '赤ドラ' && y.fanshu === 1));
});

test('formal daisangen pao tsumo charges the responsible player', () => {
  const state = fixture('m2 m3 m4 p6 p6', {tsumo: true, tile: 'p6', melds: [
    {type: 'pon', tiles: tiles('P P P'), calledFrom: 0, calledTile: 'P'},
    {type: 'pon', tiles: tiles('F F F'), calledFrom: 3, calledTile: 'F'},
    {type: 'pon', tiles: tiles('C C C'), calledFrom: 2, calledTile: 'C'}
  ]});
  const r = score(state);
  assert.equal(r.damanguan, 1);
  assert.deepEqual(r.fenpei, [0, 32000, -32000, 0]);
});

test('formal calculators have independent session lifetimes', () => {
  assert.notEqual(MajiangCoreCalculator.fromVendoredRuntime(), MajiangCoreCalculator.fromVendoredRuntime());
});

test('formal chiitoitsu includes honba and deposits', () => {
  const state = fixture('m1 m1 m2 m2 p3 p3 p4 p4 s5 s5 s6 s6 E', {tile: 'E'});
  state.honba = 1; state.riichiSticks = 2;
  const r = score(state);
  assert.equal(r.fu, 25); assert.equal(r.fanshu, 2);
  assert.deepEqual(r.fenpei, [-1900, 3900, 0, 0]);
});

test('formal 40 fu 4 han child tsumo pays 2000/4000', () => {
  const state = fixture('m4 m5 m6 p2 p3 p4 s6 s7 s8 p6 p6', {tsumo: true, tile: 'p6', riichi: true,
    melds: [{type: 'ankan', tiles: tiles('m2 m2 m2 m2')}]});
  state.wall.tiles[state.wall.deadWallStart + 4] = 'm3';
  const r = score(state);
  assert.equal(r.fu, 40); assert.equal(r.fanshu, 4);
  assert.deepEqual(r.fenpei, [-4000, 8000, -2000, -2000]);
});

test('formal red and ura dora are both scored for riichi', () => {
  const state = fixture('m1 m2 m3 m4 mr m6 p2 p3 p4 p6 p6 s6 s7', {riichi: true});
  state.wall.tiles[state.wall.deadWallStart + 5] = 'p5';
  const r = score(state);
  assert.ok(r.hupai.some(y => y.name === '赤ドラ' && y.fanshu === 1));
  assert.ok(r.hupai.some(y => y.name === '裏ドラ' && y.fanshu === 2));
});

test('formal 30 fu 4 han remains 7700, no kiriage', () => {
  const state = fixture('m1 m2 m3 m4 mr m6 p2 p3 p4 p6 p6 s6 s7', {riichi: true});
  state.wall.tiles[state.wall.deadWallStart + 4] = 'm3';
  const r = score(state);
  assert.equal(r.fu, 30); assert.equal(r.fanshu, 4); assert.equal(r.defen, 7700);
});

test('formal kokushi thirteen-sided wait is single yakuman', () => {
  const r = score(fixture('m1 m9 p1 p9 s1 s9 E S W N P F C', {tile: 'E'}));
  assert.equal(r.damanguan, 1); assert.equal(r.defen, 32000);
});

test('formal counted yakuman enabled', () => {
  const state = fixture('m1 m1 m2 m2 m3 m3 m4 m4 m5 m5 m6 m6 m7', {tile: 'm7', riichi: true});
  state.wall.revealedDoraCount = 2;
  state.wall.tiles[state.wall.deadWallStart + 4] = 'm1';
  state.wall.tiles[state.wall.deadWallStart + 6] = 'm2';
  state.wall.tiles[state.wall.deadWallStart + 7] = 'W';
  const r = score(state);
  assert.ok(r.fanshu >= 13); assert.equal(r.defen, 32000);
});

test('formal double ron gives each honba and only first winner deposits', () => {
  const state = fixture('m4 m5 m6 p2 p3 p4 p6 p6 s6 s7', {riichi: true,
    melds: [{type: 'ankan', tiles: tiles('m2 m2 m2 m2')}]});
  state.players[2].hand = tiles('m3 m4 m5 p6 p7 p8 p2 p2 s6 s7');
  state.players[2].melds = [{type: 'ankan', tiles: tiles('s2 s2 s2 s2')}];
  state.players[2].riichi = true;
  state.winResult.winners = [1, 2];
  state.honba = 1; state.riichiSticks = 2;
  assert.deepEqual(MajiangCoreCalculator.fromVendoredRuntime().settleWin(state).pointChanges, [-7000, 5500, 3500, 0]);
});

test('formal seat wind payments map back to physical player ids', () => {
  const state = fixture('m1 m2 m3 m4 m5 m6 p2 p3 p4 p6 p6 s6 s7 s8', {tsumo: true});
  state.dealer = 2;
  ['W', 'N', 'E', 'S'].forEach((wind, id) => state.players[id].wind = wind);
  assert.deepEqual(MajiangCoreCalculator.fromVendoredRuntime().settleWin(state).pointChanges, [-400, 1500, -700, -400]);
});
