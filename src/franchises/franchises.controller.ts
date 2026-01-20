import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { FranchiseParam } from '../auth/franchise.decorator';

@Controller('franchises')
export class FranchisesController {

  @Get()
  @Roles('OWNER', 'PARTNER')
  findAll() {
    // listar todas las franquicias (solo OWNER/PARTNER)
  }

  @Get(':franchiseId')
  @Roles('OWNER', 'PARTNER', 'FRANCHISE_OWNER', 'SELLER')
  @FranchiseParam('params.franchiseId') // 👈 valida que sea su franquicia si no es OWNER/PARTNER
  findOne(@Param('franchiseId') franchiseId: string) {
    // devuelve UNA franquicia
  }

  @Post()
  @Roles('OWNER', 'PARTNER')
  create(@Body() dto: any) {
    // crear franquicia (solo OWNER/PARTNER)
  }
}