import type {
    PlaceOrderCommand,
} from '@exchange/messaging';

export function parsePlaceOrder(
    command: PlaceOrderCommand,
) {
    return {
        orderId:
            command.order.orderId,

        userId:
            command.userId,

        marketId:
            command.order.marketId,

        side:
            command.order.side,

        type:
            command.order.type,

        timeInForce:
            command.order.timeInForce,

        price:
            BigInt(
                command.order.price,
            ),

        quantity:
            BigInt(
                command.order.quantity,
            ),

        postOnly:
            command.order.postOnly,
    };
}