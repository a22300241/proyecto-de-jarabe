// scripts/bootstrap-owner.ts
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'owner@demo.com';
  const password = '123456';
  const name = 'Owner Master';

  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,     // ✅ usa el nombre real de tu campo
        role: 'OWNER',    // ✅ o el role que manejes en tu proyecto
        // ✅ NO isActive
      },
    });
    console.log('✅ OWNER creado:', email, password);
  } else {
    await prisma.user.update({
      where: { email },
      data: {
        name,
        passwordHash,
        role: 'OWNER',
        // ✅ NO isActive
      },
    });
    console.log('✅ OWNER actualizado:', email, password);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
