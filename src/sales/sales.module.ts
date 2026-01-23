// src/sales/sales.module.ts
import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module'; // ✅

@Module({
  imports: [PrismaModule, AuditModule], // ✅
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
