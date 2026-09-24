import type { EngineSnapshot } from '../engine/MatchingEngine.js';

export interface EngineCheckpoint {
  version: 1;

  lastProcessedCommandStreamId: string | null;

  snapshot: EngineSnapshot;

  savedAt: string;
}
