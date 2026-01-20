import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ReqUser = {
  id: string;
  role: string;
  franchiseId: string | null;
};

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  // ⚠️ En Nest real, aquí necesitamos el user. Lo obtendremos desde Request (abajo te doy cómo).
  // Para que esto funcione hoy mismo, vamos a leerlo desde un "context" simple usando AsyncLocalStorage
  // ...pero eso sería más grande. Entonces: lo correcto es pasar el user desde el controller con @Req.

  // ✅ SOLUCIÓN SIMPLE: vamos a hacer los métodos esperando que controller les pase user.
  // (Te doy abajo el controller correcto con @Req, más limpio y real.)

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

    // FRANCHISE_OWNER/SELLER solo su franquicia
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

  return this.prisma.product.create({
    data: {
      franchiseId: franchiseId!,          // 👈 ya resuelto arriba
      name: body.name,
      price: body.price,
      stock: body.stock ?? 0,
      isActive: body.isActive ?? true,    // ✅
      sku: body.sku ?? null,
    },
  });
}


  async update(user: ReqUser, id: string, body: any) {
    // SELLER no puede actualizar
    if (user.role === 'SELLER') throw new ForbiddenException('No puedes actualizar productos');

    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    // FRANCHISE_OWNER solo su franquicia
    if (user.role === 'FRANCHISE_OWNER') {
      if (!user.franchiseId || product.franchiseId !== user.franchiseId) {
        throw new ForbiddenException('No puedes modificar este producto');
      }
    }

    // OWNER/PARTNER pueden todo

    return this.prisma.product.update({
  where: { id },
  data: {
    name: body.name ?? undefined,
    price: body.price ?? undefined,
    stock: body.stock ?? undefined,
    isActive: body.isActive ?? undefined, // ✅
    sku: body.sku ?? undefined,
  },
});

  }

  async remove(user: ReqUser, id: string) {
    // SELLER no puede eliminar
    if (user.role === 'SELLER') throw new ForbiddenException('No puedes eliminar productos');

    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    if (user.role === 'FRANCHISE_OWNER') {
      if (!user.franchiseId || product.franchiseId !== user.franchiseId) {
        throw new ForbiddenException('No puedes eliminar este producto');
      }
    }

    return this.prisma.product.delete({ where: { id } });
  }

  private resolveFranchise(user: ReqUser, franchiseIdFromQuery?: string) {
    // SELLER y FRANCHISE_OWNER: solo su franchiseId, e ignoran query
    if (user.role === 'SELLER' || user.role === 'FRANCHISE_OWNER') {
      if (!user.franchiseId) throw new ForbiddenException('Tu usuario no tiene franquicia asignada');
      // si mandó query diferente => 403
      if (franchiseIdFromQuery && franchiseIdFromQuery !== user.franchiseId) {
        throw new ForbiddenException('No puedes consultar otra franquicia');
      }
      return user.franchiseId;
    }

    // OWNER/PARTNER: si manda query, se usa, si no manda, error (para evitar listar TODO sin querer)
    if (!franchiseIdFromQuery) {
      throw new ForbiddenException('Debes enviar franchiseId en query');
    }
    return franchiseIdFromQuery;
  }
}
