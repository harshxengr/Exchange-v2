import {
  prisma,
} from '@exchange/db';

import type {
  ExchangeEvent,
} from '@exchange/messaging';

export class EventHandler {
  async handle(
    event: ExchangeEvent,
  ): Promise<void> {
    await prisma.$transaction(
      async (tx) => {
        /*
         * Prisma 7 transaction typing can lose the
         * generated model map in this monorepo.
         *
         * Keep the workaround isolated here.
         */
        const db =
          tx as unknown as typeof prisma;

        /*
         * -----------------------------------------------------
         * Event-level idempotency.
         * -----------------------------------------------------
         *
         * If this exact Redis event was already
         * committed, nothing else should happen.
         */
        const existing =
          await db.processedEvent.findUnique({
            where: {
              eventId:
                event.eventId,
            },
          });

        if (
          existing
        ) {
          return;
        }

        switch (
          event.type
        ) {
          /*
           * ---------------------------------------------------
           * ORDER ACCEPTED
           * ---------------------------------------------------
           */
          case 'ORDER_ACCEPTED': {
            await db.order.upsert({
              where: {
                id:
                  event.orderId,
              },

              create: {
                id:
                  event.orderId,

                userId:
                  event.userId,

                marketId:
                  event.marketId,

                side:
                  event.side,

                type:
                  event.orderType,

                timeInForce:
                  event.timeInForce,

                price:
                  event.price ===
                  null
                    ? null
                    : BigInt(
                        event.price,
                      ),

                quantity:
                  BigInt(
                    event.quantity,
                  ),

                filledQuantity:
                  BigInt(
                    event.executedQuantity,
                  ),

                status:
                  event.status as any,

                postOnly:
                  event.postOnly,

                createdAt:
                  new Date(
                    event.occurredAt,
                  ),
              },

              update: {
                filledQuantity:
                  BigInt(
                    event.executedQuantity,
                  ),

                status:
                  event.status as any,
              },
            });

            break;
          }

          /*
           * ---------------------------------------------------
           * ORDER CANCELED
           * ---------------------------------------------------
           */
          case 'ORDER_CANCELED': {
            await db.order.update({
              where: {
                id:
                  event.orderId,
              },

              data: {
                status:
                  'CANCELED' as any,
              },
            });

            break;
          }

          /*
           * ---------------------------------------------------
           * TRADE EXECUTED
           * ---------------------------------------------------
           */
          case 'TRADE_EXECUTED': {
            /*
             * Trade-level idempotency.
             *
             * This is separate from eventId protection.
             * If the same logical trade appears again with
             * another eventId, we must not create another
             * trade or another set of ledger entries.
             */
            const existingTrade =
              await db.trade.findUnique({
                where: {
                  id:
                    event.tradeId,
                },
              });

            if (
              existingTrade
            ) {
              break;
            }

            /*
             * Load the market so we know which asset is
             * base and which asset is quote.
             */
            const market =
              await db.market.findUnique({
                where: {
                  id:
                    event.marketId,
                },
              });

            if (
              !market
            ) {
              throw new Error(
                `MARKET_NOT_FOUND:${event.marketId}`,
              );
            }

            const price =
              BigInt(
                event.price,
              );

            const quantity =
              BigInt(
                event.quantity,
              );

            const quoteAmount =
              price *
              quantity;

            /*
             * -------------------------------------------------
             * Persist the executed trade.
             * -------------------------------------------------
             */
            await db.trade.create({
              data: {
                id:
                  event.tradeId,

                marketId:
                  event.marketId,

                makerOrderId:
                  event.makerOrderId,

                takerOrderId:
                  event.takerOrderId,

                buyerId:
                  event.buyerId,

                sellerId:
                  event.sellerId,

                price,

                quantity,

                createdAt:
                  new Date(
                    event.occurredAt,
                  ),
              },
            });

            /*
             * -------------------------------------------------
             * Update maker order.
             * -------------------------------------------------
             */
            const makerOrder =
              await db.order.findUnique({
                where: {
                  id:
                    event.makerOrderId,
                },
              });

            if (
              !makerOrder
            ) {
              throw new Error(
                `MAKER_ORDER_NOT_FOUND:${event.makerOrderId}`,
              );
            }

            const newFilledQuantity =
              makerOrder.filledQuantity +
              quantity;

            const makerStatus =
              newFilledQuantity >=
              makerOrder.quantity
                ? 'FILLED'
                : 'PARTIALLY_FILLED';

            await db.order.update({
              where: {
                id:
                  makerOrder.id,
              },

              data: {
                filledQuantity:
                  newFilledQuantity,

                status:
                  makerStatus as any,
              },
            });

            /*
             * -------------------------------------------------
             * IMMUTABLE ECONOMIC LEDGER
             * -------------------------------------------------
             *
             * Buyer:
             *
             *   + base quantity
             *   - quote amount
             *
             * Seller:
             *
             *   - base quantity
             *   + quote amount
             *
             * referenceId = tradeId
             *
             * These are NET economic movements.
             *
             * Reservation/lock movements are deliberately
             * NOT recorded here because they don't change the
             * user's total economic balance.
             */

            const ledgerEntries = [
              {
                userId:
                  event.buyerId,

                asset:
                  market.baseAsset,

                amount:
                  quantity,

                reason:
                  'TRADE_BUY_BASE',

                referenceId:
                  event.tradeId,

                createdAt:
                  new Date(
                    event.occurredAt,
                  ),
              },

              {
                userId:
                  event.buyerId,

                asset:
                  market.quoteAsset,

                amount:
                  -quoteAmount,

                reason:
                  'TRADE_BUY_QUOTE',

                referenceId:
                  event.tradeId,

                createdAt:
                  new Date(
                    event.occurredAt,
                  ),
              },

              {
                userId:
                  event.sellerId,

                asset:
                  market.baseAsset,

                amount:
                  -quantity,

                reason:
                  'TRADE_SELL_BASE',

                referenceId:
                  event.tradeId,

                createdAt:
                  new Date(
                    event.occurredAt,
                  ),
              },

              {
                userId:
                  event.sellerId,

                asset:
                  market.quoteAsset,

                amount:
                  quoteAmount,

                reason:
                  'TRADE_SELL_QUOTE',

                referenceId:
                  event.tradeId,

                createdAt:
                  new Date(
                    event.occurredAt,
                  ),
              },
            ];

            /*
             * If a user trades against themselves, the four
             * entries still precisely represent the economic
             * legs of the trade. We are not silently dropping
             * ledger records.
             */
            await db.ledgerEntry.createMany({
              data:
                ledgerEntries,
            });

            break;
          }

          /*
           * ---------------------------------------------------
           * BALANCE CHANGED
           * ---------------------------------------------------
           */
          case 'BALANCE_CHANGED': {
            await db.balance.upsert({
              where: {
                userId_asset: {
                  userId:
                    event.userId,

                  asset:
                    event.asset,
                },
              },

              create: {
                userId:
                  event.userId,

                asset:
                  event.asset,

                available:
                  BigInt(
                    event.available,
                  ),

                locked:
                  BigInt(
                    event.locked,
                  ),

                updatedAt:
                  new Date(
                    event.occurredAt,
                  ),
              },

              update: {
                available:
                  BigInt(
                    event.available,
                  ),

                locked:
                  BigInt(
                    event.locked,
                  ),

                updatedAt:
                  new Date(
                    event.occurredAt,
                  ),
              },
            });

            break;
          }

          default: {
            const exhaustiveCheck:
              never =
              event;

            throw new Error(
              `UNSUPPORTED_EVENT:${exhaustiveCheck}`,
            );
          }
        }

        /*
         * Mark the event only after the business operation
         * and all ledger writes have succeeded.
         */
        await db.processedEvent.create({
          data: {
            eventId:
              event.eventId,

            eventType:
              event.type,
          },
        });
      },
    );
  }
}