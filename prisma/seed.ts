import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('123456', 10);

  // 1) Franquicias (sin upsert por name porque name no es unique)
const f1 =
  (await prisma.franchise.findFirst({ where: { name: 'Franquicia Centro' } })) ??
  (await prisma.franchise.create({
    data: { name: 'Franquicia Centro', isActive: true },
  }));

const f2 =
  (await prisma.franchise.findFirst({ where: { name: 'Franquicia Norte' } })) ??
  (await prisma.franchise.create({
    data: { name: 'Franquicia Norte', isActive: true },
  }));


  // 2) Usuarios
  await prisma.user.upsert({
    where: { email: 'owner@demo.com' },
    update: {},
    create: {
      email: 'owner@demo.com',
      name: 'OWNER Demo',
      passwordHash: password,
      role: Role.OWNER,
      franchiseId: null,
    },
  });

  await prisma.user.upsert({
    where: { email: 'partner@demo.com' },
    update: {},
    create: {
      email: 'partner@demo.com',
      name: 'PARTNER Demo',
      passwordHash: password,
      role: Role.PARTNER,
      franchiseId: null,
    },
  });

  await prisma.user.upsert({
    where: { email: 'franchise1@demo.com' },
    update: {},
    create: {
      email: 'franchise1@demo.com',
      name: 'FRANCHISE_OWNER Centro',
      passwordHash: password,
      role: Role.FRANCHISE_OWNER,
      franchiseId: f1.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'seller1@demo.com' },
    update: {},
    create: {
      email: 'seller1@demo.com',
      name: 'SELLER Centro',
      passwordHash: password,
      role: Role.SELLER,
      franchiseId: f1.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'franchise2@demo.com' },
    update: {},
    create: {
      email: 'franchise2@demo.com',
      name: 'FRANCHISE_OWNER Norte',
      passwordHash: password,
      role: Role.FRANCHISE_OWNER,
      franchiseId: f2.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'seller2@demo.com' },
    update: {},
    create: {
      email: 'seller2@demo.com',
      name: 'SELLER Norte',
      passwordHash: password,
      role: Role.SELLER,
      franchiseId: f2.id,
    },
  });

  // 3) Productos demo
const products = [
  { franchiseId: f1.id, name: 'Coca 600ml', price: 1800, stock: 30 },
  { franchiseId: f1.id, name: 'Sabritas', price: 2200, stock: 20 },
  { franchiseId: f2.id, name: 'Agua 1L', price: 1500, stock: 40 },
];

for (const p of products) {
  const exists = await prisma.product.findFirst({
    where: { franchiseId: p.franchiseId, name: p.name },
  });
  if (!exists) await prisma.product.create({ data: p });
}


  console.log('✅ Seed listo');
  console.log('Usuarios demo (password: 123456):');
  console.log('owner@demo.com');
  console.log('partner@demo.com');
  console.log('franchise1@demo.com');
  console.log('seller1@demo.com');
  console.log('franchise2@demo.com');
  console.log('seller2@demo.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
