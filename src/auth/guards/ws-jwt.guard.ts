import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: any = context.switchToWs().getClient();

    // Token puede venir en:
    // - handshake.auth.token
    // - header Authorization: Bearer xxx
    const token =
      client?.handshake?.auth?.token ||
      (client?.handshake?.headers?.authorization?.startsWith('Bearer ')
        ? client.handshake.headers.authorization.slice(7)
        : null);

    if (!token) throw new UnauthorizedException('JWT requerido');

    try {
      const payload: any = this.jwt.verify(token);

      // Tu payload típico: { sub, role, franchiseId }
      client.user = {
        userId: payload.sub ?? payload.userId,
        role: payload.role as Role,
        franchiseId: payload.franchiseId ?? null,
      };

      return true;
    } catch {
      throw new UnauthorizedException('JWT inválido');
    }
  }
}
