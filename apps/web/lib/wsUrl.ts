const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';

function withWebSocketProtocol(
  value: string,
): string {
  try {
    const url =
      new URL(
        value,
      );

    url.protocol =
      url.protocol ===
      'https:'
        ? 'wss:'
        : 'ws:';

    if (
      !url.pathname ||
      url.pathname ===
        '/'
    ) {
      url.pathname =
        '/ws';
    } else if (
      !url.pathname.endsWith(
        '/ws',
      )
    ) {
      url.pathname =
        `${url.pathname.replace(
          /\/$/,
          '',
        )}/ws`;
    }

    return url
      .toString()
      .replace(
        /\/$/,
        '',
      );
  } catch {
    return 'ws://localhost:4000/ws';
  }
}

export function getRealtimeWebSocketUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_WS_URL?.trim();

  if (
    configured
  ) {
    return withWebSocketProtocol(
      configured,
    );
  }

  return withWebSocketProtocol(
    API_BASE_URL,
  );
}
