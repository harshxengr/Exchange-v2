export const STREAMS = {
    ENGINE_COMMANDS:
        'exchange:engine:commands',

    ENGINE_REPLIES:
        'exchange:engine:replies',

    EVENTS:
        'exchange:events',
} as const;

export const CONSUMER_GROUPS = {
    ENGINE:
        'exchange-engine',

    PERSISTENCE:
        'exchange-persistence',
} as const;