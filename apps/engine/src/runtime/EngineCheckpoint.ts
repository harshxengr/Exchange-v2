import type { EngineSnapshot } from '../engine/MatchingEngine.js';

export interface EngineCheckpoint {
  version: 2;

  lastProcessedCommandStreamId: string | null;

  snapshot: EngineSnapshot;

  savedAt: string;
}
