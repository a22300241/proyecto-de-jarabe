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
import { Role, SaleStatus } from '@prisma/client'; // ✅ IMPORTA ENUMS

type InputItem = { productId: string; qty: number };

// ✅ AHORA role ES enum Role, NO string
type JwtUser = {
  userId: string;
  role: Role;
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
      const products = await tx.product.findMany({
        where: { franchiseId, id: { in: items.map((i) => i.productId) } },
        select: { id: true, price: true, stock: true, isActive: true },
      });

      if (products.length !== items.length) {
        throw new BadRequestException('Producto(s) no existen en esta franquicia');
      }

      for (const p of products) {
        if (!p.isActive) {
          throw new BadRequestException(`Producto inactivo: ${p.id}`);
        }
      }

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
            missing: { increment: it.qty },
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

      // ✅ AUDIT LOG (solo último 4)
      await this.audit.log({
        user: { userId: sellerId, role: Role.SELLER, franchiseId }, // ✅ Role.SELLER
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
    const isSuperAdmin = user.role === Role.OWNER || user.role === Role.PARTNER;
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

    const isSuperAdmin = user.role === Role.OWNER || user.role === Role.PARTNER;

    if (!isSuperAdmin) {
      if (!user.franchiseId || sale.franchiseId !== user.franchiseId) {
        throw new ForbiddenException('No puedes ver ventas de otra franquicia');
      }
    }

    return sale;
  }

  // =========================
  // SALES SUMMARY
  // =========================
  async salesSummary(query: SalesQueryDto, user: JwtUser) {
    const isSuperAdmin = user.role === Role.OWNER || user.role === Role.PARTNER;
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

  // =========================
  // CANCEL SALE (reversa inventario + audit)
  // =========================
  async cancelSale(saleId: string, user: JwtUser, reason: string | null) {
    const isSuperAdmin = user.role === Role.OWNER || user.role === Role.PARTNER;

    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    if (!isSuperAdmin) {
      if (!user.franchiseId || sale.franchiseId !== user.franchiseId) {
        throw new ForbiddenException('No puedes cancelar ventas de otra franquicia');
      }
    }

    if (sale.status !== SaleStatus.COMPLETED) {
      throw new BadRequestException('Solo puedes cancelar ventas COMPLETED');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const it of sale.items) {
        // ✅ evita missing negativo
        await tx.product.update({
          where: { id: it.productId },
          data: {
            stock: { increment: it.qty },
            missing: { decrement: it.qty },
          },
        });
      }

      const updated = await tx.sale.update({
        where: { id: saleId },
        data: {
          status: SaleStatus.CANCELED, // ✅ enum
          canceledAt: new Date(),
          canceledReason: reason ?? null,
          canceledById: user.userId,
        },
        include: { items: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'SALE_CANCEL',
          entity: 'Sale',
          entityId: saleId,
          franchiseId: sale.franchiseId,
          userId: user.userId,
          role: user.role, // ✅ ahora es Role
          payload: { reason },
        },
      });

      return updated;
    });
  }

  // =========================
  // REFUND SALE (reversa inventario + audit)
  // =========================
  async refundSale(saleId: string, user: JwtUser, reason: string | null) {
    const isSuperAdmin = user.role === Role.OWNER || user.role === Role.PARTNER;

    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    if (!isSuperAdmin) {
      if (!user.franchiseId || sale.franchiseId !== user.franchiseId) {
        throw new ForbiddenException('No puedes reembolsar ventas de otra franquicia');
      }
    }

    if (sale.status !== SaleStatus.COMPLETED) {
      throw new BadRequestException('Solo puedes reembolsar ventas COMPLETED');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const it of sale.items) {
        await tx.product.update({
          where: { id: it.productId },
          data: {
            stock: { increment: it.qty },
            missing: { decrement: it.qty },
          },
        });
      }

      const updated = await tx.sale.update({
        where: { id: saleId },
        data: {
          status: SaleStatus.REFUNDED, // ✅ enum
          refundedAt: new Date(),
          refundedReason: reason ?? null,
          refundedById: user.userId,
          refundTotal: sale.total,
        },
        include: { items: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'SALE_REFUND',
          entity: 'Sale',
          entityId: saleId,
          franchiseId: sale.franchiseId,
          userId: user.userId,
          role: user.role, // ✅ ahora es Role
          payload: { reason, refundTotal: sale.total },
        },
      });

      return updated;
    });
  }
}
