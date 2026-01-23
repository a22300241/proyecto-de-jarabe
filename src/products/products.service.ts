import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Role } from '@prisma/client';

type ReqUser = {
  id: string;
  role: string;
  franchiseId: string | null;
};

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(user: ReqUser, franchiseIdFromQuery?: string) {
    const targetFranchiseId = this.resolveFranchise(user, franchiseIdFromQuery);

    return this.prisma.product.findMany({
      where: { franchiseId: targetFranchiseId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(user: ReqUser, id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    if (user.role === 'FRANCHISE_OWNER' || user.role === 'SELLER') {
      if (!user.franchiseId || product.franchiseId !== user.franchiseId) {
        throw new ForbiddenException('No puedes acceder a este producto');
      }
    }

    return product;
  }

  async create(user: ReqUser, body: any) {
    if (user.role === 'SELLER') throw new ForbiddenException('No puedes crear productos');

    let franchiseId = body.franchiseId as string | undefined;

    if (user.role === 'FRANCHISE_OWNER') {
      if (!user.franchiseId) throw new ForbiddenException('Tu usuario no tiene franquicia asignada');
      franchiseId = user.franchiseId;
    }

    if ((user.role === 'OWNER' || user.role === 'PARTNER') && !franchiseId) {
      throw new ForbiddenException('franchiseId es requerido para crear producto');
    }

    const created = await this.prisma.product.create({
      data: {
        franchiseId: franchiseId!,
        name: body.name,
        price: body.price,
        stock: body.stock ?? 0,
        missing: body.missing ?? 0,
        isActive: body.isActive ?? true,
        sku: body.sku ?? null,
      },
    });

    // ✅ AUDIT LOG
    await this.audit.log({
      user: { userId: user.id, role: user.role as Role, franchiseId: user.franchiseId },
      action: 'PRODUCT_CREATE',
      entity: 'Product',
      entityId: created.id,
      franchiseId: created.franchiseId,
      payload: { name: created.name, price: created.price, stock: created.stock, sku: created.sku },
    });

    return created;
  }

  async update(user: ReqUser, id: string, body: any) {
    if (user.role === 'SELLER') throw new ForbiddenException('No puedes actualizar productos');

    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    if (user.role === 'FRANCHISE_OWNER') {
      if (!user.franchiseId || product.franchiseId !== user.franchiseId) {
        throw new ForbiddenException('No puedes modificar este producto');
      }
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        price: body.price ?? undefined,
        stock: body.stock ?? undefined,
        missing: body.missing ?? undefined,
        isActive: body.isActive ?? undefined,
        sku: body.sku ?? undefined,
      },
    });

    // (Opcional pero recomendado)
    await this.audit.log({
      user: { userId: user.id, role: user.role as Role, franchiseId: user.franchiseId },
      action: 'PRODUCT_UPDATE',
      entity: 'Product',
      entityId: updated.id,
      franchiseId: updated.franchiseId,
      payload: { changes: body },
    });

    return updated;
  }

  async restock(user: ReqUser, id: string, qty: number) {
    if (user.role === 'SELLER') throw new ForbiddenException('No puedes surtir productos');

    if (!Number.isInteger(qty) || qty <= 0) {
      throw new BadRequestException('qty inválido (entero > 0)');
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id },
        select: { id: true, franchiseId: true, stock: true, missing: true, name: true },
      });

      if (!product) throw new NotFoundException('Producto no encontrado');

      if (user.role === 'FRANCHISE_OWNER') {
        if (!user.franchiseId || product.franchiseId !== user.franchiseId) {
          throw new ForbiddenException('No puedes surtir productos de otra franquicia');
        }
      }

      const currentMissing = product.missing ?? 0;
      const newMissing = Math.max(0, currentMissing - qty);

      const updated = await tx.product.update({
        where: { id },
        data: {
          stock: { increment: qty },
          missing: newMissing,
        },
        select: { id: true, name: true, stock: true, missing: true, franchiseId: true },
      });

      // ✅ AUDIT LOG (fuera del tx no se puede aquí; PERO sí podemos loguear después retornando y haciendo log fuera.
      // Para no reestructurar tu flujo, logueamos aquí con prisma "global" al final del método en el controller,
      // pero si quieres hacerlo aquí mismo, lo hacemos sin transacción:)
      await this.audit.log({
        user: { userId: user.id, role: user.role as Role, franchiseId: user.franchiseId },
        action: 'PRODUCT_RESTOCK',
        entity: 'Product',
        entityId: updated.id,
        franchiseId: updated.franchiseId,
        payload: {
          qtyAdded: qty,
          before: { stock: product.stock, missing: currentMissing },
          after: { stock: updated.stock, missing: updated.missing },
        },
      });

      return {
        ok: true,
        message: 'Producto surtido',
        qtyAdded: qty,
        before: { stock: product.stock, missing: currentMissing },
        after: { stock: updated.stock, missing: updated.missing },
        product: updated,
      };
    });
  }

  async remove(user: ReqUser, id: string) {
    if (user.role === 'SELLER') throw new ForbiddenException('No puedes eliminar productos');

    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    if (user.role === 'FRANCHISE_OWNER') {
      if (!user.franchiseId || product.franchiseId !== user.franchiseId) {
        throw new ForbiddenException('No puedes eliminar este producto');
      }
    }

    const deleted = await this.prisma.product.delete({ where: { id } });

    // (Opcional pero recomendado)
    await this.audit.log({
      user: { userId: user.id, role: user.role as Role, franchiseId: user.franchiseId },
      action: 'PRODUCT_DELETE',
      entity: 'Product',
      entityId: deleted.id,
      franchiseId: deleted.franchiseId,
      payload: { name: deleted.name, sku: deleted.sku },
    });

    return deleted;
  }

  private resolveFranchise(user: ReqUser, franchiseIdFromQuery?: string) {
    if (user.role === 'SELLER' || user.role === 'FRANCHISE_OWNER') {
      if (!user.franchiseId) throw new ForbiddenException('Tu usuario no tiene franquicia asignada');
      if (franchiseIdFromQuery && franchiseIdFromQuery !== user.franchiseId) {
        throw new ForbiddenException('No puedes consultar otra franquicia');
      }
      return user.franchiseId;
    }

    if (!franchiseIdFromQuery) {
      throw new ForbiddenException('Debes enviar franchiseId en query');
    }
    return franchiseIdFromQuery;
  }
}
