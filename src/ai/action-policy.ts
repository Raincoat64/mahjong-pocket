import { LegalAction, PlayerId, RoundState } from "../core/types";
import { tileType } from "../core/tile";
import { visibleRemainingByType } from "../hint/hint-engine";
import { calculateShanten } from "../hint/shanten";
import { getLegalActions } from "../engine/round";
import { SHAPE_ONLY_WIN_VALIDATOR, WinValidator, forbiddenAfterCall } from "../rules/action-rules";
import { chooseNormalDiscard } from "./normal";

export function chooseNormalTurnAction(
  state: RoundState,
  playerId: PlayerId,
  winValidator: WinValidator = SHAPE_ONLY_WIN_VALIDATOR
): LegalAction {
  const legal = getLegalActions(state, playerId, winValidator);
  const tsumo = legal.find((a) => a.type === "TSUMO");
  if (tsumo) return tsumo;

  const kyuushu = legal.find((a) => a.type === "KYUUSHU_KYUUHAI");
  if (kyuushu) return kyuushu;

  const discardActions = legal.filter((a): a is Extract<LegalAction, { type: "DISCARD" }> => a.type === "DISCARD");
  if (discardActions.length) {
    const player = state.players[playerId];
    const visible = visibleRemainingByType(
      player.hand,
      {
        // A called discard is physically in a meld and must not be counted twice.
        rivers: state.players.map((p) => p.river.filter((d) => d.calledBy == null).map((d) => d.tile)),
        melds: state.players.map((p) => p.melds)
      }
    );
    const decision = chooseNormalDiscard({
      selfHand: player.hand,
      openMelds: player.melds.length,
      visibleRemaining: visible,
      legalDiscardIndexes: discardActions.map((a) => a.tileIndex)
    });

    const riichi = legal.find((a): a is Extract<LegalAction, { type: "RIICHI" }> =>
      a.type === "RIICHI" && a.tileIndex === decision.tileIndex);
    if (riichi) return riichi;
    return discardActions.find((a) => a.tileIndex === decision.tileIndex)!;
  }

  // Kan decisions are intentionally conservative for Normal: only when no ordinary
  // discard path exists (normally this means a very constrained state).
  const ankan = legal.find((a) => a.type === "ANKAN");
  if (ankan) return ankan;
  const kakan = legal.find((a) => a.type === "KAKAN");
  if (kakan) return kakan;
  throw new Error("NO_NORMAL_TURN_ACTION");
}

function bestPostCallShanten(
  state: RoundState,
  playerId: PlayerId,
  action: Extract<LegalAction, { type: "CHI" | "PON" }>
): number {
  const player = state.players[playerId];
  const removed = new Set(action.consumeIndexes);
  const afterCall = player.hand.filter((_, index) => !removed.has(index));
  const forbidden = new Set(forbiddenAfterCall(action).map(tileType));
  let best = Infinity;
  afterCall.forEach((tile, index) => {
    if (forbidden.has(tileType(tile))) return;
    const afterDiscard = afterCall.slice();
    afterDiscard.splice(index, 1);
    best = Math.min(best, calculateShanten(afterDiscard, player.melds.length + 1));
  });
  return best;
}

/**
 * Normal CPU response policy. It always takes ron, and otherwise calls only when
 * chi/pon strictly improves shanten after the mandatory post-call discard.
 * Daiminkan remains conservative (pass) until EV/kan-risk evaluation is added.
 */
export function chooseNormalResponseActionForState(
  state: RoundState,
  playerId: PlayerId,
  actions: readonly LegalAction[]
): LegalAction {
  const ron = actions.find((a) => a.type === "RON");
  if (ron) return ron;

  const player = state.players[playerId];
  const current = calculateShanten(player.hand, player.melds.length);
  const callCandidates = actions
    .filter((a): a is Extract<LegalAction, { type: "CHI" | "PON" }> => a.type === "CHI" || a.type === "PON")
    .map((action) => ({ action, shanten: bestPostCallShanten(state, playerId, action) }))
    .filter((x) => Number.isFinite(x.shanten) && x.shanten < current)
    .sort((a, b) => a.shanten - b.shanten || (a.action.type === "PON" ? -1 : 1));
  if (callCandidates.length) return callCandidates[0].action;

  const pass = actions.find((a) => a.type === "PASS");
  if (pass) return pass;
  throw new Error("NO_NORMAL_RESPONSE_ACTION");
}

/** Backward-compatible response policy used by older tests/smoke scripts. */
export function chooseNormalResponseAction(actions: readonly LegalAction[]): LegalAction {
  const ron = actions.find((a) => a.type === "RON");
  if (ron) return ron;
  const pass = actions.find((a) => a.type === "PASS");
  if (pass) return pass;
  throw new Error("NO_NORMAL_RESPONSE_ACTION");
}
