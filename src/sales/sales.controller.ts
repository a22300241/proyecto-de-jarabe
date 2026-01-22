// src/sales/sales.controller.ts
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesQueryDto } from './dto/sales-query.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

type ReqWithUser = {
  user: {
    userId: string;   // ✅ era sub
    role: string;
    franchiseId?: string | null;
  };
};


@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get('ping')
  ping() {
    return { ok: true, message: 'sales ok' };
  }

  // LISTAR VENTAS
  @Get()
  async list(@Query() query: SalesQueryDto, @Req() req: ReqWithUser) {
    return this.salesService.listSales(query, req.user);
  }

  // VER 1 VENTA
  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: ReqWithUser) {
    return this.salesService.getSaleById(id, req.user);
  }

  // CREAR VENTA
    // CREAR VENTA
 // CREAR VENTA
@Post()
async create(
  @Body() body: { items: { productId: string; qty: number }[] },
  @Req() req: ReqWithUser,
) {
  const franchiseId = req.user.franchiseId;
  const sellerId = req.user.userId;  // ✅ este es el correcto
  return this.salesService.createSale(franchiseId as string, sellerId, body.items);
}
}
