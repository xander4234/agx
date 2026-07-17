import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface Paciente {
  nombre: string;
  cedula: string;
  edad: string;
  telefono: string;
  direccion: string;
  genero: string;
  tipoSangre: string;
  alergias: string;
}

@Component({
  selector: 'app-pacientes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pacientes.component.html',
  styleUrls: ['./pacientes.component.css']
})
export class PacientesComponent {
  private router = inject(Router);

  doctorName = 'DR. ÁNGEL ALCÍVAR';
  specialty = 'Medicina General';
  currentDate = '24 de abril de 2026';

  nombre = '';
  cedula = '';
  edad = '';
  telefono = '';
  direccion = '';
  genero = 'Masculino';
  tipoSangre = 'O+';
  alergias = '';

  buscar = '';
  mensaje = '';

  pacientes: Paciente[] = [
    {
      nombre: 'Lucía Torres',
      cedula: '0801234567',
      edad: '29',
      telefono: '0991122334',
      direccion: 'Esmeraldas',
      genero: 'Femenino',
      tipoSangre: 'O+',
      alergias: 'Ninguna'
    },
    {
      nombre: 'Mateo Cedeño',
      cedula: '0807654321',
      edad: '6',
      telefono: '0985566778',
      direccion: 'Tonsupa',
      genero: 'Masculino',
      tipoSangre: 'A+',
      alergias: 'Penicilina'
    }
  ];

  get pacientesFiltrados(): Paciente[] {
    const criterio = this.buscar.trim().toLowerCase();

    if (!criterio) {
      return this.pacientes;
    }

    return this.pacientes.filter((item) =>
      item.nombre.toLowerCase().includes(criterio) ||
      item.cedula.toLowerCase().includes(criterio) ||
      item.telefono.toLowerCase().includes(criterio)
    );
  }

  goDashboard(): void {
    this.router.navigate(['/medico/dashboard']);
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.router.navigate(['/']);
  }

  guardarPaciente(): void {
    this.mensaje = '';

    if (
      !this.nombre.trim() ||
      !this.cedula.trim() ||
      !this.edad.trim() ||
      !this.telefono.trim()
    ) {
      this.mensaje = 'Complete nombre, cédula, edad y teléfono.';
      return;
    }

    const existe = this.pacientes.some(
      (item) => item.cedula.trim() === this.cedula.trim()
    );

    if (existe) {
      this.mensaje = 'Ya existe un paciente con esa cédula.';
      return;
    }

    this.pacientes.unshift({
      nombre: this.nombre,
      cedula: this.cedula,
      edad: this.edad,
      telefono: this.telefono,
      direccion: this.direccion,
      genero: this.genero,
      tipoSangre: this.tipoSangre,
      alergias: this.alergias
    });

    this.limpiarFormulario();
    this.mensaje = 'Paciente registrado correctamente.';
  }

  limpiarFormulario(): void {
    this.nombre = '';
    this.cedula = '';
    this.edad = '';
    this.telefono = '';
    this.direccion = '';
    this.genero = 'Masculino';
    this.tipoSangre = 'O+';
    this.alergias = '';
  }

  eliminarPaciente(index: number, paciente: Paciente): void {
    const indiceReal = this.pacientes.findIndex(
      (item) => item.cedula === paciente.cedula
    );

    if (indiceReal >= 0) {
      this.pacientes.splice(indiceReal, 1);
    }
  }
}