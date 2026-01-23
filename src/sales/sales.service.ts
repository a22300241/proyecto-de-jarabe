// src/sales/sales.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesQueryDto } from './dto/sales-query.dto';
import { AuditService } from '../audit/audit.service';

type InputItem = { productId: string; qty: number };

type JwtUser = {
  userId: string;
  role: string;
  franchiseId?: string | null;
};

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // =========================
  // CREATE SALE (cardNumber obligatorio)
  // =========================
  async createSale(
    franchiseId: string,
    sellerId: string,
    items: InputItem[],
    cardNumber: string,
  ) {
    if (!franchiseId) throw new BadRequestException('franchiseId requerido');
    if (!sellerId) throw new BadRequestException('sellerId requerido');
    if (!items?.length) throw new BadRequestException('items requerido');

    // ✅ tarjeta obligatoria (si NO quieres validar formato, borra el regex y listo)
    if (!cardNumber) throw new BadRequestException('cardNumber requerido');
    if (!/^\d{12,19}$/.test(cardNumber)) {
      throw new BadRequestException('cardNumber inválido (12-19 dígitos)');
    }

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
        select: { id: true, price: true, stock: true, isActive: true },
      });

      if (products.length !== items.length) {
        throw new BadRequestException('Producto(s) no existen en esta franquicia');
      }

      // validar activos
      for (const p of products) {
        if (!p.isActive) {
          throw new BadRequestException(`Producto inactivo: ${p.id}`);
        }
      }

      // ✅ descontar stock + ✅ subir faltantes (missing)
      for (const it of items) {
        const updated = await tx.product.updateMany({
          where: {
            id: it.productId,
            franchiseId,
            isActive: true,
            stock: { gte: it.qty },
          },
          data: {
            stock: { decrement: it.qty },
            missing: { increment: it.qty }, // ✅ FALTANTES
          },
        });

        if (updated.count !== 1) {
          throw new ConflictException(`Stock insuficiente para ${it.productId}`);
        }
      }

      const priceMap = new Map(products.map((p) => [p.id, p.price]));

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
          cardNumber,
          total,
          items: { create: saleItems },
        },
        include: { items: true },
      });

      // ✅ AUDIT LOG (importante: fuera del tx "tx", usamos this.audit (que usa PrismaService normal))
      // Está bien porque solo es log; si quisieras 100% atomicidad tendrías que loguear con tx también,
      // pero para tu entrega esto es perfecto y estable.
      await this.audit.log({
        user: { userId: sellerId, role: 'SELLER', franchiseId },
        action: 'SALE_CREATE',
        entity: 'Sale',
        entityId: sale.id,
        franchiseId,
        payload: {
          total: sale.total,
          items: items.map((i) => ({ productId: i.productId, qty: i.qty })),
          cardLast4: String(cardNumber).slice(-4),
        },
      });

      return sale;
    });
  }

  // =========================
  // LIST SALES
  // =========================
  async listSales(query: SalesQueryDto, user: JwtUser) {
    const isSuperAdmin = user.role === 'OWNER' || user.role === 'PARTNER';
    const franchiseId = isSuperAdmin ? (query.franchiseId ?? user.franchiseId) : user.franchiseId;

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

    return this.prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { product: true } },
        seller: { select: { id: true, name: true, email: true, role: true } },
        franchise: { select: { id: true, name: true } },
      },
    });
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

    const isSuperAdmin = user.role === 'OWNER' || user.role === 'PARTNER';

    if (!isSuperAdmin) {
      if (!user.franchiseId || sale.franchiseId !== user.franchiseId) {
        throw new ForbiddenException('No puedes ver ventas de otra franquicia');
      }
    }

    return sale;
  }

  // =========================
  // SALES SUMMARY
  // Devuelve: { franchiseId, from, to, sellerId, salesCount, totalSold, itemsQty }
  // =========================
  async salesSummary(query: SalesQueryDto, user: JwtUser) {
    const isSuperAdmin = user.role === 'OWNER' || user.role === 'PARTNER';
    const franchiseId = isSuperAdmin ? (query.franchiseId ?? user.franchiseId) : user.franchiseId;

    if (!franchiseId) {
      throw new ForbiddenException('Este usuario no tiene franquicia asignada');
    }

    const saleWhere: any = { franchiseId };

    if (query.sellerId) saleWhere.sellerId = query.sellerId;

    if (query.from || query.to) {
      saleWhere.createdAt = {};
      if (query.from) saleWhere.createdAt.gte = new Date(query.from);
      if (query.to) saleWhere.createdAt.lte = new Date(query.to);
    }

    const aggSales = await this.prisma.sale.aggregate({
      where: saleWhere,
      _count: { _all: true },
      _sum: { total: true },
    });

    const aggItems = await this.prisma.saleItem.aggregate({
      where: { sale: saleWhere },
      _sum: { qty: true },
    });

    return {
      franchiseId,
      from: query.from ?? null,
      to: query.to ?? null,
      sellerId: query.sellerId ?? null,
      salesCount: aggSales._count._all,
      totalSold: aggSales._sum.total ?? 0,
      itemsQty: aggItems._sum.qty ?? 0,
    };
  }
}
