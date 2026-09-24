import type {
    Fill,
    Order,
} from '@exchange/domain';

import type {
    BookSnapshot,
    MatchResult,
} from './types.js';

export interface OrderBookSnapshot {
    marketId: string;

    bids: string[];
    asks: string[];
}

export class OrderBook {
    private bids: Order[] = [];
    private asks: Order[] = [];

    constructor(
        private readonly marketId: string,
    ) { }

    getMarketId(): string {
        return this.marketId;
    }

    getBids(): readonly Order[] {
        return this.bids;
    }

    getAsks(): readonly Order[] {
        return this.asks;
    }

    addOrder(
        order: Order,
        tradeIdFactory: () => string,
    ): MatchResult {

        if (
            order.postOnly &&
            this.wouldCross(order)
        ) {
            throw new Error(
                'POST_ONLY_WOULD_TRADE',
            );
        }

        const fills =
            order.side === 'BUY'
                ? this.matchBuy(order, tradeIdFactory)
                : this.matchSell(order, tradeIdFactory);

        const executedQuantity = fills.reduce(
            (total, fill) => total + fill.quantity,
            0n,
        );

        order.filledQuantity = executedQuantity;

        const remainingQuantity =
            order.quantity - executedQuantity;

        const shouldRest =
            remainingQuantity > 0n &&
            order.type === 'LIMIT' &&
            order.timeInForce === 'GTC';

        if (shouldRest) {
            this.insert(order);
        }

        return {
            fills,
            executedQuantity,
            remainingQuantity,
            restsOnBook: shouldRest,
        };
    }

    cancelOrder(orderId: string): Order | null {
        const bidIndex = this.bids.findIndex(
            (order) => order.id === orderId,
        );

        if (bidIndex !== -1) {
            const [order] = this.bids.splice(bidIndex, 1);

            return order ?? null;
        }

        const askIndex = this.asks.findIndex(
            (order) => order.id === orderId,
        );

        if (askIndex !== -1) {
            const [order] = this.asks.splice(askIndex, 1);

            return order ?? null;
        }

        return null;
    }

    getOpenOrders(userId: string): Order[] {
        return [
            ...this.bids.filter(
                (order) => order.userId === userId,
            ),
            ...this.asks.filter(
                (order) => order.userId === userId,
            ),
        ];
    }

    getDepth(): BookSnapshot {
        return {
            bids: this.aggregate(this.bids, 'BUY'),
            asks: this.aggregate(this.asks, 'SELL'),
        };
    }

    private matchBuy(
        taker: Order,
        tradeIdFactory: () => string,
    ): Fill[] {
        this.sortBids();
        this.sortAsks();

        const fills: Fill[] = [];

        let remaining =
            taker.quantity - taker.filledQuantity;

        for (const maker of this.asks) {
            if (remaining <= 0n) {
                break;
            }

            const makerRemaining =
                maker.quantity - maker.filledQuantity;

            if (makerRemaining <= 0n) {
                continue;
            }

            if (
                taker.type === 'LIMIT' &&
                taker.price !== null &&
                (maker.price === null ||
                    maker.price > taker.price)
            ) {
                break;
            }

            const fillQuantity =
                remaining < makerRemaining
                    ? remaining
                    : makerRemaining;

            maker.filledQuantity += fillQuantity;
            remaining -= fillQuantity;

            fills.push({
                tradeId: tradeIdFactory(),
                makerOrderId: maker.id,
                takerOrderId: taker.id,
                makerUserId: maker.userId,
                price: maker.price!,
                quantity: fillQuantity,
            });
        }

        this.removeFilledOrders();

        return fills;
    }

    private matchSell(
        taker: Order,
        tradeIdFactory: () => string,
    ): Fill[] {
        this.sortBids();
        this.sortAsks();

        const fills: Fill[] = [];

        let remaining =
            taker.quantity - taker.filledQuantity;

        for (const maker of this.bids) {
            if (remaining <= 0n) {
                break;
            }

            const makerRemaining =
                maker.quantity - maker.filledQuantity;

            if (makerRemaining <= 0n) {
                continue;
            }

            if (
                taker.type === 'LIMIT' &&
                taker.price !== null &&
                (maker.price === null ||
                    maker.price < taker.price)
            ) {
                break;
            }

            const fillQuantity =
                remaining < makerRemaining
                    ? remaining
                    : makerRemaining;

            maker.filledQuantity += fillQuantity;
            remaining -= fillQuantity;

            fills.push({
                tradeId: tradeIdFactory(),
                makerOrderId: maker.id,
                takerOrderId: taker.id,
                makerUserId: maker.userId,
                price: maker.price!,
                quantity: fillQuantity,
            });
        }

        this.removeFilledOrders();

        return fills;
    }

    private insert(order: Order): void {
        if (
            order.type !== 'LIMIT' ||
            order.price === null
        ) {
            throw new Error(
                'ONLY_LIMIT_ORDERS_CAN_REST',
            );
        }

        if (order.side === 'BUY') {
            this.bids.push(order);
            this.sortBids();
            return;
        }

        this.asks.push(order);
        this.sortAsks();
    }

    private sortBids(): void {
        this.bids.sort((a, b) => {
            const priceA = a.price ?? 0n;
            const priceB = b.price ?? 0n;

            if (priceA !== priceB) {
                return priceA > priceB ? -1 : 1;
            }

            if (a.sequence === b.sequence) {
                return 0;
            }

            return a.sequence < b.sequence ? -1 : 1;
        });
    }

    private sortAsks(): void {
        this.asks.sort((a, b) => {
            const priceA = a.price ?? 0n;
            const priceB = b.price ?? 0n;

            if (priceA !== priceB) {
                return priceA < priceB ? -1 : 1;
            }

            if (a.sequence === b.sequence) {
                return 0;
            }

            return a.sequence < b.sequence ? -1 : 1;
        });
    }

    private removeFilledOrders(): void {
        for (let i = this.bids.length - 1; i >= 0; i--) {
            const order = this.bids[i];

            if (
                order &&
                order.filledQuantity >= order.quantity
            ) {
                this.bids.splice(i, 1);
            }
        }

        for (let i = this.asks.length - 1; i >= 0; i--) {
            const order = this.asks[i];

            if (
                order &&
                order.filledQuantity >= order.quantity
            ) {
                this.asks.splice(i, 1);
            }
        }
    }

    private aggregate(
        orders: Order[],
        side: 'BUY' | 'SELL',
    ): {
        price: bigint;
        quantity: bigint;
    }[] {
        const levels = new Map<bigint, bigint>();

        for (const order of orders) {
            if (order.price === null) {
                continue;
            }

            const remaining =
                order.quantity - order.filledQuantity;

            if (remaining <= 0n) {
                continue;
            }

            levels.set(
                order.price,
                (levels.get(order.price) ?? 0n) +
                remaining,
            );
        }

        return [...levels.entries()]
            .map(([price, quantity]) => ({
                price,
                quantity,
            }))
            .sort((a, b) => {
                if (a.price === b.price) {
                    return 0;
                }

                if (side === 'BUY') {
                    return a.price > b.price ? -1 : 1;
                }

                return a.price < b.price ? -1 : 1;
            });
    }

    wouldCross(order: Order): boolean {
        if (order.type !== 'LIMIT' || order.price === null) {
            return false;
        }

        if (order.side === 'BUY') {
            const bestAsk = this.asks[0];

            return (
                bestAsk !== undefined &&
                bestAsk.price !== null &&
                bestAsk.price <= order.price
            );
        }

        const bestBid = this.bids[0];

        return (
            bestBid !== undefined &&
            bestBid.price !== null &&
            bestBid.price >= order.price
        );
    }

    getMarketBuyCost(
        quantity: bigint,
    ): bigint | null {
        this.sortAsks();

        let remaining = quantity;
        let cost = 0n;

        for (const ask of this.asks) {
            if (remaining <= 0n) {
                break;
            }

            if (ask.price === null) {
                continue;
            }

            const available =
                ask.quantity - ask.filledQuantity;

            if (available <= 0n) {
                continue;
            }

            const fillQuantity =
                remaining < available
                    ? remaining
                    : available;

            cost +=
                fillQuantity * ask.price;

            remaining -= fillQuantity;
        }

        if (remaining > 0n) {
            return null;
        }

        return cost;
    }

    getMarketSellLiquidity(
        quantity: bigint,
    ): boolean {
        this.sortBids();

        let remaining = quantity;

        for (const bid of this.bids) {
            if (remaining <= 0n) {
                return true;
            }

            const available =
                bid.quantity - bid.filledQuantity;

            if (available <= 0n) {
                continue;
            }

            const fillQuantity =
                remaining < available
                    ? remaining
                    : available;

            remaining -= fillQuantity;
        }

        return remaining <= 0n;
    }

    snapshotState(): OrderBookSnapshot {
        return {
            marketId: this.marketId,

            bids: this.bids.map(
                (order) => order.id,
            ),

            asks: this.asks.map(
                (order) => order.id,
            ),
        };
    }

    restoreState(
        snapshot: OrderBookSnapshot,
        orders: Map<string, Order>,
    ): void {
        this.bids = [];
        this.asks = [];

        for (const orderId of snapshot.bids) {
            const order =
                orders.get(orderId);

            if (!order) {
                throw new Error(
                    `SNAPSHOT_ORDER_NOT_FOUND:${orderId}`,
                );
            }

            if (order.side !== 'BUY') {
                throw new Error(
                    `SNAPSHOT_INVALID_BID_SIDE:${orderId}`,
                );
            }

            this.bids.push(order);
        }

        for (const orderId of snapshot.asks) {
            const order =
                orders.get(orderId);

            if (!order) {
                throw new Error(
                    `SNAPSHOT_ORDER_NOT_FOUND:${orderId}`,
                );
            }

            if (order.side !== 'SELL') {
                throw new Error(
                    `SNAPSHOT_INVALID_ASK_SIDE:${orderId}`,
                );
            }

            this.asks.push(order);
        }

        this.sortBids();
        this.sortAsks();
    }
}