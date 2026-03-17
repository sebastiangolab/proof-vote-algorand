import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";

const prisma = new PrismaClient();

// This seed script creates 2 mock votes in the database:
async function main() {
  // Active vote — voteId=1, 3 options (matches mock optionCount=3)
  await prisma.voteMetadata.upsert({
    where: { voteId: 1n },
    update: {},
    create: {
      appId: 0n,
      voteId: 1n,
      slug: "will-bitcoin-reach-200k",
      title: "Will Bitcoin reach $200,000 USD in 2025?",
      description: "This vote concerns the BTC price forecast for the end of 2025.",
      optionLabels: ["Yes, before July", "Yes, after July", "No, it won't"],
      creatorWallet: "MDV4NQNW6QMNU3KKQYQVT4K4LEKINMXVCNQDFLIGGIQYS6ISY4YVLDPLAY",
    },
  });

  // Ended vote — voteId=2, 4 options (matches mock optionCount=4)
  await prisma.voteMetadata.upsert({
    where: { voteId: 2n },
    update: {},
    create: {
      appId: 0n,
      voteId: 2n,
      slug: "best-office-coffee",
      title: "What is the best coffee for the office?",
      description: "This vote has ended. Thank you for participating!",
      optionLabels: ["Espresso", "Cappuccino", "Americano", "Latte"],
      creatorWallet: "MDV4NQNW6QMNU3KKQYQVT4K4LEKINMXVCNQDFLIGGIQYS6ISY4YVLDPLAY",
    },
  });

  console.log("✓ Seeded 2 mock votes (voteId 1 = active, voteId 2 = ended)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
