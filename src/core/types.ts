import { RandomState } from "./random";
import { TileCode, TileType } from "./tile";
import { WallState } from "./wall";

export type PlayerId = 0 | 1 | 2 | 3;
export type Wind = "E" | "S" | "W" | "N";

export type GamePhase =
  | "SETUP"
  | "WAIT_DISCARD"
  | "DRAW"
  | "WAIT_CALL"
  | "WAIT_KAN_RON"
  | "WIN_RESOLUTION"
  | "DRAW_RESOLUTION"
  | "ROUND_RESULT";

export interface Discard {
  tile: TileCode;
  tsumogiri: boolean;
  riichi: boolean;
  calledBy?: PlayerId;
  /**
   * Monotonic discard sequence inside a round.
   * Added additively in v0.4 so older schema-v3 saves remain readable.
   */
  sequence?: number;
}

export interface Meld {
  type: "chi" | "pon" | "daiminkan" | "ankan" | "kakan";
  tiles: TileCode[];
  calledFrom?: PlayerId;
  calledTile?: TileCode;
}

export interface PlayerState {
  id: PlayerId;
  wind: Wind;
  score: number;
  hand: TileCode[];
  river: Discard[];
  melds: Meld[];
  riichi: boolean;
  doubleRiichi: boolean;
  riichiTurn?: number;
  ippatsuEligible: boolean;
  temporaryFuriten: boolean;
  riichiFuriten: boolean;
  postCallForbiddenTypes: TileType[];
}

export type CallAction =
  | { type: "PASS" }
  | { type: "RON"; tile: TileCode }
  | { type: "CHI"; calledTile: TileCode; consumeIndexes: number[]; tiles: TileCode[] }
  | { type: "PON"; calledTile: TileCode; consumeIndexes: number[]; tiles: TileCode[] }
  | { type: "DAIMINKAN"; calledTile: TileCode; consumeIndexes: number[]; tiles: TileCode[] };

export interface PendingDiscard {
  discarder: PlayerId;
  tile: TileCode;
  riverIndex: number;
  riichiDeclaration: boolean;
  drawSource?: "WALL" | "RINSHAN" | "CALL";
  responses: Partial<Record<PlayerId, CallAction>>;
}

export type KanRonAction = { type: "PASS" } | { type: "RON"; tile: TileCode };

export interface PendingKan {
  playerId: PlayerId;
  meldIndex: number;
  tileIndex: number;
  tile: TileCode;
  responses: Partial<Record<PlayerId, KanRonAction>>;
}

export interface WinResult {
  type: "TSUMO" | "RON";
  winners: PlayerId[];
  loser?: PlayerId;
  winningTile: TileCode;
  context?: "DISCARD" | "CHANKAN" | "RINSHAN";
  discardDrawSource?: "WALL" | "RINSHAN" | "CALL";
  pointChanges?: number[];
}

export type DrawReason =
  | "EXHAUSTIVE"
  | "NAGASHI_MANGAN"
  | "KYUUSHU_KYUUHAI"
  | "FOUR_WINDS"
  | "FOUR_RIICHI"
  | "FOUR_KANS"
  | "TRIPLE_RON";

export interface DrawResult {
  reason: DrawReason;
  nagashiPlayers?: PlayerId[];
  tenpaiPlayers?: PlayerId[];
  pointChanges?: number[];
}

export interface RoundState {
  schemaVersion: 3;
  gameId: string;
  seed: number;
  phase: GamePhase;
  roundWind: Wind;
  handNumber: 1 | 2 | 3 | 4;
  honba: number;
  riichiSticks: number;
  dealer: PlayerId;
  currentPlayer: PlayerId;
  players: PlayerState[];
  wall: WallState;
  lastDrawnTile?: TileCode;
  lastDrawSource?: "WALL" | "RINSHAN";
  pendingDiscard?: PendingDiscard;
  pendingKan?: PendingKan;
  pendingKanDoraReveal: boolean;
  callsMade: number;
  /** Monotonic sequence used to reconstruct cross-player discard order. */
  discardSerial?: number;
  winResult?: WinResult;
  drawResult?: DrawResult;
  rng: RandomState;
  createdAt: number;
  updatedAt: number;
}

export type LegalAction =
  | { type: "DISCARD"; tileIndex: number; tile: TileCode }
  | { type: "DRAW" }
  | { type: "TSUMO"; tile: TileCode }
  | { type: "RIICHI"; tileIndex: number; tile: TileCode; waits: TileType[] }
  | { type: "ANKAN"; tileType: TileType; consumeIndexes: number[] }
  | { type: "KAKAN"; meldIndex: number; tileIndex: number; tile: TileCode }
  | { type: "KYUUSHU_KYUUHAI" }
  | CallAction;
