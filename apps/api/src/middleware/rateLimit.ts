import type {
  RequestHandler,
} from 'express';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix: string;
  keyGenerator?: (
    request:
      Parameters<RequestHandler>[0],
  ) => string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export function rateLimit(
  options:
    RateLimitOptions,
): RequestHandler {
  const buckets =
    new Map<
      string,
      Bucket
    >();

  const cleanup =
    setInterval(
      () => {
        const now =
          Date.now();

        for (
          const [
            key,
            bucket,
          ] of buckets
        ) {
          if (
            bucket.resetAt <=
            now
          ) {
            buckets.delete(
              key,
            );
          }
        }
      },
      Math.max(
        options.windowMs,
        10_000,
      ),
    );

  cleanup.unref?.();

  return (
    req,
    res,
    next,
  ) => {
    const identifier =
      options.keyGenerator
        ? options.keyGenerator(
            req,
          )
        : req.ip ??
          'unknown';

    const key =
      options.keyPrefix +
      ':' +
      identifier;

    const now =
      Date.now();

    const current =
      buckets.get(
        key,
      );

    if (
      !current ||
      current.resetAt <=
      now
    ) {
      buckets.set(
        key,
        {
          count:
            1,

          resetAt:
            now +
            options.windowMs,
        },
      );

      res.setHeader(
        'X-RateLimit-Limit',
        String(
          options.max,
        ),
      );

      res.setHeader(
        'X-RateLimit-Remaining',
        String(
          Math.max(
            options.max -
              1,
            0,
          ),
        ),
      );

      next();
      return;
    }

    if (
      current.count >=
      options.max
    ) {
      const retryAfter =
        Math.max(
          1,
          Math.ceil(
            (
              current.resetAt -
              now
            ) /
              1000,
          ),
        );

      res.setHeader(
        'Retry-After',
        String(
          retryAfter,
        ),
      );

      res.setHeader(
        'X-RateLimit-Limit',
        String(
          options.max,
        ),
      );

      res.setHeader(
        'X-RateLimit-Remaining',
        '0',
      );

      res.status(
        429,
      ).json({
        error: {
          code:
            'RATE_LIMITED',

          message:
            'Too many requests. Please try again later.',
        },
      });

      return;
    }

    current.count +=
      1;

    res.setHeader(
      'X-RateLimit-Limit',
      String(
        options.max,
      ),
    );

    res.setHeader(
      'X-RateLimit-Remaining',
      String(
        Math.max(
          options.max -
            current.count,
          0,
        ),
      ),
    );

    next();
  };
}
