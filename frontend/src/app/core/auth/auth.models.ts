export interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  role: 'USER' | 'ADMIN';
  active: boolean;
  passwordLoginAvailable?: boolean;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: User;
}
export interface UserPage {
  items: User[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}
export interface ProfileInput {
  name: string;
  phone: string | null;
  address: string | null;
}
