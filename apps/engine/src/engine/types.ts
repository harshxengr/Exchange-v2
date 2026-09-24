import type { Fill } from '@exchange/domain';

export interface MatchResult {
  fills: Fill[];
  executedQuantity: bigint;
  remainingQuantity: bigint;
  restsOnBook: boolean;
}

export interface OrderBookLevel {
  price: bigint;
  quantity: bigint;
}

export interface BookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}