export function toMinorUnits(value: string, scale: number): bigint {
    const trimmed = value.trim();

    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
        throw new Error(`Invalid numeric value: ${value}`);
    }

    const [whole, fraction = ''] = trimmed.split('.');

    if (fraction.length > scale) {
        throw new Error(`Too many decimal places: ${value}`);
    }

    const paddedFraction = fraction.padEnd(scale, '0');

    return BigInt(whole + paddedFraction);
}

export function fromMinorUnits(value: bigint, scale: number): string {
    const negative = value < 0n;
    const absolute = negative ? -value : value;

    const divisor = 10n ** BigInt(scale);

    const whole = absolute / divisor;
    const fraction = absolute % divisor;

    if (scale === 0) {
        return `${negative ? '-' : ''}${whole}`;
    }

    return `${negative ? '-' : ''}${whole}.${fraction
        .toString()
        .padStart(scale, '0')}`;
}