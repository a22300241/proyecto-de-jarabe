import { IsInt, Min } from 'class-validator';

export class RestockProductDto {
  @IsInt()
  @Min(1)
  qty: number;
}
