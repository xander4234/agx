import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

type UserRole = 'paciente' | 'medico';

interface DemoUser {
  email: string;
  password: string;
  role: UserRole;
  fullName: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  selectedRole: UserRole = 'paciente';
  showPassword = false;

  email = '';
  password = '';
  errorMessage = '';
  loading = false;

  private demoUsers: DemoUser[] = [
    {
      email: 'medico@agxsalud.com',
      password: '123456',
      role: 'medico',
      fullName: 'Dr. Marco Ochoa'
    },
    {
      email: 'paciente@agxsalud.com',
      password: '123456',
      role: 'paciente',
      fullName: 'Paciente Demo'
    }
  ];

  constructor(private router: Router) {}

  selectRole(role: UserRole): void {
    this.selectedRole = role;
    this.errorMessage = '';
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {
    this.errorMessage = '';

    if (!this.email.trim() || !this.password.trim()) {
      this.errorMessage = 'Ingrese correo y contraseña.';
      return;
    }

    this.loading = true;

    const user = this.demoUsers.find(
      (item) =>
        item.email.toLowerCase() === this.email.trim().toLowerCase() &&
        item.password === this.password &&
        item.role === this.selectedRole
    );

    setTimeout(() => {
      this.loading = false;

      if (!user) {
        this.errorMessage = 'Credenciales incorrectas o el rol no coincide.';
        return;
      }

      localStorage.setItem('token', 'demo-token-agx-salud');
      localStorage.setItem(
        'user',
        JSON.stringify({
          email: user.email,
          role: user.role,
          fullName: user.fullName
        })
      );

      if (user.role === 'medico') {
        this.router.navigate(['/medico/dashboard']);
        return;
      }

      if (user.role === 'paciente') {
        this.router.navigate(['/paciente/dashboard']);
        return;
      }
    }, 500);
  }
}