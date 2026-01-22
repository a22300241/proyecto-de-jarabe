// src/sales/sales.service.ts
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesQueryDto } from './dto/sales-query.dto';

type InputItem = { productId: string; qty: number };

type JwtUser = {
  userId: string;          // ✅ antes sub
  role: string;
  franchiseId?: string | null;
};


@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  // =========================
  // CREATE SALE (YA FUNCIONA)
  // =========================
  async createSale(franchiseId: string, sellerId: string, items: InputItem[]) {
    if (!franchiseId) throw new BadRequestException('franchiseId requerido');
    if (!sellerId) throw new BadRequestException('sellerId requerido');
    if (!items?.length) throw new BadRequestException('items requerido');

    for (const it of items) {
      if (!it.productId) throw new BadRequestException('productId requerido');
      if (!Number.isInteger(it.qty) || it.qty <= 0) {
        throw new BadRequestException('qty inválido (entero > 0)');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // validar productos y obtener precios/stock
      const products = await tx.product.findMany({
        where: { franchiseId, id: { in: items.map((i) => i.productId) } },
        select: { id: true, price: true, stock: true },
      });

      if (products.length !== items.length) {
        throw new BadRequestException('Producto(s) no existen en esta franquicia');
      }

      // descontar stock
      for (const it of items) {
        const updated = await tx.product.updateMany({
          where: { id: it.productId, franchiseId, stock: { gte: it.qty } },
          data: { stock: { decrement: it.qty } },
        });
        if (updated.count !== 1) {
          throw new ConflictException(`Stock insuficiente para ${it.productId}`);
        }
      }

      const priceMap = new Map(products.map((p) => [p.id, p.price]));

      // OJO: tu schema pide qty/price
      const saleItems = items.map((it) => {
        const price = priceMap.get(it.productId);
        if (price === undefined) throw new BadRequestException('Producto inválido');

        return {
          product: { connect: { id: it.productId } },
          qty: it.qty,
          price,
          subtotal: price * it.qty,
        };
      });

      const total = saleItems.reduce((acc, i) => acc + i.subtotal, 0);

      const sale = await tx.sale.create({
        data: {
          franchiseId,
          sellerId,
          cardNumber: 'N/A',
          total,
          items: { create: saleItems },
        },
        include: { items: true },
      });

      return sale;
    });
  }

  // =========================
  // LIST SALES
  // =========================
  async listSales(query: SalesQueryDto, user: JwtUser) {
    const role = user.role;
    const isAdmin = role === 'OWNER' || role === 'PARTNER';

    // franquicia objetivo:
    // - admin puede pasar franchiseId por query
    // - no-admin usa su franchiseId del JWT
    const franchiseId = isAdmin ? (query.franchiseId ?? user.franchiseId) : user.franchiseId;

    if (!franchiseId) {
      throw new ForbiddenException('Este usuario no tiene franquicia asignada');
    }

    const where: any = { franchiseId };

    if (query.sellerId) where.sellerId = query.sellerId;

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const sales = await this.prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { product: true } },
        seller: { select: { id: true, name: true, email: true, role: true } },
        franchise: { select: { id: true, name: true } },
      },
    });

    return sales;
  }

  // =========================
  // GET SALE BY ID
  // =========================
  async getSaleById(id: string, user: JwtUser) {
    if (!id) throw new BadRequestException('id requerido');

    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        seller: { select: { id: true, name: true, email: true, role: true } },
        franchise: { select: { id: true, name: true } },
      },
    });

    if (!sale) throw new NotFoundException('Venta no encontrada');

    const role = user.role;
    const isAdmin = role === 'OWNER' || role === 'PARTNER';

    // si no es admin, debe pertenecer a su franquicia
    if (!isAdmin) {
      if (!user.franchiseId || sale.franchiseId !== user.franchiseId) {
        throw new ForbiddenException('No puedes ver ventas de otra franquicia');
      }
    }

    return sale;
  }
}
