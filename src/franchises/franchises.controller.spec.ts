import { Test, TestingModule } from '@nestjs/testing';
import { FranchisesController } from './franchises.controller';

describe('FranchisesController', () => {
  let controller: FranchisesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FranchisesController],
    }).compile();

    controller = module.get<FranchisesController>(FranchisesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
