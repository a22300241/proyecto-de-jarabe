import { Module } from '@nestjs/common';
import { FranchisesController } from './franchises.controller';
import { FranchisesService } from './franchises.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FranchisesController],
  providers: [FranchisesService],
})
export class FranchisesModule {}
