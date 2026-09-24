export type MarketStatus =
    | 'ACTIVE'
    | 'HALTED';

export type MarketDefinition = {
    id: string;
    baseAsset: string;
    quoteAsset: string;
    status: MarketStatus;
};

const markets: MarketDefinition[] = [
    {
        id: 'TATA_INR',

        baseAsset: 'TATA',

        quoteAsset: 'INR',

        status: 'ACTIVE',
    },
];

export function getMarkets():
    MarketDefinition[] {
    return markets.map(
        (market) => ({
            ...market,
        }),
    );
}

export function getMarket(
    marketId: string,
):
    MarketDefinition | undefined {
    return markets.find(
        (market) =>
            market.id === marketId,
    );
}