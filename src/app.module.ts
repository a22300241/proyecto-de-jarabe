import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FranchisesModule } from './franchises/franchises.module';
import { ProductsModule } from './products/products.module';
import { SalesModule } from './sales/sales.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [PrismaModule, 
    AuthModule, 
    UsersModule, 
    FranchisesModule, ProductsModule, 
    SalesModule, 
    ChatModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

