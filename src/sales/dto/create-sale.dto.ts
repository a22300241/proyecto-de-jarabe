import { IsArray, IsInt, IsString, Min, ValidateNested, IsOptional } from 'class-validator';
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

  @IsOptional()
  @IsString()
  cardNumber?: string;
}
