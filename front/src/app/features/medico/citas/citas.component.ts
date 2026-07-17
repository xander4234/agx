import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface CitaMedica {
  paciente: string;
  cedula: string;
  telefono: string;
  fecha: string;
  hora: string;
  motivo: string;
  tipo: string;
  estado: string;
}

@Component({
  selector: 'app-citas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './citas.component.html',
  styleUrls: ['./citas.component.css']
})
export class CitasComponent {
  private router = inject(Router);

  paciente = '';
  cedula = '';
  telefono = '';
  fecha = '';
  hora = '';
  motivo = '';
  tipo = 'Consulta general';
  estado = 'Confirmada';

  mensaje = '';

  citas: CitaMedica[] = [
    {
      paciente: 'María Zambrano',
      cedula: '0801234567',
      telefono: '0991112233',
      fecha: '2026-04-24',
      hora: '08:30',
      motivo: 'Control general',
      tipo: 'Consulta general',
      estado: 'Confirmada'
    },
    {
      paciente: 'Carlos Vera',
      cedula: '0807654321',
      telefono: '0984445566',
      fecha: '2026-04-24',
      hora: '09:15',
      motivo: 'Dolor abdominal',
      tipo: 'Consulta general',
      estado: 'En espera'
    }
  ];

  goDashboard(): void {
    this.router.navigate(['/medico/dashboard']);
  }

  guardarCita(): void {
    this.mensaje = '';

    if (
      !this.paciente.trim() ||
      !this.cedula.trim() ||
      !this.telefono.trim() ||
      !this.fecha.trim() ||
      !this.hora.trim() ||
      !this.motivo.trim()
    ) {
      this.mensaje = 'Complete todos los campos obligatorios.';
      return;
    }

    this.citas.unshift({
      paciente: this.paciente,
      cedula: this.cedula,
      telefono: this.telefono,
      fecha: this.fecha,
      hora: this.hora,
      motivo: this.motivo,
      tipo: this.tipo,
      estado: this.estado
    });

    this.limpiarFormulario();
    this.mensaje = 'Cita registrada correctamente.';
  }

  limpiarFormulario(): void {
    this.paciente = '';
    this.cedula = '';
    this.telefono = '';
    this.fecha = '';
    this.hora = '';
    this.motivo = '';
    this.tipo = 'Consulta general';
    this.estado = 'Confirmada';
  }

  eliminarCita(index: number): void {
    this.citas.splice(index, 1);
  }

  getEstadoClass(estado: string): string {
    switch (estado) {
      case 'Confirmada':
        return 'estado-confirmada';
      case 'En espera':
        return 'estado-espera';
      case 'Pendiente':
        return 'estado-pendiente';
      case 'Cancelada':
        return 'estado-cancelada';
      default:
        return '';
    }
  }
}