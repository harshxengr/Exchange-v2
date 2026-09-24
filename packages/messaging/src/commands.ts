import type {
  OrderSide,
  OrderType,
  TimeInForce,
} from '@exchange/domain';

export interface PlaceOrderCommand {
    type: 'PLACE_ORDER';

    commandId: string;

    order: {
        orderId: string;
        userId: string;
        marketId: string;

        side: OrderSide;
        type: OrderType;
        timeInForce: TimeInForce;

        price: string | null;
        quantity: string;

        postOnly: boolean;
    };
}

export interface CancelOrderCommand {
    type: 'CANCEL_ORDER';

    commandId: string;

    orderId: string;
    userId: string;
    marketId: string;
}

export interface InitializeUserCommand {
    type: 'INITIALIZE_USER';

    commandId: string;

    userId: string;

    balances: Record<
        string,
        {
            available: string;
            locked: string;
        }
    >;
}

export type EngineCommand =
    | PlaceOrderCommand
    | CancelOrderCommand
    | InitializeUserCommand;