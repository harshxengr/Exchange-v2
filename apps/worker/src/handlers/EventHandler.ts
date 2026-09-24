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

            /*
             * -------------------------------------------------
             * DEPOSIT CREDIT SETTLEMENT
             * -------------------------------------------------
             *
             * CREDIT_BALANCE is the only balance event that
             * carries DEPOSIT_CREDIT metadata. When it arrives,
             * the persistence transaction makes the exchange
             * balance, deposit state, and immutable ledger entry
             * durable together.
             */
            if (
              event.reason ===
              'DEPOSIT_CREDIT'
            ) {
              if (
                !event.referenceId
              ) {
                throw new Error(
                  `DEPOSIT_REFERENCE_MISSING:${event.eventId}`,
                );
              }

              const depositId =
                event.referenceId;

              const deposit =
                await db.deposit.findUnique({
                  where: {
                    id:
                      depositId,
                  },
                });

              if (
                !deposit
              ) {
                throw new Error(
                  `DEPOSIT_NOT_FOUND:${depositId}`,
                );
              }

              if (
                deposit.userId !==
                event.userId
              ) {
                throw new Error(
                  `DEPOSIT_USER_MISMATCH:${depositId}`,
                );
              }

              if (
                deposit.asset !==
                event.asset
              ) {
                throw new Error(
                  `DEPOSIT_ASSET_MISMATCH:${depositId}`,
                );
              }

              if (
                deposit.amount <=
                0n
              ) {
                throw new Error(
                  `INVALID_DEPOSIT_AMOUNT:${depositId}`,
                );
              }

              if (
                deposit.status ===
                'FAILED'
              ) {
                throw new Error(
                  `DEPOSIT_ALREADY_FAILED:${depositId}`,
                );
              }

              /*
               * Database uniqueness on (reason, referenceId)
               * protects this ledger operation if the same
               * event is delivered concurrently.
               *
               * The read first makes normal retries cheap.
               */
              const existingDepositLedger =
                await db.ledgerEntry.findFirst({
                  where: {
                    reason:
                      'DEPOSIT_CREDIT',

                    referenceId:
                      depositId,
                  },
                });

              if (
                !existingDepositLedger
              ) {
                await db.ledgerEntry.create({
                  data: {
                    userId:
                      deposit.userId,

                    asset:
                      deposit.asset,

                    amount:
                      deposit.amount,

                    reason:
                      'DEPOSIT_CREDIT',

                    referenceId:
                      depositId,

                    createdAt:
                      new Date(
                        event.occurredAt,
                      ),
                  },
                });
              }

              /*
               * Balance + deposit state + ledger are all in
               * the same database transaction.
               */
              if (
                deposit.status !==
                'CONFIRMED'
              ) {
                await db.deposit.update({
                  where: {
                    id:
                      depositId,
                  },

                  data: {
                    status:
                      'CONFIRMED',

                    confirmedAt:
                      new Date(
                        event.occurredAt,
                      ),

                    creditedAt:
                      new Date(
                        event.occurredAt,
                      ),
                  },
                });
              }

              break;
            }

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
         * Mark the event only after all business writes
         * have succeeded.
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
