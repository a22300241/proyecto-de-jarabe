import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../public.decorator';
import { FRANCHISE_PARAM_KEY } from '../franchise.decorator';
import type { AuthUser } from '../auth.types';

@Injectable()
export class FranchiseGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    // ✅ si es publico, NO valida nada
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;

    // si no hay user, es porque NO pasó JWT
    if (!user) throw new ForbiddenException('No autenticado');

    // OWNER/PARTNER no se restringen por franquicia (ajusta a tus roles reales)
    if (user.role === 'OWNER' || user.role === 'PARTNER') return true;

    // Si el endpoint no pide validación de franquicia, no bloquea
    const where = this.reflector.getAllAndOverride<string | undefined>(
      FRANCHISE_PARAM_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!where) return true;

    const franchiseIdFromReq =
      where === 'params.franchiseId'
        ? req.params?.franchiseId
        : where === 'body.franchiseId'
          ? req.body?.franchiseId
          : where === 'query.franchiseId'
            ? req.query?.franchiseId
            : undefined;

    if (!franchiseIdFromReq) {
      throw new ForbiddenException('Falta franchiseId en la request');
    }

    if (String(franchiseIdFromReq) !== String(user.franchiseId)) {
      throw new ForbiddenException('No autorizado para esta franquicia');
    }

    return true;
  }
}
