import { PlayerId, PlayerState, RoundState, Wind } from "../core/types";
import { WinSettlementProvider, WinSettlement } from "../engine/match";
import {
  TileCode,
  TileType,
  majiangCodeToType,
  tileRank,
  tileSuit,
  tileToMajiangCode,
  tileType
} from "../core/tile";
import { getDoraIndicators, getUraDoraIndicators, remainingLiveTiles } from "../core/wall";
import { WinContext, WinValidator } from "../rules/action-rules";

declare const require: (id: string) => any;

export interface MahjongCalculator {
  calculateShanten(hand: readonly TileCode[]): number;
  calculateWaits(hand: readonly TileCode[]): TileType[];
  isAgari(hand: readonly TileCode[]): boolean;
}

export interface MajiangScoreResult {
  hupai: Array<{ name: string; fanshu: number | string; baojia?: number }> | null;
  fu?: number;
  fanshu?: number;
  damanguan?: number;
  defen: number;
  fenpei: number[];
}

interface MajiangModule {
  rule(param?: Record<string, unknown>): Record<string, any>;
  Shoupai: new (tiles?: string[]) => any;
  Game: {
    allow_hule(
      rule: Record<string, any>,
      shoupai: any,
      p: string | null,
      zhuangfeng: number,
      menfeng: number,
      hupai?: boolean,
      neng_rong?: boolean
    ): boolean;
  };
  Util: {
    xiangting(shoupai: any): number;
    tingpai(shoupai: any): string[] | null;
    hule(shoupai: any, rongpai: string | null, param: Record<string, any>): MajiangScoreResult | undefined;
  };
}

const WIND_INDEX: Record<Wind, number> = { E: 0, S: 1, W: 2, N: 3 };

function directionSymbol(fromPlayer: PlayerId, winner: PlayerId): string {
  const symbols = "_+=-";
  return symbols[(4 + fromPlayer - winner) % 4];
}

function tileDigit(tile: TileCode): string {
  return tileToMajiangCode(tile)[1];
}

function meldToMajiangCode(playerId: PlayerId, meld: PlayerState["melds"][number]): string {
  const suit = tileSuit(meld.tiles[0]);
  if (suit === "z") {
    // Honor melds are represented with z and their numeric honor code.
  }
  const prefix = suit === "z" ? "z" : suit;
  const direction = meld.calledFrom == null ? "" : directionSymbol(meld.calledFrom, playerId);

  if (meld.type === "chi") {
    const sorted = meld.tiles.slice().sort((a, b) => tileRank(a) - tileRank(b));
    const calledType = tileType(meld.calledTile ?? sorted[0]);
    let body = "";
    for (const tile of sorted) {
      body += tileDigit(tile);
      if (tileType(tile) === calledType) body += direction || "-";
    }
    return prefix + body;
  }

  if (meld.type === "pon") {
    return prefix + meld.tiles.slice(0, 3).map(tileDigit).join("") + (direction || "-");
  }
  if (meld.type === "daiminkan") {
    return prefix + meld.tiles.slice(0, 4).map(tileDigit).join("") + (direction || "-");
  }
  if (meld.type === "ankan") {
    return prefix + meld.tiles.slice(0, 4).map(tileDigit).join("");
  }
  // Added kan: original pon notation followed by the added fourth tile.
  return prefix
    + meld.tiles.slice(0, 3).map(tileDigit).join("")
    + (direction || "-")
    + tileDigit(meld.tiles[3]);
}

function createProjectRule(core: MajiangModule): Record<string, any> {
  return core.rule({
    "配給原点": 25000,
    "連風牌は2符": false,
    "赤牌": { m: 1, p: 1, s: 1 },
    "クイタンあり": true,
    "喰い替え許可レベル": 0,
    "場数": 1,
    "途中流局あり": true,
    "流し満貫あり": true,
    "ノーテン宣言あり": false,
    "ノーテン罰あり": true,
    "最大同時和了数": 2,
    "連荘方式": 2,
    "トビ終了あり": true,
    "オーラス止めあり": true,
    "延長戦方式": 0,
    "一発あり": true,
    "裏ドラあり": true,
    "カンドラあり": true,
    "カン裏あり": true,
    "カンドラ後乗せ": true,
    "ツモ番なしリーチあり": false,
    "リーチ後暗槓許可レベル": 2,
    "役満の複合あり": true,
    "ダブル役満あり": false,
    "数え役満あり": true,
    "役満パオあり": true,
    "切り上げ満貫あり": false
  });
}

function toCoreShoupai(core: MajiangModule, state: RoundState, playerId: PlayerId, tsumo: boolean): any {
  const player = state.players[playerId];
  const shoupai = new core.Shoupai(player.hand.map(tileToMajiangCode));
  shoupai._fulou = player.melds.map((m) => meldToMajiangCode(playerId, m));
  shoupai._lizhi = player.riichi;
  shoupai._zimo = tsumo && state.lastDrawnTile ? tileToMajiangCode(state.lastDrawnTile) : null;
  return shoupai;
}

/**
 * Thin isolation layer around @kobalab/majiang-core.
 * The rest of Mahjong Pocket must not depend on Majiang.Shoupai directly.
 */
export class MajiangCoreCalculator implements MahjongCalculator, WinValidator, WinSettlementProvider {
  private readonly rule: Record<string, any>;

  constructor(private readonly core: MajiangModule) {
    this.rule = createProjectRule(core);
  }

  static fromInstalledPackage(): MajiangCoreCalculator {
    return new MajiangCoreCalculator(require("@kobalab/majiang-core") as MajiangModule);
  }

  static fromVendoredRuntime(): MajiangCoreCalculator {
    return new MajiangCoreCalculator(require("../../vendor/majiang-core-v1.4.1/lib/index") as MajiangModule);
  }

  calculateShanten(hand: readonly TileCode[]): number {
    const shoupai = new this.core.Shoupai(hand.map(tileToMajiangCode));
    return this.core.Util.xiangting(shoupai);
  }

  calculateWaits(hand: readonly TileCode[]): TileType[] {
    const shoupai = new this.core.Shoupai(hand.map(tileToMajiangCode));
    const waits = this.core.Util.tingpai(shoupai) ?? [];
    return waits.map(majiangCodeToType);
  }

  isAgari(hand: readonly TileCode[]): boolean {
    return this.calculateShanten(hand) === -1;
  }

  private isFirstUninterruptedDraw(state: RoundState, playerId: PlayerId): boolean {
    const player = state.players[playerId];
    return state.callsMade === 0 && player.river.length === 0;
  }

  private heavenlyEarthly(state: RoundState, playerId: PlayerId): 0 | 1 | 2 {
    if (!this.isFirstUninterruptedDraw(state, playerId) || state.lastDrawSource !== "WALL") return 0;
    if (playerId === state.dealer && state.players.every((p) => p.river.length === 0)) return 1;
    if (playerId !== state.dealer) return 2;
    return 0;
  }

  canTsumo(state: RoundState, playerId: PlayerId): boolean {
    const player = state.players[playerId];
    const shoupai = toCoreShoupai(this.core, state, playerId, true);
    const guaranteedYaku = player.riichi
      || state.lastDrawSource === "RINSHAN"
      || (state.lastDrawSource === "WALL" && remainingLiveTiles(state.wall) === 0)
      || this.heavenlyEarthly(state, playerId) !== 0;
    return this.core.Game.allow_hule(
      this.rule,
      shoupai,
      null,
      WIND_INDEX[state.roundWind],
      WIND_INDEX[player.wind],
      guaranteedYaku
    );
  }

  canRon(
    state: RoundState,
    playerId: PlayerId,
    tile: TileCode,
    fromPlayer: PlayerId,
    context: WinContext
  ): boolean {
    const player = state.players[playerId];
    const shoupai = toCoreShoupai(this.core, state, playerId, false);
    const p = tileToMajiangCode(tile) + directionSymbol(fromPlayer, playerId);
    const guaranteedYaku = player.riichi
      || context === "CHANKAN"
      || (context === "DISCARD" && state.pendingDiscard?.drawSource === "WALL" && remainingLiveTiles(state.wall) === 0);
    return this.core.Game.allow_hule(
      this.rule,
      shoupai,
      p,
      WIND_INDEX[state.roundWind],
      WIND_INDEX[player.wind],
      guaranteedYaku,
      true
    );
  }

  calculateScore(
    state: RoundState,
    winnerId: PlayerId,
    jicunOverride?: { changbang: number; lizhibang: number }
  ): MajiangScoreResult {
    const win = state.winResult;
    if (!win || !win.winners.includes(winnerId)) throw new Error("WIN_RESULT_NOT_AVAILABLE");
    const player = state.players[winnerId];
    const isTsumo = win.type === "TSUMO";
    const shoupai = toCoreShoupai(this.core, state, winnerId, isTsumo);
    const rongpai = isTsumo || win.loser == null
      ? null
      : tileToMajiangCode(win.winningTile) + directionSymbol(win.loser, winnerId);

    const haidi = isTsumo
      ? (state.lastDrawSource === "WALL" && remainingLiveTiles(state.wall) === 0 ? 1 : 0)
      : (win.context === "DISCARD" && win.discardDrawSource === "WALL" && remainingLiveTiles(state.wall) === 0 ? 2 : 0);

    const param = {
      rule: this.rule,
      zhuangfeng: WIND_INDEX[state.roundWind],
      menfeng: WIND_INDEX[player.wind],
      hupai: {
        lizhi: player.doubleRiichi ? 2 : player.riichi ? 1 : 0,
        yifa: player.ippatsuEligible,
        qianggang: win.context === "CHANKAN",
        lingshang: win.context === "RINSHAN",
        haidi,
        tianhu: isTsumo ? this.heavenlyEarthly(state, winnerId) : 0
      },
      baopai: getDoraIndicators(state.wall).map(tileToMajiangCode),
      fubaopai: player.riichi ? getUraDoraIndicators(state.wall).map(tileToMajiangCode) : null,
      jicun: jicunOverride ?? {
        changbang: state.honba,
        lizhibang: state.riichiSticks
      }
    };

    const result = this.core.Util.hule(shoupai, rongpai, param);
    if (!result) throw new Error("NO_VALID_SCORE");
    return result;
  }

  settleWin(state: RoundState): WinSettlement {
    const win = state.winResult;
    if (!win) throw new Error("WIN_RESULT_NOT_AVAILABLE");
    const changes: [number, number, number, number] = [0, 0, 0, 0];
    for (let i = 0; i < win.winners.length; i++) {
      const winnerId = win.winners[i];
      const result = this.calculateScore(state, winnerId, {
        changbang: state.honba,
        // Tenhou/project double-ron handling: deposits go only to the
        // nearest/head-bump-priority winner.
        lizhibang: i === 0 ? state.riichiSticks : 0
      });
      for (let seat = 0; seat < 4; seat++) {
        const player = state.players.find((p) => WIND_INDEX[p.wind] === seat);
        if (!player) throw new Error("SEAT_TO_PLAYER_MAPPING_FAILED");
        changes[player.id] += result.fenpei[seat] ?? 0;
      }
    }
    return { pointChanges: changes };
  }
}
