import { PlayerId, RoundState } from "../core/types";
import { createRound } from "./round";

export type MatchMode = "ONE_HAND" | "EAST_ONLY";
export type MatchPhase = "PLAYING" | "ROUND_RESULT" | "MATCH_RESULT";
export type NextRoundDisposition = "REPEAT" | "ADVANCE" | "MATCH_END";

export interface WinSettlement {
  pointChanges: [number, number, number, number];
  details?: unknown;
}

export interface WinSettlementProvider {
  settleWin(round: RoundState): WinSettlement;
}

export interface RoundHistoryEntry {
  roundWind: "E";
  handNumber: 1 | 2 | 3 | 4;
  honba: number;
  dealer: PlayerId;
  resultType: "WIN" | "DRAW";
  resultReason?: string;
  winners?: PlayerId[];
  loser?: PlayerId;
  pointChanges: [number, number, number, number];
  scoresAfter: [number, number, number, number];
  disposition: NextRoundDisposition;
}

export interface MatchResult {
  scores: [number, number, number, number];
  ranks: [number, number, number, number];
  ranking: PlayerId[];
}

export interface MatchState {
  schemaVersion: 1;
  matchId: string;
  mode: MatchMode;
  phase: MatchPhase;
  baseSeed: number;
  roundSerial: number;
  initialDealer: PlayerId;
  scores: [number, number, number, number];
  round: RoundState;
  pendingNext?: NextRoundDisposition;
  history: RoundHistoryEntry[];
  result?: MatchResult;
  createdAt: number;
  updatedAt: number;
}

const PLAYER_IDS: readonly PlayerId[] = [0, 1, 2, 3];

function asScores(values: readonly number[]): [number, number, number, number] {
  if (values.length !== 4) throw new Error("FOUR_SCORES_REQUIRED");
  return [values[0], values[1], values[2], values[3]];
}

function seedFor(baseSeed: number, roundSerial: number): number {
  // Stable 32-bit Weyl progression: deterministic, cheap, and independent per round.
  return (baseSeed + Math.imul(roundSerial, 0x9e3779b9)) >>> 0;
}

function rankOrder(scores: readonly number[], initialDealer: PlayerId): PlayerId[] {
  return [...PLAYER_IDS].sort((a, b) => {
    const byScore = scores[b] - scores[a];
    if (byScore) return byScore;
    const seatA = (a - initialDealer + 4) % 4;
    const seatB = (b - initialDealer + 4) % 4;
    return seatA - seatB;
  });
}

function isTop(scores: readonly number[], player: PlayerId, initialDealer: PlayerId): boolean {
  return rankOrder(scores, initialDealer)[0] === player;
}

export interface CreateMatchOptions {
  seed: number;
  mode?: MatchMode;
  now?: number;
  initialDealer?: PlayerId;
  scores?: readonly number[];
}

export function createMatch(options: CreateMatchOptions): MatchState {
  const now = options.now ?? Date.now();
  const mode = options.mode ?? "EAST_ONLY";
  const initialDealer = options.initialDealer ?? 0;
  const scores = asScores(options.scores ?? [25000, 25000, 25000, 25000]);
  const round = createRound({
    seed: seedFor(options.seed, 0),
    now,
    scores,
    dealer: initialDealer,
    roundWind: "E",
    handNumber: 1,
    honba: 0,
    riichiSticks: 0,
    gameId: `match-${options.seed}-${now}-round-0`
  });
  return {
    schemaVersion: 1,
    matchId: `match-${options.seed}-${now}`,
    mode,
    phase: "PLAYING",
    baseSeed: options.seed >>> 0,
    roundSerial: 0,
    initialDealer,
    scores,
    round,
    history: [],
    createdAt: now,
    updatedAt: now
  };
}

function determineDisposition(match: MatchState, round: RoundState): NextRoundDisposition {
  if (match.mode === "ONE_HAND") return "MATCH_END";
  if (round.players.some((p) => p.score < 0)) return "MATCH_END";

  const isEastFour = round.handNumber === 4;
  let dealerContinues = false;

  if (round.winResult) {
    dealerContinues = round.winResult.winners.includes(round.dealer);
    if (isEastFour) {
      if (!dealerContinues) return "MATCH_END";
      // Project rule: agari-yame if the dealer is first after winning.
      return isTop(match.scores, round.dealer, match.initialDealer) ? "MATCH_END" : "REPEAT";
    }
    return dealerContinues ? "REPEAT" : "ADVANCE";
  }

  const draw = round.drawResult;
  if (!draw) throw new Error("ROUND_RESULT_MISSING");
  if (draw.reason === "EXHAUSTIVE" || draw.reason === "NAGASHI_MANGAN") {
    dealerContinues = !!draw.tenpaiPlayers?.includes(round.dealer);
    if (isEastFour) {
      if (!dealerContinues) return "MATCH_END";
      // Project rule: tenpai-yame if the dealer is first.
      return isTop(match.scores, round.dealer, match.initialDealer) ? "MATCH_END" : "REPEAT";
    }
    return dealerContinues ? "REPEAT" : "ADVANCE";
  }

  // Abortive draws all continue with dealer according to the accepted rule draft.
  return "REPEAT";
}

function roundPointChanges(round: RoundState): [number, number, number, number] {
  if (round.winResult?.pointChanges) return asScores(round.winResult.pointChanges);
  if (round.drawResult?.pointChanges) return asScores(round.drawResult.pointChanges);
  return [0, 0, 0, 0];
}

/**
 * Settle the current round but deliberately keep the finished RoundState alive.
 * The UI can therefore reveal CPU hands and render the win/draw result before
 * continueMatch() creates the next round.
 */
export function settleCurrentRound(
  match: MatchState,
  scorer?: WinSettlementProvider,
  now = Date.now()
): RoundHistoryEntry {
  if (match.phase !== "PLAYING") throw new Error("MATCH_NOT_PLAYING");
  const round = match.round;
  if (round.phase !== "WIN_RESOLUTION" && round.phase !== "DRAW_RESOLUTION") {
    throw new Error("ROUND_NOT_RESOLVED");
  }

  if (round.winResult && !round.winResult.pointChanges) {
    if (!scorer) throw new Error("WIN_SETTLEMENT_PROVIDER_REQUIRED");
    const settlement = scorer.settleWin(round);
    round.winResult.pointChanges = settlement.pointChanges.slice();
    for (const id of PLAYER_IDS) round.players[id].score += settlement.pointChanges[id];
    // Any completed win consumes the riichi deposits; allocation is part of the scorer.
    round.riichiSticks = 0;
  }

  match.scores = asScores(round.players.map((p) => p.score));
  const disposition = determineDisposition(match, round);
  const changes = roundPointChanges(round);
  const entry: RoundHistoryEntry = {
    roundWind: "E",
    handNumber: round.handNumber,
    honba: round.honba,
    dealer: round.dealer,
    resultType: round.winResult ? "WIN" : "DRAW",
    resultReason: round.drawResult?.reason,
    winners: round.winResult?.winners?.slice(),
    loser: round.winResult?.loser,
    pointChanges: changes,
    scoresAfter: asScores(match.scores),
    disposition
  };
  match.history.push(entry);
  match.pendingNext = disposition;
  match.phase = "ROUND_RESULT";
  round.phase = "ROUND_RESULT";
  round.updatedAt = now;
  match.updatedAt = now;
  return entry;
}

function finishMatch(match: MatchState, now: number): void {
  // Unclaimed riichi deposits at game end go to first place.
  if (match.round.riichiSticks > 0) {
    const first = rankOrder(match.scores, match.initialDealer)[0];
    const award = match.round.riichiSticks * 1000;
    match.scores[first] += award;
    match.round.players[first].score += award;
    match.round.riichiSticks = 0;
  }
  const ranking = rankOrder(match.scores, match.initialDealer);
  const ranks = [0, 0, 0, 0] as [number, number, number, number];
  ranking.forEach((id, index) => { ranks[id] = index + 1; });
  match.result = { scores: asScores(match.scores), ranks, ranking };
  match.pendingNext = undefined;
  match.phase = "MATCH_RESULT";
  match.updatedAt = now;
}

export function continueMatch(match: MatchState, now = Date.now()): void {
  if (match.phase !== "ROUND_RESULT" || !match.pendingNext) throw new Error("NO_ROUND_RESULT_TO_CONTINUE");
  const disposition = match.pendingNext;
  if (disposition === "MATCH_END") {
    finishMatch(match, now);
    return;
  }

  const prior = match.round;
  const dealer = disposition === "REPEAT" ? prior.dealer : ((prior.dealer + 1) % 4) as PlayerId;
  const handNumber = disposition === "REPEAT"
    ? prior.handNumber
    : ((prior.handNumber + 1) as 1 | 2 | 3 | 4);
  const honba = prior.drawResult
    ? prior.honba + 1
    : disposition === "REPEAT" ? prior.honba + 1 : 0;
  const riichiSticks = prior.riichiSticks;

  match.roundSerial++;
  match.round = createRound({
    seed: seedFor(match.baseSeed, match.roundSerial),
    now,
    scores: match.scores,
    dealer,
    roundWind: "E",
    handNumber,
    honba,
    riichiSticks,
    gameId: `${match.matchId}-round-${match.roundSerial}`
  });
  match.pendingNext = undefined;
  match.phase = "PLAYING";
  match.updatedAt = now;
}

export function serializeMatchState(match: MatchState): string {
  return JSON.stringify(match);
}

export function restoreMatchState(serialized: string): MatchState {
  const parsed = JSON.parse(serialized) as MatchState;
  if (parsed.schemaVersion !== 1) throw new Error("UNSUPPORTED_MATCH_SCHEMA_VERSION");
  return parsed;
}
