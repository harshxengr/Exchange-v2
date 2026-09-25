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
    DEFAULT_MARKETS,
} from './market/defaultMarkets.js';

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

    const balances =
        new BalanceStore();

    const engine =
        new MatchingEngine(
            markets,
            balances,
        );

    for (const market of DEFAULT_MARKETS) {
        engine.registerMarket(market);
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