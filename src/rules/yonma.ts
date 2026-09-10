export interface YonmaRuleConfig {
  startingPoints: number;
  returnPoints: number;
  eastOnlyNoExtension: boolean;
  redFives: { man: number; pin: number; sou: number };
  kuitan: boolean;
  atozuke: boolean;
  noKuikae: boolean;
  ippatsu: boolean;
  uraDora: boolean;
  kanDora: boolean;
  kanUra: boolean;
  kiriageMangan: boolean;
  kazoeYakuman: boolean;
  doubleYakuman: boolean;
  yakumanStacking: boolean;
  doubleRon: boolean;
  tripleRonAbortive: boolean;
  tobiEndsMatch: boolean;
  zeroScoreEndsMatch: boolean;
  exhaustiveDrawNotenPenalty: number;
  nagashiMangan: boolean;
  abortiveDraws: {
    kyuushuKyuuhai: boolean;
    fourWinds: boolean;
    fourRiichi: boolean;
    fourKans: boolean;
  };
  riichi: {
    minimumScore: number;
    minimumLiveTiles: number;
    furitenAllowed: boolean;
    ankanWaitMustNotChange: boolean;
    okuriKanAllowed: boolean;
  };
  chankan: {
    kakan: boolean;
    kokushiOnAnkan: boolean;
  };
  pao: {
    daisangen: boolean;
    daisuushii: boolean;
    suukantsu: boolean;
  };
}

/**
 * Frozen Version 1 rule profile. Tenhou is the reference point, but these
 * project values are authoritative and do not change automatically with
 * future Tenhou rule updates.
 */
export const VERSION_1_YONMA_RULES: Readonly<YonmaRuleConfig> = {
  startingPoints: 25000,
  returnPoints: 30000,
  eastOnlyNoExtension: true,
  redFives: { man: 1, pin: 1, sou: 1 },
  kuitan: true,
  atozuke: true,
  noKuikae: true,
  ippatsu: true,
  uraDora: true,
  kanDora: true,
  kanUra: true,
  kiriageMangan: false,
  kazoeYakuman: true,
  doubleYakuman: false,
  yakumanStacking: true,
  doubleRon: true,
  tripleRonAbortive: true,
  tobiEndsMatch: true,
  zeroScoreEndsMatch: false,
  exhaustiveDrawNotenPenalty: 3000,
  nagashiMangan: true,
  abortiveDraws: {
    kyuushuKyuuhai: true,
    fourWinds: true,
    fourRiichi: true,
    fourKans: true
  },
  riichi: {
    minimumScore: 1000,
    minimumLiveTiles: 4,
    furitenAllowed: true,
    ankanWaitMustNotChange: true,
    okuriKanAllowed: false
  },
  chankan: {
    kakan: true,
    kokushiOnAnkan: false
  },
  pao: {
    daisangen: true,
    daisuushii: true,
    suukantsu: false
  }
};
