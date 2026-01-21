import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  // ✅ Puedes dejar ping protegido para verificar token.
  // Si lo quieres público, quítale UseGuards.
  @UseGuards(AuthGuard('jwt'))
  @Get('ping')
  ping() {
    return { ok: true };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post()
  async create(@Req() req: any, @Body() body: CreateSaleDto) {
    // ✅ Soportar varios nombres típicos en el payload
    const sellerId =
      req.user?.id ?? req.user?.userId ?? req.user?.sub;

    const franchiseId =
      req.user?.franchiseId ?? req.user?.franchise?.id;

    // Si esto llega undefined, es que tu JWT strategy no lo está metiendo en req.user
    return this.salesService.createSale(
      franchiseId,
      sellerId,
      body.items,
      body.cardNumber,
    );
  }
}
