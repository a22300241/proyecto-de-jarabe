// src/chat/chat.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';

@Module({
  imports: [
    JwtModule.register({}) // ✅ con esto ya existe JwtService
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, WsJwtGuard],
})
export class ChatModule {}
