import { prisma } from '@exchange/db';

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

let markets: MarketDefinition[] = [
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

export async function loadMarkets(): Promise<void> {
    const rows =
        await prisma.market.findMany({
            where: {
                active: true,
            },
            orderBy: {
                id: 'asc',
            },
        });

    if (rows.length === 0) {
        throw new Error(
            'NO_ACTIVE_MARKETS_CONFIGURED',
        );
    }

    markets = rows.map(
        market => ({
            id: market.id,
            baseAsset: market.baseAsset,
            quoteAsset: market.quoteAsset,
            status: 'ACTIVE',
            priceScale: market.priceScale,
            quantityScale: market.quantityScale,
            minQuantity: market.minQuantity.toString(),
            tickSize: market.tickSize.toString(),
        }),
    );
}

export function getMarkets(): MarketDefinition[] {
    return markets.map(
        market => ({
            ...market,
        }),
    );
}

export function getMarket(
    marketId: string,
): MarketDefinition | undefined {
    return markets.find(
        market => market.id === marketId,
    );
}
