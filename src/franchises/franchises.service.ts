import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFranchiseDto } from './dto/create-franchise.dto';
import { JwtUser } from 'src/auth/types/jwt-user.type';
import { Role } from '@prisma/client/wasm';

@Injectable()
export class FranchisesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.franchise.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(franchiseId: string) {
    return this.prisma.franchise.findUnique({
      where: { id: franchiseId },
    });
  }

  create(dto: CreateFranchiseDto) {
    return this.prisma.franchise.create({
      data: {
        name: dto.name,
        // isActive lo pones solo si EXISTE en tu schema.prisma
        // isActive: true,
      },
    });
  }
  private isTopBoss(user: JwtUser) {
  return user.role === Role.OWNER || user.role === Role.PARTNER;
}

async deactivateFranchise(requester: JwtUser, franchiseId: string) {
  if (!franchiseId) throw new BadRequestException('franchiseId requerido');
  if (!this.isTopBoss(requester)) throw new ForbiddenException('No tienes permisos');

  const fr = await this.prisma.franchise.findUnique({
    where: { id: franchiseId },
    select: { id: true, isActive: true },
  });
  if (!fr) throw new NotFoundException('Franquicia no existe');

  await this.prisma.$transaction([
    this.prisma.franchise.update({
      where: { id: franchiseId },
      data: { isActive: false },
    }),
    this.prisma.user.updateMany({
      where: { franchiseId },
      data: { isActive: false },
    }),
    this.prisma.refreshToken.deleteMany({
      where: { user: { franchiseId } },
    }),
  ]);

  return { ok: true, franchiseId, isActive: false };
}

async activateFranchise(requester: JwtUser, franchiseId: string) {
  if (!franchiseId) throw new BadRequestException('franchiseId requerido');
  if (!this.isTopBoss(requester)) throw new ForbiddenException('No tienes permisos');

  const fr = await this.prisma.franchise.findUnique({
    where: { id: franchiseId },
    select: { id: true, isActive: true },
  });
  if (!fr) throw new NotFoundException('Franquicia no existe');

  await this.prisma.franchise.update({
    where: { id: franchiseId },
    data: { isActive: true },
  });

  return { ok: true, franchiseId, isActive: true };
}

async hardDeleteFranchiseIfPossible(requester: JwtUser, franchiseId: string) {
  if (!franchiseId) throw new BadRequestException('franchiseId requerido');
  if (!this.isTopBoss(requester)) throw new ForbiddenException('No tienes permisos');

  const fr = await this.prisma.franchise.findUnique({ where: { id: franchiseId }, select: { id: true } });
  if (!fr) throw new NotFoundException('Franquicia no existe');

  const salesCount = await this.prisma.sale.count({ where: { franchiseId } });
  if (salesCount > 0) {
    throw new BadRequestException('Esta franquicia tiene ventas. Usa DESACTIVAR (soft delete).');
  }

  await this.prisma.$transaction([
    this.prisma.chatRoom.deleteMany({ where: { franchiseId } }),
    this.prisma.product.deleteMany({ where: { franchiseId } }),
    this.prisma.refreshToken.deleteMany({ where: { user: { franchiseId } } }),
    this.prisma.user.deleteMany({ where: { franchiseId } }),
    this.prisma.dailyClose.deleteMany({ where: { franchiseId } }),
    this.prisma.franchise.delete({ where: { id: franchiseId } }),
  ]);

  return { ok: true, deletedFranchiseId: franchiseId };
}
async setActive(franchiseId: string, isActive: boolean) {
    // Verifica que exista
    const f = await this.prisma.franchise.findUnique({
      where: { id: franchiseId },
      select: { id: true },
    });

    if (!f) throw new NotFoundException('Franquicia no encontrada');

    // Actualiza franquicia
    const updated = await this.prisma.franchise.update({
      where: { id: franchiseId },
      data: { isActive },
      select: { id: true, name: true, isActive: true, createdAt: true },
    });

    // ✅ OPCIONAL (recomendado):
    // Si desactivas franquicia, también desactiva usuarios de esa franquicia
    // (para que no puedan entrar mientras esté apagada).
    if (!isActive) {
      await this.prisma.user.updateMany({
        where: { franchiseId },
        data: { isActive: false },
      });
    }

    return updated;
  }
  async remove(franchiseId: string, force = false) {
    const f = await this.prisma.franchise.findUnique({
      where: { id: franchiseId },
      select: { id: true, name: true },
    });
    if (!f) throw new NotFoundException('Franquicia no encontrada');

    if (!force) {
      const [usersCount, productsCount, salesCount] = await Promise.all([
        this.prisma.user.count({ where: { franchiseId } }),
        this.prisma.product.count({ where: { franchiseId } }),
        this.prisma.sale.count({ where: { franchiseId } }),
      ]);

      if (usersCount || productsCount || salesCount) {
        throw new BadRequestException(
          `No se puede eliminar: tiene users=${usersCount}, products=${productsCount}, sales=${salesCount}. ` +
          `Primero elimina/traspasa datos o usa ?force=true (borra TODO).`
        );
      }

      await this.prisma.franchise.delete({ where: { id: franchiseId } });
      return { ok: true, deletedFranchiseId: franchiseId };
    }

    // ✅ Si force=true se va por el camino “peligroso”
    return this.forceRemove(franchiseId);
  }

  private async forceRemove(franchiseId: string) {
    // ⚠️ BORRA TODO lo relacionado a esa franquicia (ventas, productos, chat, usuarios)
    return this.prisma.$transaction(async (tx) => {
      // 1) Chat rooms de la franquicia y sus mensajes/members
      const rooms = await tx.chatRoom.findMany({
        where: { franchiseId },
        select: { id: true },
      });
      const roomIds = rooms.map(r => r.id);

      if (roomIds.length) {
        await tx.chatMessage.deleteMany({ where: { roomId: { in: roomIds } } });
        await tx.chatRoomMember.deleteMany({ where: { roomId: { in: roomIds } } });
        await tx.chatRoom.deleteMany({ where: { id: { in: roomIds } } });
      }

      // 2) Ventas (SaleItem cae en cascada por saleId -> onDelete: Cascade en tu schema)
      await tx.sale.deleteMany({ where: { franchiseId } });

      // 3) Productos (ya sin SaleItem porque borramos sales)
      await tx.product.deleteMany({ where: { franchiseId } });

      // 4) Usuarios de la franquicia (y sus refresh tokens)
      const users = await tx.user.findMany({
        where: { franchiseId },
        select: { id: true },
      });
      const userIds = users.map(u => u.id);

      if (userIds.length) {
        await tx.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
        // OJO: si hay otros datos ligados a userId (audit logs, etc.) y no permiten null, ajusta aquí.
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      }

      // 5) Cierres diarios / auditoría si están ligados a franchiseId
      await tx.dailyClose.deleteMany({ where: { franchiseId } });
      await tx.auditLog.deleteMany({ where: { franchiseId } });

      // 6) Finalmente franquicia
      await tx.franchise.delete({ where: { id: franchiseId } });

      return { ok: true, deletedFranchiseId: franchiseId, forced: true };
    });
  }
}
