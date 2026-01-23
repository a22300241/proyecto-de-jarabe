import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @MinLength(4)
  password: string;

  @IsEnum(['OWNER', 'PARTNER', 'FRANCHISE_OWNER', 'SELLER'])
  role: 'OWNER' | 'PARTNER' | 'FRANCHISE_OWNER' | 'SELLER';

  // Solo aplica para roles que viven en franquicia (FRANCHISE_OWNER, SELLER)
  @IsOptional()
  @IsString()
  franchiseId?: string;
}
