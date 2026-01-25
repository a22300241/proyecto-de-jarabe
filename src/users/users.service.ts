import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcryptjs from 'bcryptjs';
import { Role } from '@prisma/client';

type JwtUser = { userId: string; role: Role; franchiseId?: string | null };



@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  

  private isAdmin(role: JwtUser['role']) {
    return role === 'OWNER' || role === 'PARTNER';
  }
  
 // ✅ ESTE ES EL MÉTODO QUE TE FALTA
  async findByEmailWithPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        franchiseId: true,
        passwordHash: true, // 👈 importante para login
        isActive: true, // ✅ NUEVO
      },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  // ✅ Crear usuario con reglas del POS
  async createUser(dto: CreateUserDto, actor: JwtUser) {
    // 1) reglas por rol del que crea
    if (actor.role === 'SELLER') {
      throw new ForbiddenException('SELLER no puede crear usuarios');
    }

    

    // 2) normalizar/validar role destino
    const targetRole = dto.role;

    // 3) decidir franchiseId final
    let franchiseIdToSet: string | null = null;

    if (this.isAdmin(actor.role)) {
      // OWNER/PARTNER pueden crear cualquier rol
      if (targetRole === 'OWNER' || targetRole === 'PARTNER') {
        franchiseIdToSet = null; // admins no necesitan franquicia
      } else {
        // FRANCHISE_OWNER o SELLER => requieren franchiseId
        if (!dto.franchiseId) {
          throw new BadRequestException('franchiseId requerido para FRANCHISE_OWNER/SELLER');
        }
        franchiseIdToSet = dto.franchiseId;
      }
    } else {
      // FRANCHISE_OWNER: solo puede crear SELLER y solo en su franquicia
      if (actor.role !== 'FRANCHISE_OWNER') {
        throw new ForbiddenException('No autorizado');
      }
      if (targetRole !== 'SELLER') {
        throw new ForbiddenException('FRANCHISE_OWNER solo puede crear SELLER');
      }
      if (!actor.franchiseId) {
        throw new ForbiddenException('Este usuario no tiene franquicia asignada');
      }
      franchiseIdToSet = actor.franchiseId;
    }

    // 4) si hay franchiseId, valida que exista
    if (franchiseIdToSet) {
      const fr = await this.prisma.franchise.findUnique({ where: { id: franchiseIdToSet }, select: { id: true } });
      if (!fr) throw new BadRequestException('franchiseId no existe');
    }

    // 5) hash password
    const passwordHash = await bcryptjs.hash(dto.password, 10);

    // 6) crear (email UNIQUE en DB normalmente)
    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: targetRole,
        franchiseId: franchiseIdToSet,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        franchiseId: true,
        createdAt: true,
      },
    });
  }

  // ✅ Listado simple (para probar rápido / panel)
  async listUsers(actor: JwtUser, franchiseId?: string) {
    const isAdmin = this.isAdmin(actor.role);

    // SELLER puede ver solo su franquicia (lectura)
    if (actor.role === 'SELLER') {
      if (!actor.franchiseId) throw new ForbiddenException('Este usuario no tiene franquicia asignada');
      return this.prisma.user.findMany({
        where: { franchiseId: actor.franchiseId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, name: true, role: true, franchiseId: true, createdAt: true },
      });
    }

    // FRANCHISE_OWNER ve solo su franquicia
    if (!isAdmin) {
      if (!actor.franchiseId) throw new ForbiddenException('Este usuario no tiene franquicia asignada');
      return this.prisma.user.findMany({
        where: { franchiseId: actor.franchiseId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, name: true, role: true, franchiseId: true, createdAt: true },
      });
    }

    // OWNER/PARTNER: si pasan franchiseId filtra, si no trae todo
    return this.prisma.user.findMany({
      where: franchiseId ? { franchiseId } : {},
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, name: true, role: true, franchiseId: true, createdAt: true },
    });
  }
  // ============================
// Helpers de permisos
// ============================
private isTopBoss(user: JwtUser) {
  return user.role === Role.OWNER || user.role === Role.PARTNER;
}

private isFranchiseOwner(user: JwtUser) {
  return user.role === Role.FRANCHISE_OWNER;
}

private assertCanManageUser(requester: JwtUser, target: { role: Role; franchiseId: string | null }) {
  const isBoss = this.isTopBoss(requester);
  const isFrOwner = this.isFranchiseOwner(requester);

  if (!isBoss && !isFrOwner) {
    throw new ForbiddenException('No tienes permisos para administrar usuarios');
  }

  if (isFrOwner) {
    if (!requester.franchiseId) throw new ForbiddenException('Usuario sin franquicia asignada');
    if (target.role !== Role.SELLER) throw new ForbiddenException('Solo puedes administrar SELLER');
    if (target.franchiseId !== requester.franchiseId) {
      throw new ForbiddenException('Solo puedes administrar SELLER de tu franquicia');
    }
  }
}

// ============================
// DESACTIVAR usuario (soft) ✅
// ============================
async deactivateUser(requester: JwtUser, userId: string) {
  if (!userId) throw new BadRequestException('userId requerido');

  const target = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, franchiseId: true, isActive: true },
  });
  if (!target) throw new NotFoundException('Usuario no existe');

  if (userId === requester.userId) {
    throw new BadRequestException('No puedes desactivarte a ti mismo');
  }

  this.assertCanManageUser(requester, {
    role: target.role,
    franchiseId: target.franchiseId ?? null,
  });

  await this.prisma.$transaction([
    this.prisma.refreshToken.deleteMany({ where: { userId: target.id } }),
    this.prisma.user.update({
      where: { id: target.id },
      data: {
        isActive: false,
        // deletedAt: new Date(), // si lo tienes en prisma
      },
    }),
  ]);

  return { ok: true, userId: target.id, isActive: false };
}

// ============================
// ACTIVAR usuario ✅
// ============================
async activateUser(requester: JwtUser, userId: string) {
  if (!userId) throw new BadRequestException('userId requerido');

  const target = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, franchiseId: true, isActive: true },
  });
  if (!target) throw new NotFoundException('Usuario no existe');

  this.assertCanManageUser(requester, {
    role: target.role,
    franchiseId: target.franchiseId ?? null,
  });

  await this.prisma.user.update({
    where: { id: target.id },
    data: {
      isActive: true,
      // deletedAt: null,
    },
  });

  return { ok: true, userId: target.id, isActive: true };
}

// ============================
// HARD DELETE usuario (si NO tiene ventas) ⚠️
// ============================
async hardDeleteUserIfPossible(requester: JwtUser, userId: string) {
  if (!userId) throw new BadRequestException('userId requerido');

  const target = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, franchiseId: true },
  });
  if (!target) throw new NotFoundException('Usuario no existe');

  this.assertCanManageUser(requester, { role: target.role, franchiseId: target.franchiseId ?? null });

  const salesCount = await this.prisma.sale.count({ where: { sellerId: target.id } });
  if (salesCount > 0) {
    throw new BadRequestException('Este usuario tiene ventas. Usa DESACTIVAR (soft delete).');
  }

  await this.prisma.$transaction([
    this.prisma.refreshToken.deleteMany({ where: { userId: target.id } }),
    this.prisma.chatRoomMember.deleteMany({ where: { userId: target.id } }),
    this.prisma.chatMessage.deleteMany({ where: { senderId: target.id } }),
    this.prisma.user.delete({ where: { id: target.id } }),
  ]);

  return { ok: true, deletedUserId: target.id };
}

}
