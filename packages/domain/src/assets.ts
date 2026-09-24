export const ASSETS = {
    INR: 'INR',
    TATA: 'TATA',
} as const;

export type Asset = (typeof ASSETS)[keyof typeof ASSETS];