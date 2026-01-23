// src/reports/reports.controller.ts
import { Controller, Get, Query, Req, UseGuards, ForbiddenException, Post, Body } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  // ✅ corte del día por franquicia
  // - OWNER/PARTNER: requiere franchiseId
  // - FRANCHISE_OWNER/SELLER: usa su franchiseId
  @Get('daily-close')
  dailyClose(@Req() req: any, @Query() q: any) {
    return this.reports.dailyClose(req.user, q);
  }

  // ✅ “cerrar día” (bloquea refund/cancel/ajustes si tú lo activas después)
  @Post('daily-close/close')
  closeDay(@Req() req: any, @Body() body: { franchiseId?: string; day?: string }) {
    return this.reports.closeDay(req.user, body);
  }

  // ✅ reporte global OWNER/PARTNER
  @Get('global/summary')
  globalSummary(@Req() req: any, @Query() q: any) {
    const role = req.user?.role;
    if (role !== 'OWNER' && role !== 'PARTNER') throw new ForbiddenException('Solo OWNER/PARTNER');
    return this.reports.globalSummary(q);
  }
}
