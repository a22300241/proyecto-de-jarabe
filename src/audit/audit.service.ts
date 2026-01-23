import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

type ReqUser = {
  userId: string;
  role: Role | string;
  franchiseId?: string | null;
};

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  // ✅ ESCRIBIR LOG (lo que faltaba)
  async log(params: {
    user: ReqUser;
    action: string;      // ej: PRODUCT_CREATE, SALE_CREATE
    entity: string;      // ej: Product, Sale
    entityId?: string;
    franchiseId?: string | null;
    payload?: any;
  }) {
    const { user, action, entity, entityId, franchiseId, payload } = params;

    // Importante: role en Prisma es enum Role, así que casteamos solo si es válido
    const role =
      user.role === 'OWNER' || user.role === 'PARTNER' || user.role === 'FRANCHISE_OWNER' || user.role === 'SELLER'
        ? (user.role as Role)
        : null;

    return this.prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId: entityId ?? null,
        franchiseId: franchiseId ?? user.franchiseId ?? null,
        userId: user.userId ?? null,
        role,
        payload: payload ?? null,
      },
    });
  }

  // ✅ LEER LOGS (OWNER/PARTNER)
  async list(user: ReqUser, query: any) {
    if (user.role !== 'OWNER' && user.role !== 'PARTNER') {
      throw new ForbiddenException('Solo OWNER/PARTNER');
    }

    const page = Math.max(parseInt(query.page ?? '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt(query.pageSize ?? '20', 10), 1), 100);
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (query.franchiseId) where.franchiseId = String(query.franchiseId);
    if (query.userId) where.userId = String(query.userId);
    if (query.action) where.action = String(query.action);
    if (query.entity) where.entity = String(query.entity);

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { page, pageSize, total, items };
  }
}
