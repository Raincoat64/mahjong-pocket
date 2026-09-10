const {
  createInitialRound,
  getLegalActions,
  applyAction
} = require("../dist-test/engine/round.js");
const {
  chooseNormalTurnAction,
  chooseNormalResponseAction
} = require("../dist-test/ai/action-policy.js");
const { remainingLiveTiles } = require("../dist-test/core/wall.js");

const state = createInitialRound(20260830, 1_000_000);
let steps = 0;
const maxSteps = 800;

console.log("=== Mahjong Pocket full-round structural smoke ===");
console.log("seed:", state.seed);
console.log("initial hand sizes:", state.players.map(p => p.hand.length));
console.log("live wall:", remainingLiveTiles(state.wall));

while (!["WIN_RESOLUTION", "DRAW_RESOLUTION"].includes(state.phase) && steps < maxSteps) {
  steps++;

  if (state.phase === "WAIT_DISCARD") {
    const p = state.currentPlayer;
    const action = chooseNormalTurnAction(state, p);
    applyAction(state, p, action, 1_000_000 + steps);
    continue;
  }

  if (state.phase === "DRAW") {
    const p = state.currentPlayer;
    const draw = getLegalActions(state, p).find(a => a.type === "DRAW");
    if (!draw) throw new Error("DRAW_ACTION_MISSING");
    applyAction(state, p, draw, 1_000_000 + steps);
    continue;
  }

  if (state.phase === "WAIT_CALL") {
    const discarder = state.pendingDiscard.discarder;
    for (const p of [0,1,2,3]) {
      if (p === discarder || state.phase !== "WAIT_CALL") continue;
      if (state.pendingDiscard.responses[p]) continue;
      const actions = getLegalActions(state, p);
      const response = chooseNormalResponseAction(actions);
      applyAction(state, p, response, 1_000_000 + steps);
    }
    continue;
  }

  if (state.phase === "WAIT_KAN_RON") {
    const actor = state.pendingKan.playerId;
    for (const p of [0,1,2,3]) {
      if (p === actor || state.phase !== "WAIT_KAN_RON") continue;
      if (state.pendingKan.responses[p]) continue;
      const response = chooseNormalResponseAction(getLegalActions(state, p));
      applyAction(state, p, response, 1_000_000 + steps);
    }
    continue;
  }

  throw new Error(`UNHANDLED_PHASE:${state.phase}`);
}

if (steps >= maxSteps) throw new Error("SMOKE_STEP_LIMIT_EXCEEDED");
console.log("steps:", steps);
console.log("terminal phase:", state.phase);
console.log("win:", state.winResult || null);
console.log("draw:", state.drawResult || null);
console.log("scores:", state.players.map(p => p.score));
console.log("rivers:", state.players.map(p => p.river.length));
console.log("live wall:", remainingLiveTiles(state.wall));
