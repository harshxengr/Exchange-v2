'use client';

import {
    useMemo,
} from 'react';

import {
    useRealtimeMarket,
} from '../lib/useRealtimeMarket';

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
                        {formatNumber(
                            ticker?.lastPrice ??
                            null,
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
                        {formatNumber(
                            stats?.high24h ??
                            null,
                        )}
                    </strong>
                </div>

                <div className="stat-card">
                    <span>
                        24H LOW
                    </span>

                    <strong>
                        {formatNumber(
                            stats?.low24h ??
                            null,
                        )}
                    </strong>
                </div>

                <div className="stat-card">
                    <span>
                        24H VOLUME
                    </span>

                    <strong>
                        {formatNumber(
                            stats?.volume24h ??
                            '0',
                        )}
                    </strong>
                </div>
            </section>

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
                                        {
                                            level.price
                                        }
                                    </span>

                                    <span>
                                        {
                                            level.quantity
                                        }
                                    </span>
                                </div>
                            ),
                        )}

                        <div className="spread-row">
                            <span>
                                MID
                            </span>

                            <strong>
                                {formatNumber(
                                    ticker?.midPrice ??
                                    null,
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
                                        {
                                            level.price
                                        }
                                    </span>

                                    <span>
                                        {
                                            level.quantity
                                        }
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
                                            {
                                                trade.price
                                            }
                                        </span>

                                        <span>
                                            {
                                                trade.quantity
                                            }
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
                        {formatNumber(
                            ticker?.bestBid ??
                            null,
                        )}
                    </strong>
                </div>

                <div>
                    <span>
                        BEST ASK
                    </span>

                    <strong>
                        {formatNumber(
                            ticker?.bestAsk ??
                            null,
                        )}
                    </strong>
                </div>

                <div>
                    <span>
                        MID
                    </span>

                    <strong>
                        {formatNumber(
                            ticker?.midPrice ??
                            null,
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