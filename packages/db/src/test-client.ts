import { prisma } from './client.js';

async function main() {
    const orders = await prisma.order.findMany();

    const trades = await prisma.trade.findMany();

    const balances = await prisma.balance.findMany();

    const processedEvents =
        await prisma.processedEvent.findMany();

    console.log({
        orders: orders.length,
        trades: trades.length,
        balances: balances.length,
        processedEvents:
            processedEvents.length,
    });
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });