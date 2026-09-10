import { LegalAction, PlayerId } from "../core/types";
import { CpuDifficulty, chooseProfileTurnAction, chooseProfileResponseAction } from "../ai/profiles";
import {
  chooseNormalResponseActionForState,
  chooseNormalTurnAction
} from "../ai/action-policy";
import { SHAPE_ONLY_WIN_VALIDATOR, WinValidator } from "../rules/action-rules";
import { applyAction, getLegalActions } from "./round";
import {
  MatchState,
  WinSettlementProvider,
  continueMatch,
  settleCurrentRound
} from "./match";

export type ControllerStopReason =
  | "HUMAN_ACTION"
  | "ROUND_RESULT"
  | "MATCH_RESULT"
  | "PAUSED";

export interface ControllerStop {
  reason: ControllerStopReason;
  legalActions: LegalAction[];
  steps: number;
}

export interface ControllerOptions {
  difficulty?: CpuDifficulty;
  humanId?: PlayerId;
  winValidator?: WinValidator;
  settlementProvider?: WinSettlementProvider;
  maxAutoSteps?: number;
  onStateChange?: () => void;
}

export class GameController {
  readonly humanId: PlayerId;
  readonly difficulty: CpuDifficulty;
  readonly winValidator: WinValidator;
  readonly settlementProvider?: WinSettlementProvider;
  readonly maxAutoSteps: number;
  private readonly onStateChange?: () => void;
  paused = false;

  constructor(public match: MatchState, options: ControllerOptions = {}) {
    this.humanId = options.humanId ?? 0;
    this.difficulty = options.difficulty ?? 'normal';
    this.winValidator = options.winValidator ?? SHAPE_ONLY_WIN_VALIDATOR;
    this.settlementProvider = options.settlementProvider;
    this.maxAutoSteps = options.maxAutoSteps ?? 2000;
    this.onStateChange = options.onStateChange;
  }

  private changed(): void { this.onStateChange?.(); }

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }

  humanLegalActions(): LegalAction[] {
    if (this.match.phase !== "PLAYING") return [];
    return getLegalActions(this.match.round, this.humanId, this.winValidator);
  }

  applyHumanAction(action: LegalAction, now = Date.now()): void {
    if (this.paused) throw new Error("CONTROLLER_PAUSED");
    if (this.match.phase !== "PLAYING") throw new Error("MATCH_NOT_PLAYING");
    applyAction(this.match.round, this.humanId, action, now, this.winValidator);
    this.match.updatedAt = now;
    this.changed();
  }

  continueAfterRound(now = Date.now()): void {
    if (this.match.phase !== "ROUND_RESULT") throw new Error("NOT_AT_ROUND_RESULT");
    continueMatch(this.match, now);
    this.changed();
  }

  private humanHasDecision(): LegalAction[] | null {
    const round = this.match.round;
    const actions = getLegalActions(round, this.humanId, this.winValidator);
    if (!actions.length) return null;

    if (round.phase === "WAIT_DISCARD" && round.currentPlayer === this.humanId) return actions;
    if (round.phase === "WAIT_CALL" || round.phase === "WAIT_KAN_RON") {
      // PASS-only response windows are not a user decision and are auto-passed.
      return actions.some((a) => a.type !== "PASS") ? actions : null;
    }
    return null;
  }

  /**
   * Perform at most one automatic transition.
   *
   * Returning a ControllerStop means no automatic transition was performed
   * because the human must act, a result must be shown, or the controller is paused.
   * Returning null means exactly one automatic transition was applied.
   *
   * The browser uses this method to animate CPU play one step at a time instead
   * of jumping across three opponents in a single render.
   */
  advanceOneStep(now = Date.now()): ControllerStop | null {
    if (this.paused) return { reason: "PAUSED", legalActions: [], steps: 0 };
    if (this.match.phase === "ROUND_RESULT") return { reason: "ROUND_RESULT", legalActions: [], steps: 0 };
    if (this.match.phase === "MATCH_RESULT") return { reason: "MATCH_RESULT", legalActions: [], steps: 0 };

    const round = this.match.round;
    if (round.phase === "WIN_RESOLUTION" || round.phase === "DRAW_RESOLUTION") {
      settleCurrentRound(this.match, this.settlementProvider, now);
      this.changed();
      return null;
    }
    if (round.phase === "ROUND_RESULT") {
      return { reason: "ROUND_RESULT", legalActions: [], steps: 0 };
    }

    const humanDecision = this.humanHasDecision();
    if (humanDecision) return { reason: "HUMAN_ACTION", legalActions: humanDecision, steps: 0 };

    if (round.phase === "DRAW") {
      const action = getLegalActions(round, round.currentPlayer, this.winValidator)
        .find((a) => a.type === "DRAW");
      if (!action) throw new Error("DRAW_ACTION_MISSING");
      applyAction(round, round.currentPlayer, action, now, this.winValidator);
      this.changed();
      return null;
    }

    if (round.phase === "WAIT_DISCARD") {
      const player = round.currentPlayer;
      if (player === this.humanId) throw new Error("HUMAN_TURN_WITHOUT_LEGAL_ACTION");
      const action = chooseProfileTurnAction(round, player, this.winValidator, this.difficulty);
      applyAction(round, player, action, now, this.winValidator);
      this.changed();
      return null;
    }

    if (round.phase === "WAIT_CALL") {
      const pending = round.pendingDiscard;
      if (!pending) throw new Error("PENDING_DISCARD_MISSING");

      for (const id of [0, 1, 2, 3] as PlayerId[]) {
        if (id === pending.discarder || pending.responses[id]) continue;
        const actions = getLegalActions(round, id, this.winValidator);
        if (id === this.humanId) {
          const pass = actions.find((a) => a.type === "PASS");
          if (!pass) throw new Error("HUMAN_PASS_MISSING");
          applyAction(round, id, pass, now, this.winValidator);
          this.changed();
          return null;
        }
        const chosen = chooseProfileResponseAction(round, id, actions, this.difficulty);
        applyAction(round, id, chosen, now, this.winValidator);
        this.changed();
        return null;
      }
      throw new Error("CALL_WINDOW_STALLED");
    }

    if (round.phase === "WAIT_KAN_RON") {
      const pending = round.pendingKan;
      if (!pending) throw new Error("PENDING_KAN_MISSING");

      for (const id of [0, 1, 2, 3] as PlayerId[]) {
        if (id === pending.playerId || pending.responses[id]) continue;
        const actions = getLegalActions(round, id, this.winValidator);
        if (id === this.humanId) {
          const pass = actions.find((a) => a.type === "PASS");
          if (!pass) throw new Error("HUMAN_PASS_MISSING");
          applyAction(round, id, pass, now, this.winValidator);
          this.changed();
          return null;
        }
        const chosen = chooseProfileResponseAction(round, id, actions, this.difficulty);
        applyAction(round, id, chosen, now, this.winValidator);
        this.changed();
        return null;
      }
      throw new Error("KAN_RON_WINDOW_STALLED");
    }

    throw new Error(`UNHANDLED_CONTROLLER_PHASE:${round.phase}`);
  }

  /**
   * Advance deterministic/non-human transitions until the user actually has to
   * choose something, a result screen must be shown, or the match ends.
   */
  advanceUntilHumanDecision(now = Date.now()): ControllerStop {
    let steps = 0;
    for (;;) {
      if (++steps > this.maxAutoSteps) throw new Error("CONTROLLER_STEP_LIMIT");
      const stop = this.advanceOneStep(now + steps);
      if (stop) return { ...stop, steps: steps - 1 };
    }
  }
}

