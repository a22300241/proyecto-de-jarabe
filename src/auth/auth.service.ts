import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.users.findByEmailWithPassword(email);

    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    // ✅ NUEVO: bloquear si está desactivado
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

    const token = await this.jwt.signAsync(payload);

    return {
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        franchiseId: user.franchiseId ?? null,
      },
    };
  }
}
