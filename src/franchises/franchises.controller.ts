import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { FranchisesService } from './franchises.service';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateFranchiseDto } from './dto/create-franchise.dto';

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
}
