// src/chat/chat.controller.ts
import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { Role } from '@prisma/client';
import { Delete, Param } from '@nestjs/common';

type JwtUser = { userId: string; role: Role; franchiseId?: string | null };
type ReqWithUser = { user: JwtUser };

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('rooms')
  listMyRooms(@Req() req: ReqWithUser) {
    return this.chat.listMyRooms(req.user);
  }

  @Get('rooms/global')
  getGlobal(@Req() req: ReqWithUser) {
    return this.chat.getOrCreateGlobalRoom(req.user);
  }

  @Get('rooms/franchise')
  getFranchise(@Req() req: ReqWithUser) {
    return this.chat.getOrCreateFranchiseRoom(req.user);
  }

  @Post('dm')
  createDM(@Req() req: ReqWithUser, @Body() body: { otherUserId: string }) {
    return this.chat.getOrCreateDM(req.user, body.otherUserId);
  }

  @Post('message')
  sendMessage(@Req() req: ReqWithUser, @Body() body: { roomId: string; text: string }) {
    return this.chat.sendMessage(req.user, body.roomId, body.text);
  }

  @Get('messages')
  listMessages(
    @Req() req: ReqWithUser,
    @Query('roomId') roomId: string,
    @Query('take') take?: string,
  ) {
    return this.chat.listMessages(req.user, roomId, take ? Number(take) : 50);
  }
  // ============================
// OWNER / PARTNER
// Ver TODOS los usuarios
// ============================
@Get('users')
listAllUsers(@Req() req: ReqWithUser) {
  return this.chat.listAllUsers(req.user);
}

// ============================
// FRANCHISE_OWNER
// Ver vendedores de SU franquicia
// ============================
@Get('users/franchise')
listMyFranchiseUsers(@Req() req: ReqWithUser) {
  return this.chat.listMyFranchiseSellers(req.user);
}
@Delete('users/:id')
deleteUser(@Req() req: ReqWithUser, @Param('id') id: string) {
  return this.chat.deleteUser(req.user, id);
}

// ============================
// DELETE /chat/franchises/:id
// OWNER/PARTNER: elimina franquicia
// ============================
@Delete('franchises/:id')
deleteFranchise(@Req() req: ReqWithUser, @Param('id') id: string) {
  return this.chat.deleteFranchise(req.user, id);
}
}
