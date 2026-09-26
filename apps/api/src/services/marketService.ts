export type MarketStatus =
    | 'ACTIVE'
    | 'HALTED';

export type MarketDefinition = {
    id: string;
    baseAsset: string;
    quoteAsset: string;
    status: MarketStatus;

    priceScale: number;
    quantityScale: number;
    minQuantity: string;
    tickSize: string;
};

const markets: MarketDefinition[] = [
    {
        id: 'TATA_INR',

        baseAsset: 'TATA',

        quoteAsset: 'INR',

        status: 'ACTIVE',

        priceScale: 2,

        quantityScale: 3,

        minQuantity: '1',

        tickSize: '1',
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
