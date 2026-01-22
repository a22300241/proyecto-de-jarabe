// src/sales/sales.controller.ts
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesQueryDto } from './dto/sales-query.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CreateSaleDto } from './dto/create-sale.dto';

type ReqWithUser = {
  user: {
    userId: string;
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

  // ✅ summary (ojo: ANTES de :id)
  @Get('summary')
  async summary(@Query() query: SalesQueryDto, @Req() req: ReqWithUser) {
    return this.salesService.salesSummary(query, req.user);
  }

  // ✅ list
  @Get()
  async list(@Query() query: SalesQueryDto, @Req() req: ReqWithUser) {
    return this.salesService.listSales(query, req.user);
  }

  // ✅ get one
  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: ReqWithUser) {
    return this.salesService.getSaleById(id, req.user);
  }

  // ✅ create (tarjeta obligatoria)
  @Post()
  async create(@Body() body: CreateSaleDto, @Req() req: ReqWithUser) {
    const franchiseId = req.user.franchiseId;
    const sellerId = req.user.userId;
    return this.salesService.createSale(franchiseId as string, sellerId, body.items, body.cardNumber);
  }
}
