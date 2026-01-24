// src/chat/dto/send-message.dto.ts
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsUUID()
  toUserId?: string;
}
