export type InitializeUserCommand = {
    type: 'INITIALIZE_USER';

    commandId: string;

    replyTo: string;

    userId: string;

    balances: Record<
        string,
        {
            available: string;
            locked: string;
        }
    >;
};

export type PlaceOrderCommand = {
    type: 'PLACE_ORDER';

    commandId: string;

    replyTo: string;

    userId: string;

    order: {
        orderId: string;

        marketId: string;

        side: 'BUY' | 'SELL';

        type: 'LIMIT' | 'MARKET';

        timeInForce: 'GTC' | 'IOC';

        price: string;

        quantity: string;

        postOnly: boolean;
    };
};

export type CancelOrderCommand = {
    type: 'CANCEL_ORDER';

    commandId: string;

    replyTo: string;

    userId: string;

    marketId: string;

    orderId: string;
};

/**
 * Credits an already-created deposit
 * into the matching engine balance.
 *
 * The depositId is the financial-operation
 * identity and is used for idempotency.
 */
export type CreditBalanceCommand = {
    type: 'CREDIT_BALANCE';

    commandId: string;

    userId: string;

    asset: string;

    amount: string;

    depositId: string;
};

export type EngineCommand =
    | InitializeUserCommand
    | PlaceOrderCommand
    | CancelOrderCommand
    | CreditBalanceCommand;

export type EngineReply =
    | {
        type: 'ORDER_ACCEPTED';

        commandId: string;

        success: true;

        orderId: string;

        userId: string;

        marketId: string;

        status:
        | 'NEW'
        | 'PARTIALLY_FILLED'
        | 'FILLED'
        | 'CANCELED'
        | 'REJECTED';
    }
    | {
        type: 'ORDER_REJECTED';

        commandId: string;

        success: false;

        reason: string;
    }
    | {
        type: 'ORDER_CANCELED';

        commandId: string;

        success: true;

        orderId: string;

        userId: string;

        marketId: string;
    }
    | {
        type: 'COMMAND_REJECTED';

        commandId: string;

        success: false;

        reason: string;
    };