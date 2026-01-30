import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: any = context.switchToWs().getClient();

    const token =
      client?.handshake?.auth?.token ||
      (client?.handshake?.headers?.authorization?.startsWith('Bearer ')
        ? client.handshake.headers.authorization.slice(7)
        : null);
    if (!token) throw new UnauthorizedException('JWT requerido');
    try {
      const payload: any = await this.jwt.verifyAsync(token);
      const userId = payload.sub ?? payload.userId;
      if (!userId) throw new UnauthorizedException('JWT inválido');

      // ✅ NUEVO: validar usuario activo en BD
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, franchiseId: true, isActive: true },
      });

      if (!user || user.isActive === false) {
        throw new UnauthorizedException('Usuario desactivado');
      }

      client.user = {
        userId: user.id,
        role: user.role as Role,
        franchiseId: user.franchiseId ?? null,
      };

      return true;
    } catch {
      throw new UnauthorizedException('JWT inválido');
    }
  }
}
