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
  
}
