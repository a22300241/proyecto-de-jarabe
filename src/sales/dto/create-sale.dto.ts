import { IsArray, IsInt, IsString, Min, ValidateNested, Matches } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSaleItemDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  qty: number;
}

export class CreateSaleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];

  // ✅ OBLIGATORIO (tarjeta)
  @IsString()
  // mínimo 12 a 19 dígitos (básico para tarjetas). Ajusta si quieres.
  @Matches(/^\d{12,19}$/, { message: 'cardNumber inválido (12-19 dígitos)' })
  cardNumber: string;
}
