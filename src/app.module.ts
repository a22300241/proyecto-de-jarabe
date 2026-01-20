import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { FranchisesModule } from './franchises/franchises.module';
import { ProductsModule } from './products/products.module';
import { SalesModule } from './sales/sales.module';
import { ChatModule } from './chat/chat.module';
import { AuthModule } from './auth/auth.module';
import { FranchiseGuard } from './auth/guards/franchise.guard';
import { APP_GUARD } from '@nestjs/core/constants';
import { RolesGuard } from './auth/guards/roles.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

@Module({
  imports: [PrismaModule, 
    AuthModule, 
    UsersModule, 
    FranchisesModule, ProductsModule, 
    SalesModule, 
    ChatModule],
  controllers: [AppController],
  providers: [AppService,{ provide: APP_GUARD, useClass: JwtAuthGuard },   // 1) exige JWT en todo (menos donde uses @Public si lo tienes)
    { provide: APP_GUARD, useClass: RolesGuard },     // 2) roles
    { provide: APP_GUARD, useClass: FranchiseGuard }, // 3) franquicia]
],
},
)
export class AppModule {}

