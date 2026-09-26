'use client';

import {
  useMemo,
} from 'react';

type Trade = {
  price: string;
  quantity: string;
  occurredAt: string;
};

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Props = {
  trades: Trade[];
  priceScale: number;
  quantityScale: number;
};

function toDisplayValue(
  value: string,
  scale: number,
): number {
  return (
    Number(
      BigInt(value),
    ) /
    10 ** scale
  );
}

function buildCandles(
  trades: Trade[],
  priceScale: number,
  quantityScale: number,
): Candle[] {
  const ordered =
    [...trades].sort(
      (first, second) =>
        new Date(first.occurredAt).getTime() -
        new Date(second.occurredAt).getTime(),
    );

  const candles =
    new Map<number, Candle>();

  for (const trade of ordered) {
    const timestamp =
      new Date(
        trade.occurredAt,
      ).getTime();

    if (
      !Number.isFinite(
        timestamp,
      )
    ) {
      continue;
    }

    const minute =
      Math.floor(
        timestamp / 60_000,
      ) * 60_000;

    const price =
      toDisplayValue(
        trade.price,
        priceScale,
      );

    const volume =
      toDisplayValue(
        trade.quantity,
        quantityScale,
      );

    const existing =
      candles.get(
        minute,
      );

    if (!existing) {
      candles.set(
        minute,
        {
          time:
            minute,
          open:
            price,
          high:
            price,
          low:
            price,
          close:
            price,
          volume,
        },
      );

      continue;
    }

    existing.high =
      Math.max(
        existing.high,
        price,
      );

    existing.low =
      Math.min(
        existing.low,
        price,
      );

    existing.close =
      price;

    existing.volume +=
      volume;
  }

  return [
    ...candles.values(),
  ];
}

function formatPrice(
  value: number,
  scale: number,
): string {
  return value.toLocaleString(
    'en-IN',
    {
      minimumFractionDigits:
        scale,

      maximumFractionDigits:
        scale,
    },
  );
}

export function MarketChart({
  trades,
  priceScale,
  quantityScale,
}: Props) {
  const candles =
    useMemo(
      () =>
        buildCandles(
          trades,
          priceScale,
          quantityScale,
        ).slice(-60),
      [
        trades,
        priceScale,
        quantityScale,
      ],
    );

  if (
    candles.length ===
    0
  ) {
    return (
      <section className="panel chart-panel">
        <div className="panel-header">
          <h2>
            Price Chart
          </h2>

          <span>
            1m
          </span>
        </div>

        <div className="chart-empty">
          Waiting for trades...
        </div>
      </section>
    );
  }

  const width =
    900;

  const height =
    320;

  const chartTop =
    22;

  const chartBottom =
    245;

  const volumeTop =
    258;

  const volumeBottom =
    298;

  const prices =
    candles.flatMap(
      candle => [
        candle.high,
        candle.low,
      ],
    );

  const minPrice =
    Math.min(
      ...prices,
    );

  const maxPrice =
    Math.max(
      ...prices,
    );

  const range =
    Math.max(
      maxPrice -
        minPrice,
      maxPrice *
        0.0001,
      0.00000001,
    );

  const paddedMin =
    minPrice -
    range *
      0.08;

  const paddedMax =
    maxPrice +
    range *
      0.08;

  const priceRange =
    paddedMax -
    paddedMin;

  const volumes =
    candles.map(
      candle =>
        candle.volume,
    );

  const maxVolume =
    Math.max(
      ...volumes,
      1,
    );

  const candleWidth =
    Math.max(
      5,
      Math.min(
        12,
        (width - 70) /
          candles.length *
          0.62,
      ),
    );

  const plotWidth =
    width -
    60;

  const step =
    plotWidth /
    candles.length;

  const toY =
    (price: number) =>
      chartBottom -
      (
        (
          price -
          paddedMin
        ) /
        priceRange
      ) *
      (
        chartBottom -
        chartTop
      );

  const toX =
    (index: number) =>
      30 +
      step *
        index +
      step /
        2;

  const gridCount =
    5;

  return (
    <section className="panel chart-panel">
      <div className="panel-header">
        <h2>
          Price Chart
        </h2>

        <span>
          1m candles
        </span>
      </div>

      <div className="chart-wrap">
        <svg
          viewBox={
            '0 0 ' +
            width +
            ' ' +
            height
          }
          className="market-chart"
          role="img"
          aria-label="One minute price chart"
        >
          {Array.from({
            length:
              gridCount,
          }).map(
            (
              _,
              index,
            ) => {
              const y =
                chartTop +
                (
                  (
                    chartBottom -
                    chartTop
                  ) /
                  (
                    gridCount -
                    1
                  )
                ) *
                index;

              const value =
                paddedMax -
                (
                  (
                    paddedMax -
                    paddedMin
                  ) /
                  (
                    gridCount -
                    1
                  )
                ) *
                index;

              return (
                <g
                  key={
                    'grid-' +
                    index
                  }
                >
                  <line
                    x1="30"
                    x2="870"
                    y1={y}
                    y2={y}
                    className="chart-grid"
                  />

                  <text
                    x="890"
                    y={
                      y +
                      4
                    }
                    textAnchor="end"
                    className="chart-label"
                  >
                    {formatPrice(
                      value,
                      priceScale,
                    )}
                  </text>
                </g>
              );
            },
          )}

          {candles.map(
            (
              candle,
            ) => {
              const index =
                candles.indexOf(
                  candle,
                );

              const x =
                toX(
                  index,
                );

              const openY =
                toY(
                  candle.open,
                );

              const closeY =
                toY(
                  candle.close,
                );

              const highY =
                toY(
                  candle.high,
                );

              const lowY =
                toY(
                  candle.low,
                );

              const bullish =
                candle.close >=
                candle.open;

              const bodyTop =
                Math.min(
                  openY,
                  closeY,
                );

              const bodyHeight =
                Math.max(
                  2,
                  Math.abs(
                    closeY -
                    openY,
                  ),
                );

              const volumeHeight =
                (
                  candle.volume /
                  maxVolume
                ) *
                (
                  volumeBottom -
                  volumeTop
                );

              return (
                <g
                  key={
                    candle.time
                  }
                >
                  <line
                    x1={x}
                    x2={x}
                    y1={highY}
                    y2={lowY}
                    className={
                      bullish
                        ? 'candle-up'
                        : 'candle-down'
                    }
                  />

                  <rect
                    x={
                      x -
                      candleWidth /
                        2
                    }
                    y={
                      bodyTop
                    }
                    width={
                      candleWidth
                    }
                    height={
                      bodyHeight
                    }
                    className={
                      bullish
                        ? 'candle-up-fill'
                        : 'candle-down-fill'
                    }
                    rx="1"
                  />

                  <rect
                    x={
                      x -
                      candleWidth /
                        2
                    }
                    y={
                      volumeBottom -
                      volumeHeight
                    }
                    width={
                      candleWidth
                    }
                    height={
                      volumeHeight
                    }
                    className={
                      bullish
                        ? 'volume-up'
                        : 'volume-down'
                    }
                    rx="1"
                  />
                </g>
              );
            },
          )}

          <text
            x="30"
            y="312"
            className="chart-label"
          >
            {new Date(
              candles[0].time,
            ).toLocaleTimeString()}
          </text>

          <text
            x="870"
            y="312"
            textAnchor="end"
            className="chart-label"
          >
            {new Date(
              candles[
                candles.length -
                1
              ].time,
            ).toLocaleTimeString()}
          </text>
        </svg>
      </div>
    </section>
  );
}
