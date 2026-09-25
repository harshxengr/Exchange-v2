import {
  spawn,
} from 'node:child_process';

const pnpm =
  process.platform ===
  'win32'
    ? 'pnpm.cmd'
    : 'pnpm';

const commands = [
  [
    '@exchange/engine',
    'engine',
  ],
  [
    '@exchange/worker',
    'worker',
  ],
  [
    '@exchange/api',
    'api',
  ],
];

const children =
  commands.map(
    (
      [filter, name],
    ) => {
      const child =
        spawn(
          pnpm,
          [
            '--filter',
            filter,
            'start',
          ],
          {
            stdio:
              'inherit',

            env:
              process.env,
          },
        );

      child.once(
        'error',
        error => {
          console.error(
            `[demo-runtime] ${name} failed to start`,
            error,
          );
        },
      );

      return {
        child,
        name,
      };
    },
  );

let shuttingDown =
  false;

async function shutdown(
  signal,
): Promise<void> {
  if (
    shuttingDown
  ) {
    return;
  }

  shuttingDown =
    true;

  console.log(
    `[demo-runtime] received ${signal}; stopping services`,
  );

  for (
    const {
      child,
      name,
    }
    of children
  ) {
    if (
      child.exitCode !==
        null ||
      child.killed
    ) {
      continue;
    }

    console.log(
      `[demo-runtime] stopping ${name}`,
    );

    child.kill(
      'SIGTERM',
    );
  }

  await Promise.all(
    children.map(
      ({
        child,
      }) =>
        new Promise(
          resolve => {
            if (
              child.exitCode !==
              null
            ) {
              resolve(
                undefined,
              );

              return;
            }

            const timer =
              setTimeout(
                () => {
                  if (
                    !child.killed
                  ) {
                    child.kill(
                      'SIGKILL',
                    );
                  }

                  resolve(
                    undefined,
                  );
                },
                5000,
              );

            child.once(
              'exit',
              () => {
                clearTimeout(
                  timer,
                );

                resolve(
                  undefined,
                );
              },
            );
          },
        ),
    ),
  );

  process.exit(
    0,
  );
}

process.once(
  'SIGINT',
  () => {
    void shutdown(
      'SIGINT',
    );
  },
);

process.once(
  'SIGTERM',
  () => {
    void shutdown(
      'SIGTERM',
    );
  },
);

for (
  const {
    child,
    name,
  }
  of children
) {
  child.once(
    'exit',
    (
      code,
      signal,
    ) => {
      if (
        shuttingDown
      ) {
        return;
      }

      console.error(
        `[demo-runtime] ${name} exited unexpectedly`,
        {
          code,
          signal,
        },
      );

      void shutdown(
        'SERVICE_EXIT',
      );
    },
  );
}
