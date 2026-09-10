const test = require("node:test");
const assert = require("node:assert/strict");

const { createYonmaTileSet, countByType } = require("../dist-test/core/tile.js");
const {
  createYonmaWall,
  remainingLiveTiles,
  drawRinshanTile,
  getDoraIndicators,
  revealKanDora
} = require("../dist-test/core/wall.js");
const {
  createInitialRound,
  getLegalActions,
  discardTile,
  drawTile,
  submitCallResponse,
  serializeRoundState,
  restoreRoundState
} = require("../dist-test/engine/round.js");

test("yonma tile set has 136 tiles and one red five in each suit", () => {
  const tiles = createYonmaTileSet();
  assert.equal(tiles.length, 136);
  assert.equal(tiles.filter(x => x === "mr").length, 1);
  assert.equal(tiles.filter(x => x === "pr").length, 1);
  assert.equal(tiles.filter(x => x === "sr").length, 1);

  const counts = countByType(tiles);
  for (const [, count] of counts) assert.equal(count, 4);
});

test("wall is deterministic for the same seed", () => {
  const a = createYonmaWall(123456);
  const b = createYonmaWall(123456);
  const c = createYonmaWall(123457);
  assert.deepEqual(a.tiles, b.tiles);
  assert.notDeepEqual(a.tiles.slice(0, 20), c.tiles.slice(0, 20));
});

test("dead wall tracks rinshan and kan-dora deterministically", () => {
  const wall = createYonmaWall(123);
  const live = remainingLiveTiles(wall);
  assert.equal(getDoraIndicators(wall).length, 1);
  const rinshan = drawRinshanTile(wall);
  assert.ok(rinshan);
  assert.equal(wall.rinshanDrawCount, 1);
  assert.equal(remainingLiveTiles(wall), live - 1);
  revealKanDora(wall);
  assert.equal(getDoraIndicators(wall).length, 2);
});

test("initial round deals 13 tiles to three players and 14 to dealer", () => {
  const state = createInitialRound(42, 1000);
  assert.deepEqual(state.players.map(p => p.hand.length), [14,13,13,13]);
  assert.equal(state.phase, "WAIT_DISCARD");
  assert.equal(state.currentPlayer, 0);
  assert.equal(state.wall.drawIndex, 53);
  assert.equal(remainingLiveTiles(state.wall), 69);
  assert.equal(getLegalActions(state, 0).filter(a => a.type === "DISCARD").length, 14);
  assert.equal(getLegalActions(state, 1).length, 0);
});

test("discard -> call window -> all pass -> next player draw transition is serializable", () => {
  const state = createInitialRound(777, 1000);
  const dealerHandBefore = state.players[0].hand.length;
  const discarded = discardTile(state, 0, 0, 1001);

  assert.equal(state.players[0].hand.length, dealerHandBefore - 1);
  assert.equal(state.players[0].river.at(-1).tile, discarded);
  assert.equal(state.phase, "WAIT_CALL");

  for (const p of [1,2,3]) submitCallResponse(state, p, { type: "PASS" }, 1001 + p);
  assert.equal(state.currentPlayer, 1);
  assert.equal(state.phase, "DRAW");

  const drawn = drawTile(state, 1, 1005);
  assert.ok(drawn);
  assert.equal(state.players[1].hand.length, 14);
  assert.equal(state.phase, "WAIT_DISCARD");
  assert.equal(state.currentPlayer, 1);

  const serialized = serializeRoundState(state);
  const restored = restoreRoundState(serialized);
  assert.equal(serializeRoundState(restored), serialized);
});

test("schema v1 saves migrate to schema v2", () => {
  const current = createInitialRound(999, 1000);
  const legacy = JSON.parse(JSON.stringify(current));
  legacy.schemaVersion = 1;
  for (const p of legacy.players) {
    delete p.ippatsuEligible;
    delete p.temporaryFuriten;
    delete p.riichiFuriten;
    delete p.postCallForbiddenTypes;
  }
  delete legacy.wall.rinshanDrawCount;
  delete legacy.wall.revealedDoraCount;
  delete legacy.pendingKanDoraReveal;
  delete legacy.callsMade;

  const restored = restoreRoundState(JSON.stringify(legacy));
  assert.equal(restored.schemaVersion, 3);
  assert.equal(restored.wall.rinshanDrawCount, 0);
  assert.equal(restored.wall.revealedDoraCount, 1);
  assert.equal(restored.players[0].temporaryFuriten, false);
});

test("schema v2 saves migrate to schema v3 and add double-riichi state", () => {
  const current = createInitialRound(1001, 1000);
  const legacy = JSON.parse(JSON.stringify(current));
  legacy.schemaVersion = 2;
  for (const p of legacy.players) delete p.doubleRiichi;
  const restored = restoreRoundState(JSON.stringify(legacy));
  assert.equal(restored.schemaVersion, 3);
  assert.equal(restored.players[0].doubleRiichi, false);
});
