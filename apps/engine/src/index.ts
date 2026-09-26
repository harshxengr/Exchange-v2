import './loadEnv.js';

import {
    connectRedis,
    createRedisClient,
    ensureConsumerGroup,
    CONSUMER_GROUPS,
    STREAMS,
} from '@exchange/messaging';

import {
    MatchingEngine,
} from './engine/MatchingEngine.js';

import {
    BalanceStore,
} from './balances/BalanceStore.js';

import {
    MarketRegistry,
} from './market/MarketRegistry.js';

import {
    EngineWorker,
} from './runtime/EngineWorker.js';

import {
    prisma,
} from '@exchange/db';

async function main(): Promise<void> {
    const redis =
        createRedisClient();

    await connectRedis(redis);

    await ensureConsumerGroup(
        redis,
        STREAMS.ENGINE_COMMANDS,
        CONSUMER_GROUPS.ENGINE,
    );

    const markets =
        new MarketRegistry();
    const configuredMarkets =
        await prisma.market.findMany({
            where: {
                active: true,
            },
            orderBy: {
                id: 'asc',
            },
        });

    if (configuredMarkets.length === 0) {
        await prisma.$disconnect();

        throw new Error(
            'NO_ACTIVE_MARKETS_CONFIGURED',
        );
    }

    await prisma.$disconnect();

    const balances =
        new BalanceStore();

    const engine =
        new MatchingEngine(
            markets,
            balances,
        );

    for (const market of configuredMarkets) {
        engine.registerMarket({
            id: market.id,
            baseAsset: market.baseAsset,
            quoteAsset: market.quoteAsset,
            priceScale: market.priceScale,
            quantityScale: market.quantityScale,
            minQuantity: market.minQuantity,
            tickSize: market.tickSize,
        });
    }

    /*
     * The runtime stays independent of persistence.
     *
     * Markets are currently loaded from the local demo registry.
     */
    /*
     * We'll register real markets from
     * database configuration later.
     *
     * For now the runtime itself stays
     * independent of persistence.
     */

    const worker =
        new EngineWorker(
            redis,
            engine,
        );

    console.log(
        '[engine] starting',
    );

    await worker.run();
}

main().catch(
    (error: unknown) => {
        console.error(
            '[engine] fatal error',
            error,
        );

        process.exit(1);
    },
);