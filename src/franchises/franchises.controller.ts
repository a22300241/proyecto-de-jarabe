import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { FranchisesService } from './franchises.service';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateFranchiseDto } from './dto/create-franchise.dto';
import { Role } from '@prisma/client';
type ReqWithUser = {
  user: {
    userId: string;
    role: string;
    franchiseId?: string | null;
  };
};

@Controller('franchises')
@UseGuards(JwtAuthGuard)
export class FranchisesController {
  constructor(private readonly franchisesService: FranchisesService) {}

  // ✅ listar todas (solo OWNER/PARTNER)
  @Get()
  @Roles('OWNER', 'PARTNER')
  findAll() {
    return this.franchisesService.findAll();
  }

  // ✅ ver 1 (OWNER/PARTNER cualquiera, otros solo su franquicia)
  @Get(':franchiseId')
  @Roles('OWNER', 'PARTNER', 'FRANCHISE_OWNER', 'SELLER')
  async findOne(@Param('franchiseId') franchiseId: string, @Req() req: ReqWithUser) {
    const role = req.user.role;
    const isAdmin = role === 'OWNER' || role === 'PARTNER';

    if (!isAdmin && req.user.franchiseId !== franchiseId) {
      // si no es admin, solo puede ver su franquicia
      // (ForbiddenException)
      throw new (require('@nestjs/common').ForbiddenException)('No puedes ver otra franquicia');
    }

    return this.franchisesService.findOne(franchiseId);
  }

  // ✅ crear franquicia (solo OWNER/PARTNER)
  @Post()
  @Roles('OWNER', 'PARTNER')
  create(@Body() dto: CreateFranchiseDto) {
    return this.franchisesService.create(dto);
  }
  // ✅ DESACTIVAR
  @Patch(':franchiseId/deactivate')
  @Roles(Role.OWNER, Role.PARTNER)
  deactivate(@Param('franchiseId') franchiseId: string) {
    return this.franchisesService.setActive(franchiseId, false);
  }

  // ✅ ACTIVAR
  @Patch(':franchiseId/activate')
  @Roles(Role.OWNER, Role.PARTNER)
  activate(@Param('franchiseId') franchiseId: string) {
    return this.franchisesService.setActive(franchiseId, true);
  }
   @Delete(':franchiseId')
  @Roles(Role.OWNER, Role.PARTNER)
  remove(@Param('franchiseId') franchiseId: string, @Query('force') force?: string) {
    return this.franchisesService.remove(franchiseId, force === 'true');
  }
}
