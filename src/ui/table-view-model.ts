import { LegalAction, Meld, PlayerId, RoundState } from "../core/types";
import { TileCode, TileType } from "../core/tile";
import { getDoraIndicators, remainingLiveTiles } from "../core/wall";
import { buildHintSnapshot, visibleRemainingByType } from "../hint/hint-engine";
import { MatchState } from "../engine/match";
import { getLegalActions } from "../engine/round";
import { SHAPE_ONLY_WIN_VALIDATOR, WinValidator } from "../rules/action-rules";

export type TableSeat = "self" | "right" | "top" | "left";

export interface TableDiscardView {
  tile: TileCode;
  tsumogiri: boolean;
  riichi: boolean;
  /** 1-based discard number for this player. */
  turnNumber: number;
  /** Cross-player chronological sequence when available. */
  sequence?: number;
  latest: boolean;
}

export interface TablePlayerView {
  playerId: PlayerId;
  seat: TableSeat;
  wind: string;
  score: number;
  hand: Array<TileCode | "back">;
  river: TableDiscardView[];
  melds: Meld[];
  riichi: boolean;
}

export interface RecentDiscardView {
  playerId: PlayerId;
  seat: TableSeat;
  turnNumber: number;
  tile: TileCode;
  riichi: boolean;
  sequence: number;
  calledBy?: PlayerId;
  calledBySeat?: TableSeat;
}

export interface CallPromptView {
  sourcePlayerId: PlayerId;
  sourceSeat: TableSeat;
  sourceTurnNumber: number;
  tile: TileCode;
  choices: LegalAction[];
}

export interface TableViewModel {
  roundLabel: string;
  honba: number;
  riichiSticks: number;
  remainingTiles: number;
  doraIndicators: TileCode[];
  currentPlayer: PlayerId;
  phase: string;
  currentTurn: {
    playerId: PlayerId;
    seat: TableSeat;
    turnNumber: number;
  };
  recentDiscards: RecentDiscardView[];
  callPrompt?: CallPromptView;
  players: Record<TableSeat, TablePlayerView>;
  humanActions: {
    all: LegalAction[];
    discards: Extract<LegalAction, { type: "DISCARD" }>[];
    riichi: Extract<LegalAction, { type: "RIICHI" }>[];
    calls: LegalAction[];
    tsumo?: Extract<LegalAction, { type: "TSUMO" }>;
    ron?: Extract<LegalAction, { type: "RON" }>;
  };
  hint: ReturnType<typeof buildHintSnapshot> & { visibleRemaining: Map<TileType, number> };
  result?: {
    type: "WIN" | "DRAW" | "MATCH";
    winType?: "TSUMO" | "RON";
    winners?: PlayerId[];
    loser?: PlayerId;
    winningTile?: TileCode;
    pointChanges?: number[];
    drawReason?: string;
    scores?: number[];
    ranks?: number[];
  };
}

function relativeSeat(human: PlayerId, player: PlayerId): TableSeat {
  const d = (player - human + 4) % 4;
  return (["self", "right", "top", "left"] as const)[d];
}

function resultVisible(match: MatchState): boolean {
  return match.phase === "ROUND_RESULT" || match.phase === "MATCH_RESULT"
    || match.round.phase === "WIN_RESOLUTION" || match.round.phase === "DRAW_RESOLUTION" || match.round.phase === "ROUND_RESULT";
}

function buildPlayerView(
  round: RoundState,
  humanId: PlayerId,
  playerId: PlayerId,
  revealOpponents: boolean,
  latestSequence?: number
): TablePlayerView {
  const p = round.players[playerId];
  const seat = relativeSeat(humanId, playerId);
  return {
    playerId,
    seat,
    wind: p.wind,
    score: p.score,
    hand: playerId === humanId || revealOpponents ? p.hand.slice() : p.hand.map(() => "back" as const),
    // Called tiles physically leave the river; retain them only in the engine history.
    river: p.river
      .map((d, index) => ({ d, turnNumber: index + 1 }))
      .filter(({ d }) => d.calledBy == null)
      .map(({ d, turnNumber }) => ({
        tile: d.tile,
        tsumogiri: d.tsumogiri,
        riichi: d.riichi,
        turnNumber,
        sequence: d.sequence,
        latest: d.sequence != null && d.sequence === latestSequence
      })),
    melds: p.melds.map((m) => ({ ...m, tiles: m.tiles.slice() })),
    riichi: p.riichi
  };
}

export function buildTableViewModel(
  match: MatchState,
  humanId: PlayerId = 0,
  winValidator: WinValidator = SHAPE_ONLY_WIN_VALIDATOR
): TableViewModel {
  const round = match.round;
  const reveal = resultVisible(match);

  const recentDiscards: RecentDiscardView[] = [];
  for (const player of round.players) {
    player.river.forEach((discard, index) => {
      if (discard.sequence == null) return;
      recentDiscards.push({
        playerId: player.id,
        seat: relativeSeat(humanId, player.id),
        turnNumber: index + 1,
        tile: discard.tile,
        riichi: discard.riichi,
        sequence: discard.sequence,
        calledBy: discard.calledBy,
        calledBySeat: discard.calledBy == null ? undefined : relativeSeat(humanId, discard.calledBy)
      });
    });
  }
  recentDiscards.sort((a, b) => a.sequence - b.sequence);
  const latestSequence = recentDiscards.at(-1)?.sequence;

  const bySeat = {} as Record<TableSeat, TablePlayerView>;
  for (const id of [0, 1, 2, 3] as PlayerId[]) {
    const view = buildPlayerView(round, humanId, id, reveal, latestSequence);
    bySeat[view.seat] = view;
  }

  const human = round.players[humanId];
  const publicRivers = round.players.map((p) => p.river.filter((d) => d.calledBy == null).map((d) => d.tile));
  const visibleRemaining = visibleRemainingByType(human.hand, {
    rivers: publicRivers,
    melds: round.players.map((p) => p.melds),
    doraIndicators: getDoraIndicators(round.wall)
  });
  const hint = { ...buildHintSnapshot(human.hand, human.melds.length), visibleRemaining };
  const actions = match.phase === "PLAYING" ? getLegalActions(round, humanId, winValidator) : [];

  let result: TableViewModel["result"];
  if (match.phase === "MATCH_RESULT" && match.result) {
    result = { type: "MATCH", scores: match.result.scores.slice(), ranks: match.result.ranks.slice() };
  }
  else if (round.winResult && reveal) {
    result = {
      type: "WIN",
      winType: round.winResult.type,
      winners: round.winResult.winners.slice(),
      loser: round.winResult.loser,
      winningTile: round.winResult.winningTile,
      pointChanges: round.winResult.pointChanges?.slice(),
      scores: round.players.map((p) => p.score)
    };
  }
  else if (round.drawResult && reveal) {
    result = {
      type: "DRAW",
      drawReason: round.drawResult.reason,
      winners: round.drawResult.nagashiPlayers?.slice(),
      pointChanges: round.drawResult.pointChanges?.slice(),
      scores: round.players.map((p) => p.score)
    };
  }

  const currentTurn = {
    playerId: round.currentPlayer,
    seat: relativeSeat(humanId, round.currentPlayer),
    turnNumber: round.players[round.currentPlayer].river.length + 1
  };

  let callPrompt: CallPromptView | undefined;
  if (
    match.phase === "PLAYING"
    && round.phase === "WAIT_CALL"
    && round.pendingDiscard
    && round.pendingDiscard.discarder !== humanId
  ) {
    const choices = actions.filter((a) => ["RON", "CHI", "PON", "DAIMINKAN", "PASS"].includes(a.type));
    if (choices.some((a) => a.type !== "PASS")) {
      callPrompt = {
        sourcePlayerId: round.pendingDiscard.discarder,
        sourceSeat: relativeSeat(humanId, round.pendingDiscard.discarder),
        sourceTurnNumber: round.pendingDiscard.riverIndex + 1,
        tile: round.pendingDiscard.tile,
        choices
      };
    }
  }

  return {
    roundLabel: `東${round.handNumber}局`,
    honba: round.honba,
    riichiSticks: round.riichiSticks,
    remainingTiles: remainingLiveTiles(round.wall),
    doraIndicators: getDoraIndicators(round.wall),
    currentPlayer: round.currentPlayer,
    phase: match.phase === "PLAYING" ? round.phase : match.phase,
    currentTurn,
    recentDiscards: recentDiscards.slice(-4),
    callPrompt,
    players: bySeat,
    humanActions: {
      all: actions,
      discards: actions.filter((a): a is Extract<LegalAction, { type: "DISCARD" }> => a.type === "DISCARD"),
      riichi: actions.filter((a): a is Extract<LegalAction, { type: "RIICHI" }> => a.type === "RIICHI"),
      calls: actions.filter((a) => ["CHI", "PON", "DAIMINKAN", "ANKAN", "KAKAN", "PASS"].includes(a.type)),
      tsumo: actions.find((a): a is Extract<LegalAction, { type: "TSUMO" }> => a.type === "TSUMO"),
      ron: actions.find((a): a is Extract<LegalAction, { type: "RON" }> => a.type === "RON")
    },
    hint,
    result
  };
}
