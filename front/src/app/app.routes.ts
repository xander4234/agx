import { Routes } from '@angular/router';
import { LoginComponent } from './features/login/login.component';

export const routes: Routes = [
  {
    path: '',
    component: LoginComponent
  },
  {
    path: 'medico/dashboard',
    loadComponent: () =>
      import('./features/medico/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      )
  },
  {
    path: 'medico/pacientes',
    loadComponent: () =>
      import('./features/paciente/pacientes.component').then(
        (m) => m.PacientesComponent
      )
  },
  {
    path: 'medico/citas',
    loadComponent: () =>
      import('./features/medico/citas/citas.component').then(
        (m) => m.CitasComponent
      )
  },
  {
    path: 'medico/historia-clinica',
    loadComponent: () =>
      import('./features/medico/historia-clinica/historia-clinica.component').then(
        (m) => m.HistoriaClinicaComponent
      )
  },
  {
    path: 'medico/recetas',
    loadComponent: () =>
      import('./features/medico/recetas/recetas.component').then(
        (m) => m.RecetasComponent
      )
  },
  {
    path: 'medico/reportes',
    loadComponent: () =>
      import('./features/medico/shared/medico-page.component').then(
        (m) => m.MedicoPageComponent
      ),
    data: {
      title: 'Reportes',
      description: 'Exportación y consulta de reportes médicos y administrativos.'
    }
  },
  {
    path: 'medico/disponibilidad',
    loadComponent: () =>
      import('./features/medico/shared/medico-page.component').then(
        (m) => m.MedicoPageComponent
      ),
    data: {
      title: 'Disponibilidad',
      description: 'Configuración de horarios, turnos y disponibilidad del médico.'
    }
  },
  {
    path: 'paciente/dashboard',
    loadComponent: () =>
      import('./features/paciente/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      )
  },
  {
    path: 'paciente/signos-vitales',
    loadComponent: () =>
      import('./features/paciente/signos-vitales/signos-vitales.component').then(
        (m) => m.SignosVitalesComponent
      )
  },
  {
    path: '**',
    redirectTo: ''
  }
];