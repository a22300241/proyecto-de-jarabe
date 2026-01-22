// src/sales/sales.controller.ts
import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesQueryDto } from './dto/sales-query.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

type ReqWithUser = {
  user: {
    userId?: string;           // token nuevo
    sub?: string;              // token viejo
    role: string;
    franchiseId?: string | null;
  };
};

type JwtUser = {
  userId: string;
  role: string;
  franchiseId?: string | null;
};

@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  private jwt(req: ReqWithUser): JwtUser {
    const userId = req.user.userId ?? req.user.sub;
    if (!userId) throw new BadRequestException('Token inválido: falta userId/sub');
    return {
      userId,
      role: req.user.role,
      franchiseId: req.user.franchiseId ?? null,
    };
  }

  @Get('ping')
  ping() {
    return { ok: true, message: 'sales ok' };
  }

  // ✅ summary ANTES de :id
  @Get('summary')
  async summary(@Query() query: SalesQueryDto, @Req() req: ReqWithUser) {
    return this.salesService.salesSummary(query, this.jwt(req));
  }

  // LISTAR VENTAS
  @Get()
  async list(@Query() query: SalesQueryDto, @Req() req: ReqWithUser) {
    return this.salesService.listSales(query, this.jwt(req));
  }

  // VER 1 VENTA
  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: ReqWithUser) {
    return this.salesService.getSaleById(id, this.jwt(req));
  }

  // CREAR VENTA
  @Post()
  async create(@Body() body: { items: { productId: string; qty: number }[] }, @Req() req: ReqWithUser) {
    const u = this.jwt(req);
    const franchiseId = u.franchiseId;
    if (!franchiseId) throw new BadRequestException('franchiseId requerido');
    return this.salesService.createSale(franchiseId, u.userId, body.items);
  }
}
