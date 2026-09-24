export interface Market {
    id: string;
    baseAsset: string;
    quoteAsset: string;
    priceScale: number;
    quantityScale: number;
    minQuantity: bigint;
    tickSize: bigint;
}