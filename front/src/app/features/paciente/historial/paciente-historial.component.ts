import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-paciente-historial',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './paciente-historial.component.html',
  styleUrls: ['./paciente-historial.component.css']
})
export class PacienteHistorialComponent {
  private router = inject(Router);

  items = [
    {
      fecha: '22/04/2026',
      titulo: 'Consulta de control',
      detalle: 'Evaluación general con evolución favorable.'
    },
    {
      fecha: '15/04/2026',
      titulo: 'Carga de signos vitales',
      detalle: 'Registro diario actualizado correctamente.'
    },
    {
      fecha: '09/04/2026',
      titulo: 'Resultados de laboratorio',
      detalle: 'Exámenes revisados por el profesional tratante.'
    }
  ];

  goDashboard(): void {
    this.router.navigate(['/paciente/dashboard']);
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.router.navigate(['/']);
  }
}