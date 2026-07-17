import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface HistoriaRegistro {
  fecha: string;
  paciente: string;
  edad: string;
  cedula: string;
  motivo: string;
  diagnostico: string;
  tratamiento: string;
  recomendaciones: string;
  signos: {
    presion: string;
    frecuencia: string;
    temperatura: string;
    saturacion: string;
    peso: string;
  };
}

@Component({
  selector: 'app-historia-clinica',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './historia-clinica.component.html',
  styleUrls: ['./historia-clinica.component.css']
})
export class HistoriaClinicaComponent {
  private router = inject(Router);

  doctorName = 'DR. ÁNGEL ALCÍVAR';
  specialty = 'Medicina General';
  currentDate = '24 de abril de 2026';

  paciente = '';
  cedula = '';
  edad = '';
  telefono = '';
  direccion = '';

  motivoConsulta = '';
  antecedentes = '';
  alergias = '';
  examenFisico = '';

  presionArterial = '';
  frecuenciaCardiaca = '';
  temperatura = '';
  saturacion = '';
  peso = '';

  diagnostico = '';
  tratamiento = '';
  recomendaciones = '';
  evolucion = '';

  mensaje = '';

  historias: HistoriaRegistro[] = [
    {
      fecha: '2026-04-22',
      paciente: 'Lucía Torres',
      edad: '29',
      cedula: '0801234567',
      motivo: 'Control prenatal',
      diagnostico: 'Paciente estable, control de rutina.',
      tratamiento: 'Continuar medicación prescrita y controles mensuales.',
      recomendaciones: 'Mantener hidratación y reposo relativo.',
      signos: {
        presion: '110/70 mmHg',
        frecuencia: '76 lpm',
        temperatura: '36.6 °C',
        saturacion: '98%',
        peso: '64 kg'
      }
    }
  ];

  goDashboard(): void {
    this.router.navigate(['/medico/dashboard']);
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.router.navigate(['/']);
  }

  guardarHistoria(): void {
    this.mensaje = '';

    if (
      !this.paciente.trim() ||
      !this.cedula.trim() ||
      !this.motivoConsulta.trim() ||
      !this.diagnostico.trim()
    ) {
      this.mensaje = 'Complete al menos paciente, cédula, motivo de consulta y diagnóstico.';
      return;
    }

    const nuevaHistoria: HistoriaRegistro = {
      fecha: new Date().toISOString().slice(0, 10),
      paciente: this.paciente,
      edad: this.edad,
      cedula: this.cedula,
      motivo: this.motivoConsulta,
      diagnostico: this.diagnostico,
      tratamiento: this.tratamiento,
      recomendaciones: this.recomendaciones,
      signos: {
        presion: this.presionArterial,
        frecuencia: this.frecuenciaCardiaca,
        temperatura: this.temperatura,
        saturacion: this.saturacion,
        peso: this.peso
      }
    };

    this.historias.unshift(nuevaHistoria);
    this.mensaje = 'Historia clínica registrada correctamente.';
    this.limpiarFormulario();
  }

  limpiarFormulario(): void {
    this.paciente = '';
    this.cedula = '';
    this.edad = '';
    this.telefono = '';
    this.direccion = '';
    this.motivoConsulta = '';
    this.antecedentes = '';
    this.alergias = '';
    this.examenFisico = '';
    this.presionArterial = '';
    this.frecuenciaCardiaca = '';
    this.temperatura = '';
    this.saturacion = '';
    this.peso = '';
    this.diagnostico = '';
    this.tratamiento = '';
    this.recomendaciones = '';
    this.evolucion = '';
  }

  eliminarHistoria(index: number): void {
    this.historias.splice(index, 1);
  }
}