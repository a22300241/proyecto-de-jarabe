// src/sales/dto/sales-query.dto.ts
import { IsOptional, IsString, IsISO8601 } from 'class-validator';

export class SalesQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string; // ej: "2026-01-21T00:00:00.000Z"

  @IsOptional()
  @IsISO8601()
  to?: string; // ej: "2026-01-22T00:00:00.000Z"

  @IsOptional()
  @IsString()
  sellerId?: string;

  // Solo si OWNER/PARTNER quieren ver otra franquicia por query
  @IsOptional()
  @IsString()
  franchiseId?: string;
}
