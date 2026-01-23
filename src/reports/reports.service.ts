// src/reports/reports.service.ts
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function dayStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function dayEnd(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private resolveFranchiseId(user: any, q: any) {
    const isSuper = user.role === 'OWNER' || user.role === 'PARTNER';

    if (isSuper) {
      if (!q.franchiseId) throw new ForbiddenException('Debes enviar franchiseId en query');
      return q.franchiseId;
    }

    if (!user.franchiseId) throw new ForbiddenException('Tu usuario no tiene franquicia asignada');
    return user.franchiseId;
  }

  async dailyClose(user: any, q: any) {
    const franchiseId = this.resolveFranchiseId(user, q);

    const day = q.day ? new Date(q.day) : new Date();
    if (isNaN(day.getTime())) throw new BadRequestException('day inválido (usa YYYY-MM-DD)');

    const from = dayStart(day);
    const to = dayEnd(day);

    const saleWhere: any = { franchiseId, createdAt: { gte: from, lte: to } };

    // ventas completadas
    const aggCompleted = await this.prisma.sale.aggregate({
      where: { ...saleWhere, status: 'COMPLETED' },
      _count: { _all: true },
      _sum: { total: true },
    });

    // devoluciones/cancelaciones
    const aggRefund = await this.prisma.sale.aggregate({
      where: { ...saleWhere, status: 'REFUNDED' },
      _count: { _all: true },
      _sum: { refundTotal: true },
    });

    const aggCancel = await this.prisma.sale.aggregate({
      where: { ...saleWhere, status: 'CANCELED' },
      _count: { _all: true },
    });

    // piezas vendidas (solo COMPLETED)
    const aggItems = await this.prisma.saleItem.aggregate({
      where: {
        sale: { ...saleWhere, status: 'COMPLETED' },
      },
      _sum: { qty: true },
    });

    // TOP productos del día (qty + revenue)
    // Nota: subtotal existe en tu SaleItem
    const top = await this.prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: { ...saleWhere, status: 'COMPLETED' } },
      _sum: { qty: true, subtotal: true },
      orderBy: { _sum: { qty: 'desc' } },
      take: 10,
    });

    // traer nombres
    const productIds = top.map(t => t.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true },
    });
    const map = new Map(products.map(p => [p.id, p]));

    const topProducts = top.map(t => ({
      productId: t.productId,
      name: map.get(t.productId)?.name ?? 'N/A',
      sku: map.get(t.productId)?.sku ?? null,
      qty: t._sum.qty ?? 0,
      revenue: t._sum.subtotal ?? 0,
    }));

    return {
      franchiseId,
      day: from.toISOString().slice(0, 10),
      salesCompleted: aggCompleted._count._all,
      totalSold: aggCompleted._sum.total ?? 0,
      itemsQty: aggItems._sum.qty ?? 0,
      refundsCount: aggRefund._count._all,
      refundsTotal: aggRefund._sum.refundTotal ?? 0,
      cancelsCount: aggCancel._count._all,
      topProducts,
    };
  }

  async closeDay(user: any, body: { franchiseId?: string; day?: string }) {
    const isSuper = user.role === 'OWNER' || user.role === 'PARTNER';

    let franchiseId = body.franchiseId;
    if (!isSuper) franchiseId = user.franchiseId;
    if (!franchiseId) throw new ForbiddenException('franchiseId requerido');

    const d = body.day ? new Date(body.day) : new Date();
    if (isNaN(d.getTime())) throw new BadRequestException('day inválido');

    const day = dayStart(d);

    return this.prisma.dailyClose.upsert({
      where: { franchiseId_day: { franchiseId, day } },
      update: { closedAt: new Date(), closedById: user.userId },
      create: { franchiseId, day, closedById: user.userId },
    });
  }

  async globalSummary(q: any) {
    const from = q.from ? new Date(q.from) : null;
    const to = q.to ? new Date(q.to) : null;

    const where: any = { status: 'COMPLETED' };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    // Totales por franquicia
    const byFranchise = await this.prisma.sale.groupBy({
      by: ['franchiseId'],
      where,
      _count: { _all: true },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
    });

    const franchises = await this.prisma.franchise.findMany({
      where: { id: { in: byFranchise.map(x => x.franchiseId) } },
      select: { id: true, name: true },
    });
    const fMap = new Map(franchises.map(f => [f.id, f.name]));

    // Ranking productos global
    const topProducts = await this.prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: where },
      _sum: { qty: true, subtotal: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: 10,
    });

    const productIds = topProducts.map(t => t.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true },
    });
    const pMap = new Map(products.map(p => [p.id, p]));

    return {
      from: q.from ?? null,
      to: q.to ?? null,
      byFranchise: byFranchise.map(x => ({
        franchiseId: x.franchiseId,
        franchiseName: fMap.get(x.franchiseId) ?? 'N/A',
        salesCount: x._count._all,
        totalSold: x._sum.total ?? 0,
      })),
      topProducts: topProducts.map(t => ({
        productId: t.productId,
        name: pMap.get(t.productId)?.name ?? 'N/A',
        sku: pMap.get(t.productId)?.sku ?? null,
        qty: t._sum.qty ?? 0,
        revenue: t._sum.subtotal ?? 0,
      })),
    };
  }
}
