export interface EventBase {
    eventId: string;
    commandId: string;
    occurredAt: string;
}

export interface OrderAcceptedEvent extends EventBase {
    type: 'ORDER_ACCEPTED';

    orderId: string;
    userId: string;
    marketId: string;

    side: 'BUY' | 'SELL';
    orderType: 'LIMIT' | 'MARKET';
    timeInForce: 'GTC' | 'IOC';
    postOnly: boolean;

    price: string | null;

    quantity: string;
    executedQuantity: string;
    remainingQuantity: string;

    status:
    | 'NEW'
    | 'PARTIALLY_FILLED'
    | 'FILLED'
    | 'CANCELED'
    | 'REJECTED';
}

export interface OrderCanceledEvent extends EventBase {
    type: 'ORDER_CANCELED';

    orderId: string;
    userId: string;
    marketId: string;

    remainingQuantity: string;
}

export interface TradeExecutedEvent extends EventBase {
    type: 'TRADE_EXECUTED';

    tradeId: string;

    marketId: string;

    makerOrderId: string;
    takerOrderId: string;

    buyerId: string;
    sellerId: string;

    price: string;
    quantity: string;
}

export interface BalanceChangedEvent extends EventBase {
    type: 'BALANCE_CHANGED';

    userId: string;
    asset: string;

    available: string;
    locked: string;
}

export interface DepthChangedEvent extends EventBase {
    type: 'DEPTH_CHANGED';

    marketId: string;

    bids: Array<{
        price: string;
        quantity: string;
    }>;

    asks: Array<{
        price: string;
        quantity: string;
    }>;
}

export type ExchangeEvent =
    | OrderAcceptedEvent
    | OrderCanceledEvent
    | TradeExecutedEvent
    | BalanceChangedEvent
    | DepthChangedEvent;