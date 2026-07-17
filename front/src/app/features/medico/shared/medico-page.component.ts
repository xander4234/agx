import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-medico-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './medico-page.component.html',
  styleUrls: ['./medico-page.component.css']
})
export class MedicoPageComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  get title(): string {
    return this.route.snapshot.data['title'] ?? 'Módulo';
  }

  get description(): string {
    return this.route.snapshot.data['description'] ?? 'Contenido del módulo.';
  }

  goDashboard(): void {
    this.router.navigate(['/medico/dashboard']);
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.router.navigate(['/']);
  }
}