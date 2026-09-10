const { MajiangCoreCalculator } = require('../dist-test/adapter/majiang-core.js');
const { createInitialRound, getLegalActions, applyAction } = require("../dist-test/engine/round.js");
const { chooseNormalTurnAction, chooseNormalResponseActionForState } = require("../dist-test/ai/action-policy.js");

function run(seed) {
  const state = createInitialRound(seed, seed);
  const scorer = MajiangCoreCalculator.fromVendoredRuntime();
  let steps = 0;
  while (!["WIN_RESOLUTION", "DRAW_RESOLUTION"].includes(state.phase) && steps < 900) {
    steps++;
    if (state.phase === "WAIT_DISCARD") {
      const p = state.currentPlayer;
      applyAction(state, p, chooseNormalTurnAction(state, p, scorer), seed + steps, scorer);
    }
    else if (state.phase === "DRAW") {
      const p = state.currentPlayer;
      const action = getLegalActions(state, p, scorer).find(a => a.type === "DRAW");
      if (!action) throw new Error(`DRAW_ACTION_MISSING seed=${seed}`);
      applyAction(state, p, action, seed + steps, scorer);
    }
    else if (state.phase === "WAIT_CALL") {
      const discarder = state.pendingDiscard.discarder;
      for (const p of [0,1,2,3]) {
        if (state.phase !== "WAIT_CALL" || p === discarder || state.pendingDiscard.responses[p]) continue;
        applyAction(state, p, chooseNormalResponseActionForState(state, p, getLegalActions(state, p, scorer)), seed + steps, scorer);
      }
    }
    else if (state.phase === "WAIT_KAN_RON") {
      const actor = state.pendingKan.playerId;
      for (const p of [0,1,2,3]) {
        if (state.phase !== "WAIT_KAN_RON" || p === actor || state.pendingKan.responses[p]) continue;
        applyAction(state, p, chooseNormalResponseActionForState(state, p, getLegalActions(state, p, scorer)), seed + steps, scorer);
      }
    }
    else throw new Error(`UNHANDLED_PHASE:${state.phase} seed=${seed}`);
  }
  if (steps >= 900) throw new Error(`STEP_LIMIT seed=${seed}`);
  return { phase: state.phase, steps, win: state.winResult?.type, draw: state.drawResult?.reason };
}

const count = Number(process.argv[2] || 200);
const stats = { rounds: count, wins: 0, draws: 0, maxSteps: 0, reasons: {} };
for (let i = 0; i < count; i++) {
  const result = run(20260830 + i);
  stats.maxSteps = Math.max(stats.maxSteps, result.steps);
  if (result.phase === "WIN_RESOLUTION") stats.wins++;
  else stats.draws++;
  const key = result.win || result.draw || result.phase;
  stats.reasons[key] = (stats.reasons[key] || 0) + 1;
}
console.log(JSON.stringify(stats, null, 2));

