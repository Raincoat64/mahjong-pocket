import { LegalAction, PlayerId } from "../core/types";
import {CpuDifficulty} from '../ai/profiles';
import { MatchSaveRepository, SerialSaveQueue } from "../persistence/repository";
import { WinValidator } from "../rules/action-rules";
import { GameController, ControllerStop } from "./controller";
import { MatchMode, MatchState, WinSettlementProvider, createMatch } from "./match";
import {parseSession} from '../persistence/validate-session';

interface SessionEnvelope {
  schemaVersion: 1;
  humanId: PlayerId;
  paused: boolean;
  difficulty?: CpuDifficulty;
  match: MatchState;
}

export interface SessionDependencies {
  repository: MatchSaveRepository;
  winValidator?: WinValidator;
  settlementProvider?: WinSettlementProvider;
}

export class MahjongSession {
  readonly controller: GameController;
  private readonly queue: SerialSaveQueue;

  constructor(
    match: MatchState,
    public readonly humanId: PlayerId,
    private readonly dependencies: SessionDependencies,
    paused = false,
    public readonly difficulty: CpuDifficulty = 'normal'
  ) {
    this.queue = new SerialSaveQueue(dependencies.repository);
    this.controller = new GameController(match, {
      humanId,
      difficulty,
      winValidator: dependencies.winValidator,
      settlementProvider: dependencies.settlementProvider
    });
    this.controller.paused = paused;
  }

  get match(): MatchState { return this.controller.match; }

  static createNew(
    seed: number,
    dependencies: SessionDependencies,
    options: { humanId?: PlayerId; mode?: MatchMode; now?: number; difficulty?: CpuDifficulty } = {}
  ): MahjongSession {
    const humanId = options.humanId ?? 0;
    return new MahjongSession(
      createMatch({ seed, mode: options.mode ?? "EAST_ONLY", now: options.now }),
      humanId,
      dependencies,
      false,
      options.difficulty ?? 'normal'
    );
  }

  static async restore(dependencies: SessionDependencies): Promise<MahjongSession | null> {
    const serialized = await dependencies.repository.load();
    if (!serialized) return null;
    const envelope = parseSession(serialized);
    return new MahjongSession(envelope.match, envelope.humanId, dependencies, envelope.paused, envelope.difficulty ?? 'normal');
  }

  serialize(): string {
    const envelope: SessionEnvelope = {
      schemaVersion: 1,
      humanId: this.humanId,
      paused: this.controller.paused,
      difficulty: this.difficulty,
      match: this.match
    };
    return JSON.stringify(envelope);
  }

  private autosave(): Promise<void> { return this.queue.enqueue(this.serialize()); }

  /** Persist each animation checkpoint before the UI schedules another step. */
  async advanceOneStep(now = Date.now()): Promise<ControllerStop | null> {
    const stop = this.controller.advanceOneStep(now);
    if (!stop) await this.autosave();
    return stop;
  }

  async applyHumanAction(action: LegalAction, now = Date.now()): Promise<void> {
    this.controller.applyHumanAction(action, now);
    await this.autosave();
  }

  /** Resume without consuming CPU turns before they can be rendered. */
  async resumeWithoutAdvancing(): Promise<void> {
    this.controller.resume();
    await this.autosave();
  }

  async advance(now = Date.now()): Promise<ControllerStop> {
    const stop = this.controller.advanceUntilHumanDecision(now);
    await this.autosave();
    return stop;
  }

  async act(action: LegalAction, now = Date.now()): Promise<ControllerStop> {
    this.controller.applyHumanAction(action, now);
    const stop = this.controller.advanceUntilHumanDecision(now + 1);
    await this.autosave();
    return stop;
  }

  async continueAfterRound(now = Date.now()): Promise<ControllerStop> {
    this.controller.continueAfterRound(now);
    const stop = this.controller.advanceUntilHumanDecision(now + 1);
    await this.autosave();
    return stop;
  }

  async pause(): Promise<void> {
    this.controller.pause();
    await this.autosave();
  }

  async resume(now = Date.now()): Promise<ControllerStop> {
    this.controller.resume();
    const stop = this.controller.advanceUntilHumanDecision(now);
    await this.autosave();
    return stop;
  }

  async saveNow(): Promise<void> { await this.autosave(); }
  async flush(): Promise<void> { await this.queue.flush(); }
  async clearSave(): Promise<void> {
    await this.queue.flush();
    await this.dependencies.repository.clear();
  }
}
