import { Test, TestingModule } from '@nestjs/testing';
import { FranchisesService } from './franchises.service';

describe('FranchisesService', () => {
  let service: FranchisesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FranchisesService],
    }).compile();

    service = module.get<FranchisesService>(FranchisesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
