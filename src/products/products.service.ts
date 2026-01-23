import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Role } from '@prisma/client';


type ReqUser = {
  id: string;
  role: Role;
  franchiseId: string | null;
};


@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(user: ReqUser, franchiseIdFromQuery?: string, filters?: any) {
  const targetFranchiseId = this.resolveFranchise(user, franchiseIdFromQuery);

  const where: any = { franchiseId: targetFranchiseId };

  // filtros
  if (filters?.isActive !== undefined && filters.isActive !== '') {
    where.isActive = String(filters.isActive).toLowerCase() === 'true';
  } else {
    // default: activos
    where.isActive = true;
  }

  if (filters?.q) {
    where.name = { contains: String(filters.q), mode: 'insensitive' };
  }

  if (filters?.sku) {
    where.sku = { contains: String(filters.sku), mode: 'insensitive' };
  }

  if (filters?.minStock !== undefined && filters.minStock !== '') {
    const ms = Number(filters.minStock);
    if (!Number.isFinite(ms)) throw new BadRequestException('minStock inválido');
    where.stock = { gte: ms };
  }

  if (filters?.hasMissing !== undefined && filters.hasMissing !== '') {
    const hm = String(filters.hasMissing).toLowerCase() === 'true';
    if (hm) where.missing = { gt: 0 };
  }

  // paginación
  const page = Math.max(1, parseInt(filters?.page ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(filters?.pageSize ?? '20', 10) || 20));
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  // sort: createdAt_desc | createdAt_asc | name_asc | name_desc | stock_asc | stock_desc
  const sort = String(filters?.sort ?? 'createdAt_desc');
  const orderBy: any =
    sort === 'createdAt_asc' ? { createdAt: 'asc' } :
    sort === 'name_asc' ? { name: 'asc' } :
    sort === 'name_desc' ? { name: 'desc' } :
    sort === 'stock_asc' ? { stock: 'asc' } :
    sort === 'stock_desc' ? { stock: 'desc' } :
    { createdAt: 'desc' };

  const [total, items] = await this.prisma.$transaction([
    this.prisma.product.count({ where }),
    this.prisma.product.findMany({ where, orderBy, skip, take }),
  ]);

  return {
    page,
    pageSize,
    total,
    items,
  };
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
  async adjust(user: ReqUser, id: string, body: { stockDelta: number; reason?: string }) {
  if (user.role === 'SELLER') throw new ForbiddenException('No puedes ajustar inventario');

  const stockDelta = Number(body.stockDelta);
  if (!Number.isFinite(stockDelta) || !Number.isInteger(stockDelta) || stockDelta === 0) {
    throw new BadRequestException('stockDelta debe ser entero y diferente de 0');
  }

  const product = await this.prisma.product.findUnique({ where: { id } });
  if (!product) throw new NotFoundException('Producto no encontrado');

  // FRANCHISE_OWNER solo su franquicia
  if (user.role === 'FRANCHISE_OWNER') {
    if (!user.franchiseId || product.franchiseId !== user.franchiseId) {
      throw new ForbiddenException('No puedes ajustar productos de otra franquicia');
    }
  }

  // si es decremento, asegurar que haya stock suficiente
  if (stockDelta < 0 && product.stock < Math.abs(stockDelta)) {
    throw new ConflictException('No hay stock suficiente para disminuir');
  }

  // ✅ regla de surtido:
  // - si stockDelta > 0: stock += delta y missing -= min(missing, delta)
  // - si stockDelta < 0: stock -= abs(delta) y missing no cambia
  const data: any = {
    stock: { increment: stockDelta },
  };

  if (stockDelta > 0) {
    const decMissing = Math.min(product.missing ?? 0, stockDelta);
    if (decMissing > 0) {
      data.missing = { decrement: decMissing };
    }
  }

  return this.prisma.product.update({
    where: { id },
    data,
  });
}

}
