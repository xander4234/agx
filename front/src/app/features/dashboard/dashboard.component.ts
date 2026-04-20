import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [NgIf],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.authService.currentUser;

  readonly roleLabel = computed(() =>
    this.user()?.role === 'medico' ? 'Médico' : 'Paciente'
  );

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
