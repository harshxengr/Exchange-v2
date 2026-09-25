import {
  prisma,
} from '../src/index.js';

async function main(): Promise<void> {
  await prisma.market.upsert({
    where: {
      id:
        'TATA_INR',
    },

    update: {
      baseAsset:
        'TATA',

      quoteAsset:
        'INR',

      priceScale:
        2,

      quantityScale:
        3,

      minQuantity:
        1n,

      tickSize:
        1n,

      active:
        true,
    },

    create: {
      id:
        'TATA_INR',

      baseAsset:
        'TATA',

      quoteAsset:
        'INR',

      priceScale:
        2,

      quantityScale:
        3,

      minQuantity:
        1n,

      tickSize:
        1n,

      active:
        true,
    },
  });

  console.log(
    '[db] seed complete',
  );
}

main()
  .catch(
    (
      error,
    ) => {
      console.error(
        '[db] seed failed',
        error,
      );

      process.exit(1);
    },
  )
  .finally(
    async () => {
      await prisma.$disconnect();
    },
  );
}
