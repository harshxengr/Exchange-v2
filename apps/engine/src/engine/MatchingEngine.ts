import type {
    Fill,
    Market,
    Order,
    OrderSide,
    OrderStatus,
    OrderType,
    TimeInForce,
} from '@exchange/domain';

import { BalanceStore } from '../balances/BalanceStore.js';
import { MarketRegistry } from '../market/MarketRegistry.js';
import { OrderBook } from './OrderBook.js';

import type {
    BalanceStoreSnapshot,
} from '../balances/BalanceStore.js';

import type {
    OrderBookSnapshot,
} from './OrderBook.js';

interface SerializedOrder {
    id: string;
    userId: string;
    marketId: string;

    side: OrderSide;
    type: OrderType;
    timeInForce: TimeInForce;

    price: string | null;
    quantity: string;
    filledQuantity: string;

    postOnly: boolean;

    status: OrderStatus;

    sequence: string;
    createdAt: string;
}

export interface EngineSnapshot {
    version: 1;

    orderSequence: string;
    tradeSequence: string;

    processedCommandIds?: string[];

    orders: SerializedOrder[];

    orderBooks: Record<
        string,
        OrderBookSnapshot
    >;

    orderReservations?: Record<string, string>;

    balances: BalanceStoreSnapshot;
}

export interface PlaceOrderInput {
    orderId: string;
    userId: string;
    marketId: string;

    side: OrderSide;
    type: OrderType;
    timeInForce: TimeInForce;

    price: bigint | null;
    quantity: bigint;

    postOnly: boolean;
}

export interface PlaceOrderResult {
    order: Order;
    fills: Fill[];
    executedQuantity: bigint;
    remainingQuantity: bigint;
}

export class MatchingEngine {
    private readonly orderBooks = new Map<
        string,
        OrderBook
    >();

    private readonly orders = new Map<
        string,
        Order
    >();

    private readonly processedCommandIds =
        new Set<string>();

    /*
     * Every open order owns its own reservation.  This prevents
     * a price-improvement refund on one market/order from
     * unlocking funds reserved by another order using the same
     * asset.
     */
    private readonly orderReservations =
        new Map<string, bigint>();

    private orderSequence = 0n;
    private tradeSequence = 0n;

    constructor(
        private readonly markets: MarketRegistry,
        private readonly balances: BalanceStore,
    ) { }

    registerMarket(market: Market): void {
        if (this.markets.has(market.id)) {
            throw new Error(
                `MARKET_ALREADY_REGISTERED:${market.id}`,
            );
        }

        this.markets.register(market);

        this.orderBooks.set(
            market.id,
            new OrderBook(market.id),
        );
    }

    initializeUser(
        userId: string,
        balances: Record<
            string,
            {
                available: bigint;
                locked: bigint;
            }
        >,
    ): void {
        this.balances.initializeUser(
            userId,
            balances,
        );
    }

    placeOrder(
        input: PlaceOrderInput,
    ): PlaceOrderResult {
        const market = this.markets.get(
            input.marketId,
        );

        const orderBook =
            this.getOrderBook(input.marketId);

        this.validateOrderInput(
            input,
            market,
        );

        if (
            this.orders.has(input.orderId)
        ) {
            throw new Error(
                'DUPLICATE_ORDER_ID',
            );
        }

        const order: Order = {
            id: input.orderId,
            userId: input.userId,
            marketId: input.marketId,

            side: input.side,
            type: input.type,
            timeInForce: input.timeInForce,

            price: input.price,
            quantity: input.quantity,
            filledQuantity: 0n,

            postOnly: input.postOnly,

            status: 'NEW',

            sequence:
                this.nextOrderSequence(),

            createdAt:
                new Date().toISOString(),
        };

        /*
         * POST-ONLY MUST be checked before
         * locking any funds.
         */
        if (
            order.postOnly &&
            orderBook.wouldCross(order)
        ) {
            throw new Error(
                'POST_ONLY_WOULD_TRADE',
            );
        }

        /*
         * Determine the maximum amount
         * of funds that must be reserved.
         */
        const reservation =
            this.calculateReservation(
                order,
                orderBook,
            );

        this.reserveFunds(
            order,
            market,
            reservation,
        );

        this.orderReservations.set(
            order.id,
            reservation,
        );

        let result;

        try {
            result = orderBook.addOrder(
                order,
                () => this.nextTradeId(),
            );

            this.updateMakerOrderStates(
                result.fills,
            );
        } catch (error) {
            /*
             * If matching itself fails before
             * completing, release the original
             * reservation.
             */
            this.releaseReservation(
                order,
                market,
                reservation,
            );

            this.orderReservations.delete(
                order.id,
            );

            throw error;
        }

        /*
         * Apply the actual asset movements
         * generated by the fills.
         */
        this.settleFills(
            order,
            result.fills,
            market,
        );

        /*
         * Maker orders can be partially filled or fully
         * consumed by this command. Reconcile each maker's
         * own reservation before returning funds to the user.
         */
        this.reconcileMakerReservations(
            result.fills,
            market,
        );

        /*
         * Decide whether the order is:
         *
         * NEW
         * PARTIALLY_FILLED
         * FILLED
         * CANCELED
         */
        this.updateOrderStatus(
            order,
            result.executedQuantity,
            result.remainingQuantity,
            result.restsOnBook,
        );

        /*
         * Release any amount that was
         * reserved but isn't required anymore.
         */
        this.reconcileReservation(
            order,
            market,
            result.remainingQuantity,
            result.restsOnBook,
        );

        this.orders.set(
            order.id,
            order,
        );

        return {
            order,
            fills: result.fills,
            executedQuantity:
                result.executedQuantity,
            remainingQuantity:
                result.remainingQuantity,
        };
    }

    cancelOrder(
        userId: string,
        marketId: string,
        orderId: string,
    ): Order {
        const market =
            this.markets.get(marketId);

        const orderBook =
            this.getOrderBook(marketId);

        const order =
            this.orders.get(orderId);

        if (!order) {
            throw new Error(
                'ORDER_NOT_FOUND',
            );
        }

        if (order.userId !== userId) {
            throw new Error(
                'ORDER_NOT_OWNED_BY_USER',
            );
        }

        if (
            order.status !== 'NEW' &&
            order.status !==
            'PARTIALLY_FILLED'
        ) {
            throw new Error(
                'ORDER_NOT_OPEN',
            );
        }

        const removed =
            orderBook.cancelOrder(
                orderId,
            );

        if (!removed) {
            throw new Error(
                'ORDER_NOT_ON_BOOK',
            );
        }

        this.releaseRemainingReservation(
            removed,
            market,
        );

        removed.status =
            'CANCELED';

        return removed;
    }

    getDepth(
        marketId: string,
    ) {
        return this.getOrderBook(
            marketId,
        ).getDepth();
    }

    getOpenOrders(
        userId: string,
        marketId: string,
    ): Order[] {
        return this.getOrderBook(
            marketId,
        ).getOpenOrders(userId);
    }

    getBalances(
        userId: string,
    ) {
        return this.balances.snapshot(
            userId,
        );
    }

    creditBalance(
        userId: string,
        asset: string,
        amount: bigint,
    ): void {
        if (amount <= 0n) {
            throw new Error(
                'INVALID_CREDIT_AMOUNT',
            );
        }

        this.balances.credit(
            userId,
            asset,
            amount,
        );
    }

    reserveWithdrawal(
        userId: string,
        asset: string,
        amount: bigint,
    ): void {
        if (amount <= 0n) {
            throw new Error(
                'INVALID_WITHDRAWAL_AMOUNT',
            );
        }

        this.balances.lock(
            userId,
            asset,
            amount,
        );
    }

    completeWithdrawal(
        userId: string,
        asset: string,
        amount: bigint,
    ): void {
        if (amount <= 0n) {
            throw new Error(
                'INVALID_WITHDRAWAL_AMOUNT',
            );
        }

        this.balances.debitLocked(
            userId,
            asset,
            amount,
        );
    }

    failWithdrawal(
        userId: string,
        asset: string,
        amount: bigint,
    ): void {
        if (amount <= 0n) {
            throw new Error(
                'INVALID_WITHDRAWAL_AMOUNT',
            );
        }

        this.balances.unlock(
            userId,
            asset,
            amount,
        );
    }

    reverseWithdrawal(
        userId: string,
        asset: string,
        amount: bigint,
    ): void {
        if (amount <= 0n) {
            throw new Error(
                'INVALID_WITHDRAWAL_AMOUNT',
            );
        }

        /*
         * A reversal happens after the external payout was
         * already marked complete and the engine removed the
         * amount from locked balance. Reversal therefore
         * credits the returned funds back to available.
         */
        this.balances.credit(
            userId,
            asset,
            amount,
        );
    }

    getOrder(orderId: string): Order | null {
        return this.orders.get(orderId) ?? null;
    }

    private validateOrderInput(
        input: PlaceOrderInput,
        market: Market,
    ): void {
        if (input.quantity <= 0n) {
            throw new Error(
                'INVALID_QUANTITY',
            );
        }

        if (
            input.quantity <
            market.minQuantity
        ) {
            throw new Error(
                'QUANTITY_BELOW_MINIMUM',
            );
        }

        if (
            input.type === 'LIMIT' &&
            (
                input.price === null ||
                input.price <= 0n
            )
        ) {
            throw new Error(
                'INVALID_LIMIT_PRICE',
            );
        }

        if (
            input.type === 'MARKET' &&
            input.price !== null
        ) {
            throw new Error(
                'MARKET_ORDER_CANNOT_HAVE_PRICE',
            );
        }

        /*
         * We model market orders as
         * immediately executable orders.
         */
        if (
            input.type === 'MARKET' &&
            input.timeInForce !== 'IOC'
        ) {
            throw new Error(
                'MARKET_ORDER_MUST_BE_IOC',
            );
        }

        if (
            input.postOnly &&
            input.type !== 'LIMIT'
        ) {
            throw new Error(
                'POST_ONLY_REQUIRES_LIMIT',
            );
        }

        if (
            input.postOnly &&
            input.timeInForce === 'IOC'
        ) {
            throw new Error(
                'POST_ONLY_AND_IOC_ARE_INCOMPATIBLE',
            );
        }
    }

    private calculateReservation(
        order: Order,
        orderBook: OrderBook,
    ): bigint {
        /*
         * MARKET BUY
         *
         * We need enough INR to consume
         * all required ask levels.
         */
        if (
            order.type === 'MARKET' &&
            order.side === 'BUY'
        ) {
            const cost =
                orderBook.getMarketBuyCost(
                    order.quantity,
                );

            if (cost === null) {
                throw new Error(
                    'INSUFFICIENT_MARKET_LIQUIDITY',
                );
            }

            return cost;
        }

        /*
         * MARKET SELL
         */
        if (
            order.type === 'MARKET' &&
            order.side === 'SELL'
        ) {
            const enoughLiquidity =
                orderBook.getMarketSellLiquidity(
                    order.quantity,
                );

            if (!enoughLiquidity) {
                throw new Error(
                    'INSUFFICIENT_MARKET_LIQUIDITY',
                );
            }

            return order.quantity;
        }

        /*
         * LIMIT BUY
         *
         * Reserve the worst-case
         * amount at the user's limit.
         */
        if (order.side === 'BUY') {
            if (order.price === null) {
                throw new Error(
                    'LIMIT_BUY_PRICE_REQUIRED',
                );
            }

            return (
                order.quantity *
                order.price
            );
        }

        /*
         * LIMIT SELL
         */
        return order.quantity;
    }

    private reserveFunds(
        order: Order,
        market: Market,
        amount: bigint,
    ): void {
        if (amount <= 0n) {
            throw new Error(
                'INVALID_RESERVATION',
            );
        }

        if (
            order.side === 'BUY'
        ) {
            this.balances.lock(
                order.userId,
                market.quoteAsset,
                amount,
            );

            return;
        }

        this.balances.lock(
            order.userId,
            market.baseAsset,
            amount,
        );
    }

    private settleFills(
        taker: Order,
        fills: Fill[],
        market: Market,
    ): void {
        for (const fill of fills) {
            const buyerId =
                taker.side === 'BUY'
                    ? taker.userId
                    : fill.makerUserId;

            const sellerId =
                taker.side === 'SELL'
                    ? taker.userId
                    : fill.makerUserId;

            const buyerOrderId =
                taker.side === 'BUY'
                    ? taker.id
                    : fill.makerOrderId;

            const sellerOrderId =
                taker.side === 'SELL'
                    ? taker.id
                    : fill.makerOrderId;

            const quoteAmount =
                fill.price *
                fill.quantity;

            /*
             * Consume the exact reservation belonging to each
             * order.  Never infer an order's reservation from
             * the user's aggregate locked balance.
             */
            this.consumeOrderReservation(
                buyerOrderId,
                quoteAmount,
            );

            this.consumeOrderReservation(
                sellerOrderId,
                fill.quantity,
            );

            /*
             * Buyer gives quote currency.
             *
             * Seller gives base currency.
             */
            this.balances.debitLocked(
                buyerId,
                market.quoteAsset,
                quoteAmount,
            );

            this.balances.debitLocked(
                sellerId,
                market.baseAsset,
                fill.quantity,
            );

            /*
             * Buyer receives base asset.
             */
            this.balances.credit(
                buyerId,
                market.baseAsset,
                fill.quantity,
            );

            /*
             * Seller receives quote asset.
             */
            this.balances.credit(
                sellerId,
                market.quoteAsset,
                quoteAmount,
            );
        }
    }

    private updateOrderStatus(
        order: Order,
        executedQuantity: bigint,
        remainingQuantity: bigint,
        restsOnBook: boolean,
    ): void {
        if (
            executedQuantity === 0n &&
            restsOnBook
        ) {
            order.status = 'NEW';
            return;
        }

        if (
            remainingQuantity === 0n
        ) {
            order.status = 'FILLED';
            return;
        }

        if (restsOnBook) {
            order.status =
                'PARTIALLY_FILLED';

            return;
        }

        order.status = 'CANCELED';
    }

    private reconcileReservation(
        order: Order,
        market: Market,
        remainingQuantity: bigint,
        restsOnBook: boolean,
    ): void {
        const currentReserved =
            this.orderReservations.get(
                order.id,
            ) ??
            0n;

        const expectedReserved =
            restsOnBook
                ? this.calculateRestingReservation(
                    order,
                    remainingQuantity,
                )
                : 0n;

        if (
            currentReserved <
            expectedReserved
        ) {
            throw new Error(
                [
                    'RESERVATION_INVARIANT_BROKEN',
                    order.id,
                    currentReserved.toString(),
                    expectedReserved.toString(),
                ].join(':'),
            );
        }

        const excess =
            currentReserved -
            expectedReserved;

        if (excess > 0n) {
            this.unlockReservation(
                order,
                market,
                excess,
            );
        }

        if (expectedReserved === 0n) {
            this.orderReservations.delete(
                order.id,
            );
        } else {
            this.orderReservations.set(
                order.id,
                expectedReserved,
            );
        }
    }

    private reconcileMakerReservations(
        fills: Fill[],
        market: Market,
    ): void {
        const makerOrderIds =
            new Set(
                fills.map(
                    fill =>
                        fill.makerOrderId,
                ),
            );

        for (const makerOrderId of makerOrderIds) {
            const makerOrder =
                this.orders.get(
                    makerOrderId,
                );

            if (!makerOrder) {
                throw new Error(
                    `MAKER_ORDER_NOT_FOUND:${makerOrderId}`,
                );
            }

            const remaining =
                makerOrder.quantity -
                makerOrder.filledQuantity;

            this.reconcileReservation(
                makerOrder,
                market,
                remaining,
                remaining > 0n,
            );
        }
    }

    private calculateRestingReservation(
        order: Order,
        remainingQuantity: bigint,
    ): bigint {
        if (remainingQuantity <= 0n) {
            return 0n;
        }

        if (
            order.side === 'SELL'
        ) {
            return remainingQuantity;
        }

        if (
            order.type !== 'LIMIT' ||
            order.price === null
        ) {
            return 0n;
        }

        return (
            remainingQuantity *
            order.price
        );
    }

    private releaseRemainingReservation(
        order: Order,
        market: Market,
    ): void {
        const reserved =
            this.orderReservations.get(
                order.id,
            ) ??
            0n;

        if (reserved <= 0n) {
            this.orderReservations.delete(
                order.id,
            );

            return;
        }

        this.unlockReservation(
            order,
            market,
            reserved,
        );

        this.orderReservations.delete(
            order.id,
        );
    }

    private releaseReservation(
        order: Order,
        market: Market,
        amount: bigint,
    ): void {
        if (amount <= 0n) {
            return;
        }

        this.unlockReservation(
            order,
            market,
            amount,
        );

        this.orderReservations.delete(
            order.id,
        );
    }

    private unlockReservation(
        order: Order,
        market: Market,
        amount: bigint,
    ): void {
        if (amount <= 0n) {
            return;
        }

        if (order.side === 'BUY') {
            this.balances.unlock(
                order.userId,
                market.quoteAsset,
                amount,
            );

            return;
        }

        this.balances.unlock(
            order.userId,
            market.baseAsset,
            amount,
        );
    }

    private consumeOrderReservation(
        orderId: string,
        amount: bigint,
    ): void {
        if (amount <= 0n) {
            return;
        }

        const current =
            this.orderReservations.get(
                orderId,
            );

        if (
            current ===
            undefined
        ) {
            throw new Error(
                `ORDER_RESERVATION_NOT_FOUND:${orderId}`,
            );
        }

        if (current < amount) {
            throw new Error(
                [
                    'ORDER_RESERVATION_UNDERFLOW',
                    orderId,
                    current.toString(),
                    amount.toString(),
                ].join(':'),
            );
        }

        const remaining =
            current -
            amount;

        if (remaining === 0n) {
            this.orderReservations.delete(
                orderId,
            );
        } else {
            this.orderReservations.set(
                orderId,
                remaining,
            );
        }
    }

    private getOrderBook(
        marketId: string,
    ): OrderBook {
        const orderBook =
            this.orderBooks.get(
                marketId,
            );

        if (!orderBook) {
            throw new Error(
                `ORDER_BOOK_NOT_FOUND:${marketId}`,
            );
        }

        return orderBook;
    }

    private nextOrderSequence(): bigint {
        this.orderSequence += 1n;

        return this.orderSequence;
    }

    private nextTradeId(): string {
        this.tradeSequence += 1n;

        return this.tradeSequence.toString();
    }

    private serializeOrder(
        order: Order,
    ): SerializedOrder {
        return {
            id:
                order.id,

            userId:
                order.userId,

            marketId:
                order.marketId,

            side:
                order.side,

            type:
                order.type,

            timeInForce:
                order.timeInForce,

            price:
                order.price === null
                    ? null
                    : order.price.toString(),

            quantity:
                order.quantity.toString(),

            filledQuantity:
                order.filledQuantity.toString(),

            postOnly:
                order.postOnly,

            status:
                order.status,

            sequence:
                order.sequence.toString(),

            createdAt:
                order.createdAt,
        };
    }

    private deserializeOrder(
        order: SerializedOrder,
    ): Order {
        return {
            id:
                order.id,

            userId:
                order.userId,

            marketId:
                order.marketId,

            side:
                order.side,

            type:
                order.type,

            timeInForce:
                order.timeInForce,

            price:
                order.price === null
                    ? null
                    : BigInt(order.price),

            quantity:
                BigInt(order.quantity),

            filledQuantity:
                BigInt(order.filledQuantity),

            postOnly:
                order.postOnly,

            status:
                order.status,

            sequence:
                BigInt(order.sequence),

            createdAt:
                order.createdAt,
        };
    }

    createSnapshot(): EngineSnapshot {
        const orders = [
            ...this.orders.values(),
        ].map(
            (order) =>
                this.serializeOrder(order),
        );

        const orderBooks: Record<
            string,
            OrderBookSnapshot
        > = {};

        for (const [
            marketId,
            orderBook,
        ] of this.orderBooks.entries()) {
            orderBooks[marketId] =
                orderBook.snapshotState();
        }

        return {
            version: 1,

            orderSequence:
                this.orderSequence.toString(),

            tradeSequence:
                this.tradeSequence.toString(),

            processedCommandIds: [
                ...this.processedCommandIds,
            ],

            orders,

            orderBooks,

            orderReservations:
                Object.fromEntries(
                    [
                        ...this.orderReservations.entries(),
                    ].map(
                        ([
                            orderId,
                            amount,
                        ]) => [
                            orderId,
                            amount.toString(),
                        ],
                    ),
                ),

            balances:
                this.balances.snapshotState(),
        };
    }

    restoreSnapshot(
        snapshot: EngineSnapshot,
    ): void {
        if (snapshot.version !== 1) {
            throw new Error(
                `UNSUPPORTED_SNAPSHOT_VERSION:${snapshot.version}`,
            );
        }

        /*
         * Restore sequence counters first.
         */
        this.orderSequence =
            BigInt(
                snapshot.orderSequence,
            );

        this.tradeSequence =
            BigInt(
                snapshot.tradeSequence,
            );

        const processedCommandIds =
            snapshot.processedCommandIds ?? [];

        this.processedCommandIds.clear();

        for (
            const commandId of
            processedCommandIds
        ) {
            this.processedCommandIds.add(
                commandId,
            );
        }

        /*
         * Restore canonical order objects.
         */
        this.orders.clear();

        for (const serializedOrder of snapshot.orders) {
            const order =
                this.deserializeOrder(
                    serializedOrder,
                );

            this.orders.set(
                order.id,
                order,
            );
        }

        /*
         * Restore per-order reservations. Older checkpoints
         * may not contain this field, so reconstruct the
         * minimum reservation required by every open order.
         */
        this.orderReservations.clear();

        for (const [
            orderId,
            amount,
        ] of Object.entries(
            snapshot.orderReservations ?? {},
        )) {
            this.orderReservations.set(
                orderId,
                BigInt(amount),
            );
        }

        for (const order of this.orders.values()) {
            const remaining =
                order.quantity -
                order.filledQuantity;

            if (
                remaining <= 0n
            ) {
                continue;
            }

            if (
                !this.orderReservations.has(
                    order.id,
                )
            ) {
                this.orderReservations.set(
                    order.id,
                    this.calculateRestingReservation(
                        order,
                        remaining,
                    ),
                );
            }
        }

        /*
         * Restore balances.
         */
        this.balances.restoreState(
            snapshot.balances,
        );

        /*
         * Restore the order books.
         *
         * Order books reference the same Order
         * objects stored inside this.orders.
         */
        for (const [
            marketId,
            orderBookSnapshot,
        ] of Object.entries(
            snapshot.orderBooks,
        )) {
            const orderBook =
                this.getOrderBook(
                    marketId,
                );

            orderBook.restoreState(
                orderBookSnapshot,
                this.orders,
            );
        }
    }

    private updateMakerOrderStates(
        fills: Fill[],
    ): void {
        for (const fill of fills) {
            const makerOrder =
                this.orders.get(
                    fill.makerOrderId,
                );

            if (!makerOrder) {
                throw new Error(
                    `MAKER_ORDER_NOT_FOUND:${fill.makerOrderId}`,
                );
            }

            /*
             * OrderBook is responsible for matching
             * and updating the maker's filled quantity.
             *
             * Here we update the maker's lifecycle
             * status based on that new quantity.
             */
            if (
                makerOrder.filledQuantity >=
                makerOrder.quantity
            ) {
                makerOrder.status = 'FILLED';
                continue;
            }

            if (
                makerOrder.filledQuantity > 0n
            ) {
                makerOrder.status =
                    'PARTIALLY_FILLED';
            }
        }
    }

    hasProcessedCommand(
        commandId: string,
    ): boolean {
        return this.processedCommandIds.has(
            commandId,
        );
    }

    markCommandProcessed(
        commandId: string,
    ): void {
        this.processedCommandIds.add(
            commandId,
        );
    }
}