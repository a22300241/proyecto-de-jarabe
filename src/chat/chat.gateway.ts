// src/chat/chat.gateway.ts
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { ChatService } from './chat.service';
import { Role } from '@prisma/client';

type JwtUser = { userId: string; role: Role; franchiseId?: string | null };

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/chat',
})
@UseGuards(WsJwtGuard)
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private chat: ChatService) {}

  async handleConnection(client: any) {
    const me: JwtUser = client.user;

    // 1) FRANCHISE room
    if (me.franchiseId) {
      const frRoom = await this.chat.getOrCreateFranchiseRoom(me);
      if (frRoom) client.join(frRoom.id);
    }

    // 2) GLOBAL room (solo roles permitidos)
    if (me.role === Role.OWNER || me.role === Role.PARTNER || me.role === Role.FRANCHISE_OWNER) {
      const global = await this.chat.getOrCreateGlobalRoom(me);
      if (global) client.join(global.id);
    }

    // 3) Join a todos mis rooms existentes (DMs incluidos)
    const rooms = await this.chat.listMyRooms(me);
    for (const r of rooms) client.join(r.id);

    client.emit('connected', { ok: true });
  }

  @SubscribeMessage('rooms:list')
  async roomsList(@ConnectedSocket() client: any) {
    return this.chat.listMyRooms(client.user);
  }

  @SubscribeMessage('message:send')
  async send(
    @ConnectedSocket() client: any,
    @MessageBody() body: { roomId?: string; toUserId?: string; text: string },
  ) {
    const me: JwtUser = client.user;

    if (body.roomId) {
      const msg = await this.chat.sendMessage(me, body.roomId, body.text);
      this.server.to(body.roomId).emit('message:new', msg);
      return msg;
    }

    if (body.toUserId) {
      const room = await this.chat.getOrCreateDM(me, body.toUserId);
      client.join(room!.id);
      const msg = await this.chat.sendMessage(me, room!.id, body.text);
      this.server.to(room!.id).emit('message:new', msg);
      return { room, msg };
    }

    throw new Error('Debes enviar roomId o toUserId');
  }
}
