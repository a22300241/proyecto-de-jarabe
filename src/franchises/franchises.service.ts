import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFranchiseDto } from './dto/create-franchise.dto';

@Injectable()
export class FranchisesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.franchise.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(franchiseId: string) {
    return this.prisma.franchise.findUnique({
      where: { id: franchiseId },
    });
  }

  create(dto: CreateFranchiseDto) {
    return this.prisma.franchise.create({
      data: {
        name: dto.name,
        // isActive lo pones solo si EXISTE en tu schema.prisma
        // isActive: true,
      },
    });
  }
}
