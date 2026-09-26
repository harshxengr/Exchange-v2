'use client';

import {
    useEffect,
    useMemo,
    useState,
} from 'react';

import {
    getMarket,
    type MarketDefinition,
} from '../lib/api';

import {
    useRealtimeMarket,
} from '../lib/useRealtimeMarket';

import {
    MarketChart,
} from './MarketChart';

type Props = {
    marketId:
    string;
};

function formatNumber(
    value:
        string | null,
): string {
    if (
        value ===
        null
    ) {
        return '--';
    }

    try {
        return Number(
            value,
        ).toLocaleString(
            'en-IN',
        );
    } catch {
        return value;
    }
}

function formatUnits(
    value:
    string | null,

    scale:
    number,
): string {
    if (
        value ===
        null
    ) {
        return '--';
    }

    try {
        const negative =
            value.startsWith(
                '-',
            );

        const absolute =
            negative
                ? value.slice(1)
                : value;

        const padded =
            absolute.padStart(
                scale + 1,
                '0',
            );

        if (
            scale ===
            0
        ) {
            return (
                (
                    negative
                        ? '-'
                        : ''
                ) +
                BigInt(
                    padded,
                ).toString()
            );
        }

        const splitAt =
            padded.length -
            scale;

        const whole =
            padded.slice(
                0,
                splitAt,
            );

        const fraction =
            padded.slice(
                splitAt,
            );

        return (
            (
                negative
                    ? '-'
                    : ''
            ) +
            BigInt(
                whole,
            ).toString() +
            '.' +
            fraction
        );
    } catch {
        return value;
    }
}

function formatTime(
    value:
        string,
): string {
    return new Date(
        value,
    ).toLocaleTimeString();
}

export function ExchangeTerminal({
    marketId,
}: Props) {
    const {
        orderBook,
        ticker,
        stats,
        trades,
        connected,
        error,
    } =
        useRealtimeMarket(
            marketId,
        );

    const [
        market,
        setMarket,
    ] =
        useState<
            MarketDefinition | null
        >(null);

    useEffect(
        () => {
            let cancelled =
                false;

            void getMarket(
                marketId,
            )
                .then(
                    (
                        result,
                    ) => {
                        if (
                            cancelled
                        ) {
                            return;
                        }

                        setMarket(
                            result,
                        );
                    },
                )
                .catch(
                    () => {
                        if (
                            cancelled
                        ) {
                            return;
                        }

                        setMarket(
                            null,
                        );
                    },
                );

            return () => {
                cancelled =
                    true;
            };
        },
        [
            marketId,
        ],
    );

    const priceScale =
        market?.priceScale ??
        0;

    const quantityScale =
        market?.quantityScale ??
        0;

    const asks =
        useMemo(
            () =>
                [
                    ...(
                        orderBook?.asks ??
                        []
                    ),
                ]
                    .slice(
                        0,
                        15,
                    )
                    .reverse(),
            [
                orderBook,
            ],
        );

    const bids =
        useMemo(
            () =>
                (
                    orderBook?.bids ??
                    []
                ).slice(
                    0,
                    15,
                ),
            [
                orderBook,
            ],
        );

    return (
        <main className="exchange-shell">
            <header className="topbar">
                <div>
                    <div className="brand">
                        EXCHANGE
                    </div>

                    <div className="market-name">
                        {marketId}
                    </div>
                </div>

                <div
                    className={
                        connected
                            ? 'connection live'
                            : 'connection'
                    }
                >
                    <span className="connection-dot" />

                    {connected
                        ? 'LIVE'
                        : 'CONNECTING'}
                </div>
            </header>

            {error ? (
                <div className="error-banner">
                    {error}
                </div>
            ) : null}

            <section className="stats-grid">
                <div className="stat-card">
                    <span>
                        LAST
                    </span>

                    <strong>
                        {formatUnits(
                            ticker?.lastPrice ??
                            null,
                            priceScale,
                        )}
                    </strong>
                </div>

                <div className="stat-card">
                    <span>
                        24H CHANGE
                    </span>

                    <strong>
                        {stats?.priceChangePercent24h ??
                            '--'}
                        %
                    </strong>
                </div>

                <div className="stat-card">
                    <span>
                        24H HIGH
                    </span>

                    <strong>
                        {formatUnits(
                            stats?.high24h ??
                            null,
                            priceScale,
                        )}
                    </strong>
                </div>

                <div className="stat-card">
                    <span>
                        24H LOW
                    </span>

                    <strong>
                        {formatUnits(
                            stats?.low24h ??
                            null,
                            priceScale,
                        )}
                    </strong>
                </div>

                <div className="stat-card">
                    <span>
                        24H VOLUME
                    </span>

                    <strong>
                        {formatUnits(
                            stats?.volume24h ??
                            '0',
                            quantityScale,
                        )}
                    </strong>
                </div>
            </section>

            <MarketChart
                trades={
                    trades
                }
                priceScale={
                    priceScale
                }
                quantityScale={
                    quantityScale
                }
            />

            <section className="main-grid">
                <div className="panel">
                    <div className="panel-header">
                        <h2>
                            Order Book
                        </h2>

                        <span>
                            {marketId}
                        </span>
                    </div>

                    <div className="book-header">
                        <span>
                            PRICE
                        </span>

                        <span>
                            QUANTITY
                        </span>
                    </div>

                    <div className="book-list">
                        {asks.map(
                            (
                                level,
                            ) => (
                                <div
                                    className="book-row ask"
                                    key={`ask-${level.price}`}
                                >
                                    <span>
                                        {formatUnits(
                                            level.price,
                                            priceScale,
                                        )}
                                    </span>

                                    <span>
                                        {formatUnits(
                                            level.quantity,
                                            quantityScale,
                                        )}
                                    </span>
                                </div>
                            ),
                        )}

                        <div className="spread-row">
                            <span>
                                MID
                            </span>

                            <strong>
                                {formatUnits(
                                    ticker?.midPrice ??
                                    null,
                                    priceScale,
                                )}
                            </strong>
                        </div>

                        {bids.map(
                            (
                                level,
                            ) => (
                                <div
                                    className="book-row bid"
                                    key={`bid-${level.price}`}
                                >
                                    <span>
                                        {formatUnits(
                                            level.price,
                                            priceScale,
                                        )}
                                    </span>

                                    <span>
                                        {formatUnits(
                                            level.quantity,
                                            quantityScale,
                                        )}
                                    </span>
                                </div>
                            ),
                        )}
                    </div>
                </div>

                <div className="panel">
                    <div className="panel-header">
                        <h2>
                            Recent Trades
                        </h2>

                        <span>
                            {stats?.tradeCount24h ??
                                0}{' '}
                            / 24h
                        </span>
                    </div>

                    <div className="trades-header">
                        <span>
                            TIME
                        </span>

                        <span>
                            PRICE
                        </span>

                        <span>
                            QTY
                        </span>
                    </div>

                    <div className="trades-list">
                        {trades.length ===
                            0 ? (
                            <div className="empty-state">
                                No trades yet
                            </div>
                        ) : (
                            trades.map(
                                (
                                    trade,
                                ) => (
                                    <div
                                        className="trade-row"
                                        key={
                                            `${trade.tradeId}-${trade.occurredAt}`
                                        }
                                    >
                                        <span>
                                            {formatTime(
                                                trade.occurredAt,
                                            )}
                                        </span>

                                        <span>
                                            {formatUnits(
                                                trade.price,
                                                priceScale,
                                            )}
                                        </span>

                                        <span>
                                            {formatUnits(
                                                trade.quantity,
                                                quantityScale,
                                            )}
                                        </span>
                                    </div>
                                ),
                            )
                        )}
                    </div>
                </div>
            </section>

            <section className="market-footer">
                <div>
                    <span>
                        BEST BID
                    </span>

                    <strong>
                        {formatUnits(
                            ticker?.bestBid ??
                            null,
                            priceScale,
                        )}
                    </strong>
                </div>

                <div>
                    <span>
                        BEST ASK
                    </span>

                    <strong>
                        {formatUnits(
                            ticker?.bestAsk ??
                            null,
                            priceScale,
                        )}
                    </strong>
                </div>

                <div>
                    <span>
                        MID
                    </span>

                    <strong>
                        {formatUnits(
                            ticker?.midPrice ??
                            null,
                            priceScale,
                        )}
                    </strong>
                </div>

                <div>
                    <span>
                        UPDATED
                    </span>

                    <strong>
                        {ticker?.updatedAt
                            ? formatTime(
                                ticker.updatedAt,
                            )
                            : '--'}
                    </strong>
                </div>
            </section>
        </main>
    );
}