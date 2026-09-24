import WebSocket from 'ws';

const ws =
  new WebSocket(
    'ws://localhost:4000/ws',
  );

ws.on(
  'open',
  () => {
    console.log(
      '[client] connected',
    );

    ws.send(
      JSON.stringify({
        type:
          'SUBSCRIBE',

        channel:
          'market',

        marketId:
          'TATA_INR',
      }),
    );
  },
);

ws.on(
  'message',
  (data) => {
    console.log(
      '[client] message:',
      data.toString(),
    );
  },
);

ws.on(
  'close',
  (
    code,
    reason,
  ) => {
    console.log(
      '[client] closed',
      code,
      reason.toString(),
    );
  },
);

ws.on(
  'error',
  (error) => {
    console.error(
      '[client] error',
      error,
    );
  },
);