import { createMatch, continueMatch, settleCurrentRound } from "../engine/match";
import { GameController } from "../engine/controller";
import { MahjongSession } from "../engine/session";
import { getLegalActions, applyAction } from "../engine/round";
import { buildTableViewModel } from "../ui/table-view-model";
import { IndexedDbMatchSaveRepository, MemoryMatchSaveRepository } from "../persistence/repository";
import { MajiangCoreCalculator } from "../adapter/majiang-core";

export function createMajiangCoreCalculator(): MajiangCoreCalculator {
  return MajiangCoreCalculator.fromVendoredRuntime();
}

const api = {
  createMatch,
  continueMatch,
  settleCurrentRound,
  GameController,
  MahjongSession,
  getLegalActions,
  applyAction,
  buildTableViewModel,
  IndexedDbMatchSaveRepository,
  MemoryMatchSaveRepository,
  createMajiangCoreCalculator
};

(globalThis as any).MahjongPocketEngine = api;
export default api;
