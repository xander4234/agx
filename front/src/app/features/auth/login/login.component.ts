import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgClass } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService, UserRole } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, NgClass],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  readonly selectedRole = signal<UserRole>('paciente');
  readonly loading = signal(false);
  readonly infoMessage = signal('Usa tus credenciales institucionales para continuar.');

  readonly loginForm = this.fb.nonNullable.group({
    email: ['',
      [
        Validators.required,
        Validators.email
      ]
    ],
    password: ['', [Validators.required, Validators.minLength(6)]],
    remember: [true]
  });

  readonly titleByRole = computed(() =>
    this.selectedRole() === 'medico'
      ? 'Acceso para profesionales de salud'
      : 'Acceso para pacientes'
  );

  selectRole(role: UserRole): void {
    this.selectedRole.set(role);
    this.infoMessage.set(
      role === 'medico'
        ? 'Ingresa para revisar agenda, historias clínicas y consultas.'
        : 'Ingresa para revisar citas, resultados y mensajes.'
    );
  }

  submit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    const { email } = this.loginForm.getRawValue();
    this.authService.login(email, this.selectedRole());

    setTimeout(() => {
      this.loading.set(false);
      this.router.navigateByUrl('/dashboard');
    }, 500);
  }
}
