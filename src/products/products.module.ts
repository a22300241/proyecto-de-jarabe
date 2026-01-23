// src/products/products.module.ts
import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module'; // ✅

@Module({
  imports: [PrismaModule, AuditModule], // ✅ aquí
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
