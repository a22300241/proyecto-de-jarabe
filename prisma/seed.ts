import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordPlain = '123456';
  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  // 1) Crear franquicia
  const franchise = await prisma.franchise.create({
    data: { name: 'Franquicia Demo' },
  });

  // 2) Crear usuarios demo
  await prisma.user.createMany({
    data: [
      {
        email: 'owner@demo.com',
        name: 'Owner Demo',
        passwordHash,
        role: Role.OWNER,
      },
      {
        email: 'partner@demo.com',
        name: 'Partner Demo',
        passwordHash,
        role: Role.PARTNER,
      },
      {
        email: 'franchise2@demo.com',
        name: 'Franchise Owner Demo',
        passwordHash,
        role: Role.FRANCHISE_OWNER,
        franchiseId: franchise.id,
      },
      {
        email: 'seller@demo.com',
        name: 'Seller Demo',
        passwordHash,
        role: Role.SELLER,
        franchiseId: franchise.id,
      },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Seed listo: usuarios demo creados con password 123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
