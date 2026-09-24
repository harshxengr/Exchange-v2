export function compareStreamIds(
    left: string,
    right: string,
): number {
    const [
        leftTime,
        leftSequence,
    ] = parseStreamId(left);

    const [
        rightTime,
        rightSequence,
    ] = parseStreamId(right);

    if (leftTime < rightTime) {
        return -1;
    }

    if (leftTime > rightTime) {
        return 1;
    }

    if (
        leftSequence <
        rightSequence
    ) {
        return -1;
    }

    if (
        leftSequence >
        rightSequence
    ) {
        return 1;
    }

    return 0;
}

function parseStreamId(
    id: string,
): [bigint, bigint] {
    const parts =
        id.split('-');

    if (parts.length !== 2) {
        throw new Error(
            `INVALID_STREAM_ID:${id}`,
        );
    }

    const time =
        BigInt(parts[0]!);

    const sequence =
        BigInt(parts[1]!);

    return [
        time,
        sequence,
    ];
}