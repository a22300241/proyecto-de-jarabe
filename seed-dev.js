const { PrismaClient } = require("@prisma/client");
const bcryptjs = require("bcryptjs");

async function main() {
  const prisma = new PrismaClient();

  const email = "franchise1@demo.com";
  const password = "123456";
  const role = "FRANCHISE_OWNER";
  const name = "Owner Franquicia 1";

  const passwordHash = await bcryptjs.hash(password, 10);

  let franchise = await prisma.franchise.findFirst({ where: { name: "Franquicia 1" } });
  if (!franchise) {
    franchise = await prisma.franchise.create({ data: { name: "Franquicia 1" } });
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role, franchiseId: franchise.id },
    create: { email, name, passwordHash, role, franchiseId: franchise.id },
    select: { id: true, email: true, name: true, role: true, franchiseId: true }
  });

  console.log("SEED_OK", user);
  await prisma.$disconnect();}

main().catch((e) => { console.error(e); process.exit(1); });

