// src/chat/chat.service.ts
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatRoomType, Role } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
type JwtUser = {
  userId: string;
  role: Role;
  franchiseId?: string | null;
};

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  // ============================
  // Helpers
  // ============================
  private assertHasFranchise(user: JwtUser) {
    if (!user.franchiseId) throw new ForbiddenException('Usuario sin franquicia');
    return user.franchiseId;
  }

  private orderedPair(a: string, b: string) {
    return a < b ? { a, b } : { a: b, b: a };
  }

  private roomInclude() {
    return {
      members: {
        include: {
          user: { select: { id: true, name: true, role: true, franchiseId: true } },
        },
      },
    } as const;
  }

  private async ensureMember(roomId: string, userId: string) {
    await this.prisma.chatRoomMember.upsert({
      where: { roomId_userId: { roomId, userId } },
      update: {},
      create: { roomId, userId },
    });
  }

  /**
   * ✅ Mejora: sincroniza miembros del GLOBAL
   * - Todos los usuarios con rol OWNER/PARTNER/FRANCHISE_OWNER deben pertenecer al room GLOBAL
   */
  private async syncGlobalMembers(roomId: string) {
    const eligibleUsers = await this.prisma.user.findMany({
      where: { role: { in: [Role.OWNER, Role.PARTNER, Role.FRANCHISE_OWNER] } },
      select: { id: true },
    });

    if (!eligibleUsers.length) return;

    await this.prisma.chatRoomMember.createMany({
      data: eligibleUsers.map((u) => ({ roomId, userId: u.id })),
      skipDuplicates: true,
    });
  }

  /**
   * ✅ Mejora: sincroniza miembros del FRANCHISE
   * - Todos los usuarios de esa franquicia (FRANCHISE_OWNER y SELLER) deben pertenecer al room FRANCHISE
   */
  private async syncFranchiseMembers(roomId: string, franchiseId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        franchiseId,
        role: { in: [Role.FRANCHISE_OWNER, Role.SELLER] },
      },
      select: { id: true },
    });

    if (!users.length) return;

    await this.prisma.chatRoomMember.createMany({
      data: users.map((u) => ({ roomId, userId: u.id })),
      skipDuplicates: true,
    });
  }

  // ============================
  // 1) FRANCHISE room (1 por franquicia)
  // ============================
  async getOrCreateFranchiseRoom(user: JwtUser) {
    const franchiseId = this.assertHasFranchise(user);

    let room = await this.prisma.chatRoom.findFirst({
      where: { type: ChatRoomType.FRANCHISE, franchiseId },
      include: this.roomInclude(),
    });

    if (!room) {
      room = await this.prisma.chatRoom.create({
        data: { type: ChatRoomType.FRANCHISE, franchiseId },
        include: this.roomInclude(),
      });
    }

    // ✅ Asegura al que lo pidió
    await this.ensureMember(room.id, user.userId);

    // ✅ Mejora: asegura que TODOS los de la franquicia estén metidos
    await this.syncFranchiseMembers(room.id, franchiseId);

    // ✅ Relee para devolver members actualizados
    return this.prisma.chatRoom.findUnique({
      where: { id: room.id },
      include: this.roomInclude(),
    });
  }

  // ============================
  // 2) GLOBAL room (1 sola)
  // OWNER/PARTNER/FRANCHISE_OWNER
  // ============================
  async getOrCreateGlobalRoom(user: JwtUser) {
    const allowed =
      user.role === Role.OWNER || user.role === Role.PARTNER || user.role === Role.FRANCHISE_OWNER;
    if (!allowed) throw new ForbiddenException('No tienes acceso al chat GLOBAL');

    let room = await this.prisma.chatRoom.findFirst({
      where: { type: ChatRoomType.GLOBAL },
      include: this.roomInclude(),
    });

    if (!room) {
      room = await this.prisma.chatRoom.create({
        data: { type: ChatRoomType.GLOBAL },
        include: this.roomInclude(),
      });
    }

    // ✅ Asegura al que lo pidió
    await this.ensureMember(room.id, user.userId);

    // ✅ Mejora: asegura que TODOS los altos mandos estén metidos
    await this.syncGlobalMembers(room.id);

    return this.prisma.chatRoom.findUnique({
      where: { id: room.id },
      include: this.roomInclude(),
    });
  }

  // ============================
  // 3) DM (1 por pareja)
  // ============================
  async getOrCreateDM(user: JwtUser, otherUserId: string) {
    if (!otherUserId) throw new BadRequestException('otherUserId requerido');
    if (otherUserId === user.userId) throw new BadRequestException('No puedes crear DM contigo mismo');

    const { a, b } = this.orderedPair(user.userId, otherUserId);

    let room = await this.prisma.chatRoom.findFirst({
      where: { type: ChatRoomType.DM, dmUserAId: a, dmUserBId: b },
      include: this.roomInclude(),
    });

    if (!room) {
      room = await this.prisma.chatRoom.create({
        data: { type: ChatRoomType.DM, dmUserAId: a, dmUserBId: b },
        include: this.roomInclude(),
      });
    }

    // ✅ Asegura membresías de ambos
    await this.prisma.chatRoomMember.createMany({
      data: [
        { roomId: room.id, userId: user.userId },
        { roomId: room.id, userId: otherUserId },
      ],
      skipDuplicates: true,
    });

    return this.prisma.chatRoom.findUnique({
      where: { id: room.id },
      include: this.roomInclude(),
    });
  }

  // ============================
  // 4) Listar mis rooms (por membership)
  // ============================
  async listMyRooms(user: JwtUser) {
    return this.prisma.chatRoom.findMany({
      where: { members: { some: { userId: user.userId } } },
      orderBy: { createdAt: 'desc' },
      include: this.roomInclude(),
    });
  }

  // ============================
  // 5) Enviar mensaje (valida member)
  // ============================
  async sendMessage(user: JwtUser, roomId: string, text: string) {
    if (!roomId) throw new BadRequestException('roomId requerido');
    if (!text?.trim()) throw new BadRequestException('text requerido');

    const member = await this.prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId: user.userId } },
    });
    if (!member) throw new ForbiddenException('No eres miembro de este room');

    return this.prisma.chatMessage.create({
      data: { roomId, senderId: user.userId, text: text.trim() },
    });
  }

  // ============================
  // 6) Ver mensajes (valida member)
  // ============================
  async listMessages(user: JwtUser, roomId: string, take = 50) {
    const member = await this.prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId: user.userId } },
    });
    if (!member) throw new ForbiddenException('No eres miembro de este room');

    return this.prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, Math.max(1, take)),
      include: { sender: { select: { id: true, name: true, role: true } } },
    });
  }
  // ============================
// 7) Ver TODOS los usuarios (OWNER / PARTNER)
// ============================
async listAllUsers(user: JwtUser) {
  const allowed = user.role === Role.OWNER || user.role === Role.PARTNER;
  if (!allowed) {
    throw new ForbiddenException('No tienes permisos para ver todos los usuarios');
  }

  return this.prisma.user.findMany({
    select: {
      id: true,
      name: true,
      role: true,
      franchiseId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

// ============================
// 8) Ver vendedores de MI franquicia (FRANCHISE_OWNER)
// ============================
async listMyFranchiseSellers(user: JwtUser) {
  if (user.role !== Role.FRANCHISE_OWNER) {
    throw new ForbiddenException('Solo el dueño de franquicia puede ver estos usuarios');
  }

  if (!user.franchiseId) {
    throw new ForbiddenException('Usuario sin franquicia asignada');
  }

  return this.prisma.user.findMany({
    where: {
      role: Role.SELLER,
      franchiseId: user.franchiseId,
    },
    select: {
      id: true,
      name: true,
      role: true,
      franchiseId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}
// ============================
// 9) Eliminar usuario
// ============================
async deleteUser(requester: JwtUser, userIdToDelete: string) {
  if (!userIdToDelete) throw new BadRequestException('userId requerido');

  const target = await this.prisma.user.findUnique({
    where: { id: userIdToDelete },
    select: { id: true, role: true, franchiseId: true },
  });

  if (!target) throw new NotFoundException('Usuario no existe');

  // 1) OWNER/PARTNER pueden borrar cualquiera
  const isBoss = requester.role === Role.OWNER || requester.role === Role.PARTNER;

  // 2) FRANCHISE_OWNER puede borrar SOLO SELLER de su franquicia
  const isFrOwner = requester.role === Role.FRANCHISE_OWNER;

  if (!isBoss && !isFrOwner) {
    throw new ForbiddenException('No tienes permisos para eliminar usuarios');
  }

  if (isFrOwner) {
    if (!requester.franchiseId) throw new ForbiddenException('Usuario sin franquicia asignada');
    if (target.role !== Role.SELLER) {
      throw new ForbiddenException('Solo puedes eliminar usuarios SELLER');
    }
    if (target.franchiseId !== requester.franchiseId) {
      throw new ForbiddenException('Solo puedes eliminar SELLER de tu franquicia');
    }
  }

  // ⚠️ Protección: si tiene ventas, no se puede borrar por FK (normal en POS).
  // Solución segura: impedir borrar usuarios con ventas.
  const salesCount = await this.prisma.sale.count({
    where: { sellerId: target.id },
  });

  if (salesCount > 0) {
    throw new BadRequestException(
      'No puedes eliminar este usuario porque ya tiene ventas. Desactívalo o reasigna ventas.',
    );
  }

  // Borrado en transacción (limpia relaciones comunes)
  await this.prisma.$transaction([
    // tokens
    this.prisma.refreshToken.deleteMany({ where: { userId: target.id } }),

    // memberships de chat
    this.prisma.chatRoomMember.deleteMany({ where: { userId: target.id } }),

    // mensajes enviados (si tu FK lo permite; si no, quítalo)
    this.prisma.chatMessage.deleteMany({ where: { senderId: target.id } }),

    // finalmente el user
    this.prisma.user.delete({ where: { id: target.id } }),
  ]);

  return { ok: true, deletedUserId: target.id };
}

// ============================
// 10) Eliminar franquicia (OWNER/PARTNER)
// ============================
async deleteFranchise(requester: JwtUser, franchiseId: string) {
  if (!franchiseId) throw new BadRequestException('franchiseId requerido');

  const allowed = requester.role === Role.OWNER || requester.role === Role.PARTNER;
  if (!allowed) throw new ForbiddenException('No tienes permisos para eliminar franquicias');

  const fr = await this.prisma.franchise.findUnique({
    where: { id: franchiseId },
    select: { id: true },
  });

  if (!fr) throw new NotFoundException('Franquicia no existe');

  // ⚠️ POS: normalmente NO se debe borrar franquicia si tiene ventas
  const salesCount = await this.prisma.sale.count({ where: { franchiseId } });
  if (salesCount > 0) {
    throw new BadRequestException(
      'No puedes eliminar esta franquicia porque ya tiene ventas. Mejor desactívala (isActive=false).',
    );
  }

  // Borrado en transacción (limpia cosas dependientes)
  await this.prisma.$transaction([
    // Chat rooms relacionados a franquicia + cascadas por miembros/mensajes si tu schema lo tiene
    this.prisma.chatRoom.deleteMany({ where: { franchiseId } }),

    // Productos (si dependen)
    this.prisma.product.deleteMany({ where: { franchiseId } }),

    // Usuarios de la franquicia (solo si NO tienen ventas, porque ya validamos que no haya ventas de la franquicia)
    // Aun así revisamos por si hay FKs extra:
    this.prisma.user.deleteMany({ where: { franchiseId } }),

    // DailyClose (si aplica)
    this.prisma.dailyClose.deleteMany({ where: { franchiseId } }),

    // Audit logs opcional (si quieres conservar auditoría NO lo borres)
    // this.prisma.auditLog.deleteMany({ where: { franchiseId } }),

    // Franquicia
    this.prisma.franchise.delete({ where: { id: franchiseId } }),
  ]);

  return { ok: true, deletedFranchiseId: franchiseId };
}
}