import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent {
  private router = inject(Router);

  doctorName = 'DR. ÁNGEL ALCÍVAR';
  specialty = 'Medicina General';
  todayDate = '24 de abril de 2026';

  stats = [
    { title: 'Pacientes registrados', value: '1.284', change: '+12%', icon: '👥' },
    { title: 'Atención de hoy', value: '18', change: '+4', icon: '🩺' },
    { title: 'Citas pendientes', value: '9', change: '3 urgentes', icon: '📅' },
    { title: 'Disponibilidad', value: 'Activa', change: '08:00 - 17:00', icon: '✅' }
  ];

  todayAppointments = [
    { time: '08:30', patient: 'María Zambrano', reason: 'Control general', status: 'Confirmada' },
    { time: '09:15', patient: 'Carlos Vera', reason: 'Dolor abdominal', status: 'En espera' },
    { time: '10:00', patient: 'Ana López', reason: 'Chequeo pediátrico', status: 'Confirmada' },
    { time: '11:20', patient: 'José Ramírez', reason: 'Revisión de exámenes', status: 'Pendiente' }
  ];

  pendingTasks = [
    'Aprobar 3 recetas médicas',
    'Revisar 2 resultados de laboratorio',
    'Completar 4 historias clínicas',
    'Actualizar disponibilidad de la próxima semana'
  ];

  recentPatients = [
    { name: 'Lucía Torres', age: 29, lastVisit: '22/04/2026', diagnosis: 'Control prenatal' },
    { name: 'Mateo Cedeño', age: 6, lastVisit: '22/04/2026', diagnosis: 'Fiebre viral' },
    { name: 'Andrea Mena', age: 41, lastVisit: '21/04/2026', diagnosis: 'control de la hipertensión' },
    { name: 'David Moreira', age: 35, lastVisit: '21/04/2026', diagnosis: 'Dolor lumbar' }
  ];

  quickActions = [
    { title: 'Nueva cita', subtitle: 'Registrar atención o cita', icon: '📌', route: '/medico/citas' },
    { title: 'Historia clínica', subtitle: 'Crear o editar historial', icon: '📋', route: '/medico/historia-clinica' },
    { title: 'Receta médica', subtitle: 'Emitir receta al paciente', icon: '💊', route: '/medico/recetas' },
    { title: 'Informes', subtitle: 'Exportar información clínica', icon: '🖨️', route: '/medico/reportes' }
  ];

  go(route: string): void {
    this.router.navigate([route]);
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.router.navigate(['/']);
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'Confirmada':
        return 'status-confirmed';
      case 'En espera':
        return 'status-waiting';
      case 'Pendiente':
        return 'status-pending';
      default:
        return '';
    }
  }
}