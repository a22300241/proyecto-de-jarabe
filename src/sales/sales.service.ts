import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleItemDto } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async createSale(
    franchiseId: string,
    sellerId: string,
    items: CreateSaleItemDto[],
    cardNumber?: string,
  ) {
    // 🔥 Esto es lo que te está fallando ahorita:
    if (!franchiseId) throw new BadRequestException('franchiseId requerido (viene del JWT)');
    if (!sellerId) throw new BadRequestException('sellerId requerido (viene del JWT)');
    if (!items?.length) throw new BadRequestException('items requerido');

    // Validación de items
    for (const it of items) {
      if (!it.productId) throw new BadRequestException('productId requerido');
      if (!Number.isInteger(it.qty) || it.qty <= 0) {
        throw new BadRequestException('qty inválido (entero > 0)');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1) Buscar productos de esa franquicia
      const products = await tx.product.findMany({
        where: { franchiseId, id: { in: items.map((i) => i.productId) } },
        select: { id: true, price: true, stock: true },
      });

      if (products.length !== items.length) {
        throw new BadRequestException('Producto(s) no existen en esta franquicia');
      }

      // 2) Descontar stock (protege contra race conditions)
      for (const it of items) {
        const updated = await tx.product.updateMany({
          where: { id: it.productId, franchiseId, stock: { gte: it.qty } },
          data: { stock: { decrement: it.qty } },
        });
        if (updated.count !== 1) {
          throw new ConflictException(`Stock insuficiente para ${it.productId}`);
        }
      }

      const priceMap = new Map(products.map((p) => [p.id, p.price]));

      // 3) Armar items con los nombres que tu schema pide: qty, price, subtotal
      const saleItems = items.map((it) => {
        const unitPrice = priceMap.get(it.productId);
        if (unitPrice === undefined) throw new BadRequestException('Producto inválido');

        return {
          product: { connect: { id: it.productId } },
          qty: it.qty,
          price: unitPrice,
          subtotal: unitPrice * it.qty,
        };
      });

      const total = saleItems.reduce((acc, i) => acc + i.subtotal, 0);

      // 4) Crear sale conectando relaciones (esto evita el error "franchise missing")
      const sale = await tx.sale.create({
        data: {
          franchise: { connect: { id: franchiseId } },
          seller: { connect: { id: sellerId } },
          cardNumber: cardNumber ?? 'N/A',
          total,
          items: { create: saleItems },
        },
        include: { items: true },
      });

      return sale;
    });
  }
}
