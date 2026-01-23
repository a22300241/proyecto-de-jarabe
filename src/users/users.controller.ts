import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { Roles } from 'src/auth/roles.decorator';


type ReqWithUser = {
  user: {
    userId: string;
    role: 'OWNER' | 'PARTNER' | 'FRANCHISE_OWNER' | 'SELLER';
    franchiseId?: string | null;
  };
};

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ✅ Crear usuario (solo OWNER/PARTNER/FRANCHISE_OWNER)
  @Post()
  @Roles('OWNER', 'PARTNER', 'FRANCHISE_OWNER')
  async create(@Body() dto: CreateUserDto, @Req() req: ReqWithUser) {
    return this.usersService.createUser(dto, req.user);
  }

  // ✅ Listar usuarios (todos pueden leer, pero filtrado por rol)
  @Get()
  @Roles('OWNER', 'PARTNER', 'FRANCHISE_OWNER', 'SELLER')
  async list(@Req() req: ReqWithUser, @Query('franchiseId') franchiseId?: string) {
    return this.usersService.listUsers(req.user, franchiseId);
  }
}
