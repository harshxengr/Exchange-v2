export type OrderSide = 'BUY' | 'SELL';

export type OrderType = 'LIMIT' | 'MARKET';

export type TimeInForce = 'GTC' | 'IOC';

export type OrderStatus =
    | 'NEW'
    | 'PARTIALLY_FILLED'
    | 'FILLED'
    | 'CANCELED'
    | 'REJECTED';

export interface Order {
    id: string;
    userId: string;
    marketId: string;

    side: OrderSide;
    type: OrderType;
    timeInForce: TimeInForce;

    /**
     * Limit order price.
     * Null for market orders.
     */
    price: bigint | null;

    /**
     * Original quantity requested by the user.
     */
    quantity: bigint;

    /**
     * Total quantity already executed.
     */
    filledQuantity: bigint;

    postOnly: boolean;

    status: OrderStatus;

    /**
     * Monotonically increasing engine sequence.
     * Lower number = older order.
     */
    sequence: bigint;

    createdAt: string;
}

export interface Fill {
    tradeId: string;

    makerOrderId: string;
    takerOrderId: string;

    makerUserId: string;

    price: bigint;
    quantity: bigint;
}