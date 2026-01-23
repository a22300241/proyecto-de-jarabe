import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import type { Request } from 'express';

import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RestockProductDto } from './dto/restock-product.dto';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Req() req: Request, @Query('franchiseId') franchiseId?: string) {
    return this.products.list(req.user as any, franchiseId);
  }

  @Get(':id')
  getOne(@Req() req: Request, @Param('id') id: string) {
    return this.products.getOne(req.user as any, id);
  }

  @Post()
  create(@Req() req: Request, @Body() body: any) {
    return this.products.create(req.user as any, body);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.products.update(req.user as any, id, body);
  }

  // ✅ SURTIR (reabastecer): suma stock y baja faltantes (missing)
  @Patch(':id/restock')
  restock(@Req() req: Request, @Param('id') id: string, @Body() body: RestockProductDto) {
    return this.products.restock(req.user as any, id, body.qty);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.products.remove(req.user as any, id);
  }
}
