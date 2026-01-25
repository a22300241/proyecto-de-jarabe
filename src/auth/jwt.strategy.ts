import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

type JwtPayload = {
  sub: string;
  role: Role;
  franchiseId: string | null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'dev_secret',
    });
  }

  async validate(payload: JwtPayload) {
    // ✅ NUEVO: validar usuario real en BD
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, franchiseId: true, isActive: true },
    });

    if (!user || user.isActive === false) {
      throw new UnauthorizedException('Usuario desactivado');
    }

    // 👇 tu misma lógica: lo que llega a req.user
    return {
      userId: user.id,
      role: user.role,
      franchiseId: user.franchiseId ?? null,
    };
  }
}
