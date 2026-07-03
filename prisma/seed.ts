// Onboards your first design-partner lender manually — there's no self-serve
// signup yet (deliberately deferred, see the MVP plan). Run with:
//   npx tsx prisma/seed.ts "Acme Capital"
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { generateApiKey, hashApiKey } from "@/lib/crypto";

async function main() {
  const orgName = process.argv[2];
  if (!orgName) {
    console.error('Usage: npx tsx prisma/seed.ts "Lender Name"');
    process.exit(1);
  }

  const organization = await prisma.organization.create({ data: { name: orgName } });
  const { plaintext, prefix } = generateApiKey();

  await prisma.apiKey.create({
    data: {
      organizationId: organization.id,
      hashedKey: hashApiKey(plaintext),
      keyPrefix: prefix,
      label: "Initial key",
    },
  });

  console.log(`Created organization "${organization.name}" (${organization.id})`);
  console.log(`API key (shown once — store it now): ${plaintext}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
