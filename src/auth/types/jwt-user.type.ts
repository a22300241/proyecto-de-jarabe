import { Role } from '@prisma/client';

export type JwtUser = {
  userId: string;
  role: Role;
  franchiseId?: string | null;
};
