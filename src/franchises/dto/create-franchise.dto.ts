import { IsNotEmpty, IsString } from 'class-validator';

export class CreateFranchiseDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
