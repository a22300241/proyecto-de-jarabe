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

}
