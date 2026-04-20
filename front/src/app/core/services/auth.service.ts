import { Injectable, signal } from '@angular/core';

export type UserRole = 'paciente' | 'medico';

export interface SessionUser {
  email: string;
  role: UserRole;
  displayName: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  readonly currentUser = signal<SessionUser | null>(null);

  login(email: string, role: UserRole): void {
    const displayName = role === 'medico' ? 'Dr. Usuario' : 'Paciente Usuario';

    this.currentUser.set({
      email,
      role,
      displayName
    });
  }

  logout(): void {
    this.currentUser.set(null);
  }
}
