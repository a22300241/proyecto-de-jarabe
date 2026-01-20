export type Role = 'OWNER' | 'PARTNER' | 'FRANCHISE_OWNER' | 'SELLER';

export type AuthUser = {
  userId: string;
  role: Role;
  franchiseId: string | null;
};
