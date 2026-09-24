import type { Market } from '@exchange/domain';

export class MarketRegistry {
  private readonly markets = new Map<string, Market>();

  register(market: Market): void {
    if (this.markets.has(market.id)) {
      throw new Error(
        `MARKET_ALREADY_REGISTERED:${market.id}`,
      );
    }

    this.markets.set(market.id, market);
  }

  get(marketId: string): Market {
    const market = this.markets.get(marketId);

    if (!market) {
      throw new Error(
        `MARKET_NOT_FOUND:${marketId}`,
      );
    }

    return market;
  }

  has(marketId: string): boolean {
    return this.markets.has(marketId);
  }

  list(): Market[] {
    return [...this.markets.values()];
  }
}