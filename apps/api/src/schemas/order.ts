import {
    z,
} from 'zod';

export const placeOrderSchema =
    z.object({
        marketId:
            z
                .string()
                .trim()
                .min(1)
                .max(50),

        side:
            z.enum([
                'BUY',
                'SELL',
            ]),

        price:
            z
                .string()
                .regex(
                    /^\d+(\.\d+)?$/,
                    'price must be a positive numeric string',
                ),

        quantity:
            z
                .string()
                .regex(
                    /^\d+(\.\d+)?$/,
                    'quantity must be a positive numeric string',
                ),

        postOnly:
            z.boolean(),
    });

export const cancelOrderSchema =
    z.object({
        marketId:
            z
                .string()
                .trim()
                .min(1)
                .max(50),
    });

export type PlaceOrderInput =
    z.infer<
        typeof placeOrderSchema
    >;

export type CancelOrderInput =
    z.infer<
        typeof cancelOrderSchema
    >;