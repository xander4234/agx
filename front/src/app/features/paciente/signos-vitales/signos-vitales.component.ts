import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface RegistroSignos {
  fecha: string;
  hora: string;
  presion: string;
  frecuencia: string;
  temperatura: string;
  saturacion: string;
  peso: string;
  glucosa: string;
  observaciones: string;
}

@Component({
  selector: 'app-signos-vitales',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './signos-vitales.component.html',
  styleUrls: ['./signos-vitales.component.css']
})
export class SignosVitalesComponent {
  private router = inject(Router);

  fecha = new Date().toISOString().slice(0, 10);
  hora = new Date().toTimeString().slice(0, 5);

  presion = '';
  frecuencia = '';
  temperatura = '';
  saturacion = '';
  peso = '';
  glucosa = '';
  observaciones = '';

  mensaje = '';

  registros: RegistroSignos[] = [
    {
      fecha: '2026-04-24',
      hora: '08:15',
      presion: '118/78 mmHg',
      frecuencia: '72 lpm',
      temperatura: '36.5 °C',
      saturacion: '98%',
      peso: '68 kg',
      glucosa: '92 mg/dL',
      observaciones: 'Paciente estable.'
    }
  ];

  get ultimoRegistro(): RegistroSignos | null {
    return this.registros.length ? this.registros[0] : null;
  }

  goDashboard(): void {
    this.router.navigate(['/paciente/dashboard']);
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.router.navigate(['/']);
  }

  guardarRegistro(): void {
    this.mensaje = '';

    if (
      !this.fecha.trim() ||
      !this.hora.trim() ||
      !this.presion.trim() ||
      !this.frecuencia.trim() ||
      !this.temperatura.trim() ||
      !this.saturacion.trim() ||
      !this.peso.trim() ||
      !this.glucosa.trim()
    ) {
      this.mensaje = 'Complete todos los campos obligatorios.';
      return;
    }

    this.registros.unshift({
      fecha: this.fecha,
      hora: this.hora,
      presion: this.presion,
      frecuencia: this.frecuencia,
      temperatura: this.temperatura,
      saturacion: this.saturacion,
      peso: this.peso,
      glucosa: this.glucosa,
      observaciones: this.observaciones
    });

    this.limpiarFormulario();
    this.mensaje = 'Signos vitales registrados correctamente.';
  }

  limpiarFormulario(): void {
    this.fecha = new Date().toISOString().slice(0, 10);
    this.hora = new Date().toTimeString().slice(0, 5);
    this.presion = '';
    this.frecuencia = '';
    this.temperatura = '';
    this.saturacion = '';
    this.peso = '';
    this.glucosa = '';
    this.observaciones = '';
  }

  eliminarRegistro(index: number): void {
    this.registros.splice(index, 1);
  }
}