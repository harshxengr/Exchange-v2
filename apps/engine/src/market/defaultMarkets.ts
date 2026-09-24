import type { Market } from '@exchange/domain';

export const DEFAULT_MARKETS: Market[] = [
    {
        id: 'TATA_INR',
        baseAsset: 'TATA',
        quoteAsset: 'INR',

        priceScale: 2,
        quantityScale: 3,

        minQuantity: 1n,
        tickSize: 1n,
    },
];