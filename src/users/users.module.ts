import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule], // 👈 para poder usar PrismaService
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // 👈 CLAVE (para que AuthModule lo pueda inyectar)
})
export class UsersModule {}
