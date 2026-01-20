import { Controller, Post, Body, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: any) {
    return this.authService.login(String(body.email), String(body.password));
  }

  @Get('me')
  me(@Req() req: Request) {
    return (req as any).user;
  }
}
