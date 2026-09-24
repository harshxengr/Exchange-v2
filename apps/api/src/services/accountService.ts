import {
  prisma,
} from '@exchange/db';

export type AccountBalance = {
  asset: string;
  available: string;
  locked: string;
  total: string;
};

export type LedgerEntry = {
  id: string;
  userId: string;
  asset: string;
  amount: string;
  reason: string;
  referenceId: string | null;
  createdAt: string;
};

export type DepositRecord = {
  id: string;
  userId: string;
  asset: string;
  amount: string;
  status: string;
  externalRef: string | null;
  createdAt: string;
};

export class AccountService {
  async getBalances(
    userId: string,
  ): Promise<AccountBalance[]> {
    const balances =
      await prisma.balance.findMany({
        where: {
          userId,
        },

        orderBy: {
          asset: 'asc',
        },
      });

    return balances.map(
      (balance) => ({
        asset:
          balance.asset,

        available:
          balance.available.toString(),

        locked:
          balance.locked.toString(),

        total:
          (
            balance.available +
            balance.locked
          ).toString(),
      }),
    );
  }

  async getLedger(
    userId: string,
    limit = 100,
  ): Promise<LedgerEntry[]> {
    const safeLimit =
      Math.min(
        Math.max(
          Math.trunc(limit),
          1,
        ),
        500,
      );

    const entries =
      await prisma.ledgerEntry.findMany({
        where: {
          userId,
        },

        orderBy: {
          createdAt: 'desc',
        },

        take:
          safeLimit,
      });

    return entries.map(
      (entry) => ({
        id:
          entry.id,

        userId:
          entry.userId,

        asset:
          entry.asset,

        amount:
          entry.amount.toString(),

        reason:
          entry.reason,

        referenceId:
          entry.referenceId,

        createdAt:
          entry.createdAt.toISOString(),
      }),
    );
  }

  async getDeposits(
    userId: string,
    limit = 100,
  ): Promise<DepositRecord[]> {
    const safeLimit =
      Math.min(
        Math.max(
          Math.trunc(limit),
          1,
        ),
        500,
      );

    const deposits =
      await prisma.deposit.findMany({
        where: {
          userId,
        },

        orderBy: {
          createdAt: 'desc',
        },

        take:
          safeLimit,
      });

    return deposits.map(
      (deposit) => ({
        id:
          deposit.id,

        userId:
          deposit.userId,

        asset:
          deposit.asset,

        amount:
          deposit.amount.toString(),

        status:
          deposit.status,

        externalRef:
          deposit.externalRef,

        createdAt:
          deposit.createdAt.toISOString(),
      }),
    );
  }
}