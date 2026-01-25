import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  private readonly ACCESS_TTL = '15m';
  private readonly REFRESH_DAYS = 30;

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private refreshExpiresAt() {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.REFRESH_DAYS);
    return expiresAt;
  }

  private makeRefreshSecret() {
    return randomBytes(64).toString('hex');
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmailWithPassword(email);

    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    // ✅ bloquear si está desactivado
    if (user.isActive === false) {
      throw new UnauthorizedException('Usuario desactivado');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');

    const payload = {
      sub: user.id,
      role: user.role,
      franchiseId: user.franchiseId ?? null,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.ACCESS_TTL,
    });

    // ✅ Refresh token = "id.secret"
    const secret = this.makeRefreshSecret();
    const tokenHash = await bcrypt.hash(secret, 10);

    const rt = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: this.refreshExpiresAt(),
      },
      select: { id: true },
    });

    const refreshToken = `${rt.id}.${secret}`;

    return {
      ok: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        franchiseId: user.franchiseId ?? null,
      },
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new BadRequestException('refreshToken requerido');

    const [id, secret] = refreshToken.split('.');
    if (!id || !secret) throw new UnauthorizedException('refreshToken inválido');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    if (!stored) throw new UnauthorizedException('refreshToken inválido');
    if (stored.revokedAt) throw new UnauthorizedException('refreshToken revocado');
    if (stored.expiresAt <= new Date()) throw new UnauthorizedException('refreshToken expirado');

    const matches = await bcrypt.compare(secret, stored.tokenHash);
    if (!matches) throw new UnauthorizedException('refreshToken inválido');

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      select: { id: true, role: true, franchiseId: true, isActive: true },
    });

    if (!user || user.isActive === false) {
      throw new UnauthorizedException('Usuario desactivado');
    }

    // ✅ Rotación: revoca el refresh usado y crea uno nuevo
    const newSecret = this.makeRefreshSecret();
    const newHash = await bcrypt.hash(newSecret, 10);

    const newRt = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });

      return tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newHash,
          expiresAt: this.refreshExpiresAt(),
        },
        select: { id: true },
      });
    });

    const newRefreshToken = `${newRt.id}.${newSecret}`;

    const payload = {
      sub: user.id,
      role: user.role,
      franchiseId: user.franchiseId ?? null,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.ACCESS_TTL,
    });

    return { ok: true, accessToken, refreshToken: newRefreshToken };
  }
}
