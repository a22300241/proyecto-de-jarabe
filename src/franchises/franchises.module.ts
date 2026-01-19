import { Module } from '@nestjs/common';
import { FranchisesService } from './franchises.service';
import { FranchisesController } from './franchises.controller';

@Module({
  providers: [FranchisesService],
  controllers: [FranchisesController]
})
export class FranchisesModule {}
