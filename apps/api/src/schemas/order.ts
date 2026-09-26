import {
    z,
} from 'zod';

const positiveDecimalString =
    z
        .string()
        .trim()
        .regex(
            /^\d+(?:\.\d+)?$/,
            'value must be a positive decimal string',
        )
        .refine(
            value =>
                !/^0+(?:\.0+)?$/.test(
                    value,
                ),
            'value must be greater than zero',
        );

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
            positiveDecimalString,

        quantity:
            positiveDecimalString,

        postOnly:
            z
                .boolean()
                .default(false),
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
