import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-paciente-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent {
  private router = inject(Router);

  patientName = 'Paciente Demo';
  specialty = 'Control integral';
  currentDate = '24 de abril de 2026';

  stats = [
    { icon: '📅', label: 'Próxima cita', value: '28 abril', helper: '10:30 AM' },
    { icon: '💊', label: 'Recetas activas', value: '3', helper: '2 por renovar' },
    { icon: '🧪', label: 'Resultados', value: '5', helper: '1 nuevo' },
    { icon: '❤️', label: 'Estado general', value: 'Estable', helper: 'Última actualización hoy' }
  ];

  appointments = [
    {
      date: '28 abril',
      time: '10:30 AM',
      doctor: 'Dra. María Zambrano',
      type: 'Consulta de seguimiento',
      status: 'Confirmada'
    },
    {
      date: '05 mayo',
      time: '09:00 AM',
      doctor: 'Dr. Carlos Vera',
      type: 'Valoración general',
      status: 'Pendiente'
    }
  ];

  prescriptions = [
    {
      name: 'Losartán 50mg',
      dose: '1 tableta cada 12 horas',
      duration: '30 días',
      status: 'Activa'
    },
    {
      name: 'Ibuprofeno 400mg',
      dose: '1 tableta cada 8 horas',
      duration: '5 días',
      status: 'Activa'
    },
    {
      name: 'Vitamina D',
      dose: '1 cápsula diaria',
      duration: '60 días',
      status: 'Por renovar'
    }
  ];

  results = [
    {
      exam: 'Biometría hemática',
      date: '22/04/2026',
      status: 'Disponible'
    },
    {
      exam: 'Perfil lipídico',
      date: '20/04/2026',
      status: 'Disponible'
    },
    {
      exam: 'Glucosa en sangre',
      date: '18/04/2026',
      status: 'Nuevo'
    }
  ];

  vitals = [
    { label: 'Presión arterial', value: '118/78 mmHg' },
    { label: 'Frecuencia cardiaca', value: '72 lpm' },
    { label: 'Peso', value: '68 kg' },
    { label: 'Glucosa', value: '92 mg/dL' }
  ];

  history = [
    {
      date: '22/04/2026',
      title: 'Consulta de control',
      description: 'Evaluación general con evolución favorable.'
    },
    {
      date: '15/04/2026',
      title: 'Carga de signos vitales',
      description: 'Registro diario actualizado correctamente.'
    },
    {
      date: '09/04/2026',
      title: 'Resultados de laboratorio',
      description: 'Exámenes revisados por el profesional tratante.'
    }
  ];

  go(route: string): void {
    this.router.navigate([route]);
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.router.navigate(['/']);
  }
}