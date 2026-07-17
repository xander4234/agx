import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface MedicamentoItem {
  medicamento: string;
  presentacion: string;
  dosis: string;
  frecuencia: string;
  duracion: string;
  indicaciones: string;
}

@Component({
  selector: 'app-recetas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recetas.component.html',
  styleUrls: ['./recetas.component.css']
})
export class RecetasComponent {
  private router = inject(Router);

  doctorName = 'DR. ÁNGEL ALCÍVAR';
  specialty = 'Medicina General';
  license = 'MSP-45877';
  clinicName = 'AGX Salud';
  clinicSubtitle = 'Receta médica profesional';

  patientName = '';
  patientAddress = '';
  patientAge = '';
  diagnosis = '';
  notes = '';
  date = new Date().toLocaleDateString('es-EC');

  medications: MedicamentoItem[] = [
    {
      medicamento: '',
      presentacion: '',
      dosis: '',
      frecuencia: '',
      duracion: '',
      indicaciones: ''
    }
  ];

  get filledMedications(): MedicamentoItem[] {
    const data = this.medications.filter((item) =>
      item.medicamento.trim() ||
      item.presentacion.trim() ||
      item.dosis.trim() ||
      item.frecuencia.trim() ||
      item.duracion.trim() ||
      item.indicaciones.trim()
    );

    return data.length ? data : this.medications;
  }

  addMedication(): void {
    this.medications.push({
      medicamento: '',
      presentacion: '',
      dosis: '',
      frecuencia: '',
      duracion: '',
      indicaciones: ''
    });
  }

  removeMedication(index: number): void {
    if (this.medications.length > 1) {
      this.medications.splice(index, 1);
    }
  }

  goDashboard(): void {
    this.router.navigate(['/medico/dashboard']);
  }

  private escapeHtml(value: string): string {
    return (value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private buildMedicationRows(): string {
    const rows = this.filledMedications.map((item) => `
      <tr>
        <td>${this.escapeHtml(item.medicamento || '—')}</td>
        <td>${this.escapeHtml(item.presentacion || '—')}</td>
        <td>${this.escapeHtml(item.dosis || '—')}</td>
        <td>${this.escapeHtml(item.frecuencia || '—')}</td>
        <td>${this.escapeHtml(item.duracion || '—')}</td>
        <td>${this.escapeHtml(item.indicaciones || '—')}</td>
      </tr>
    `).join('');

    return rows || `
      <tr>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
      </tr>
    `;
  }

  printRecipe(): void {
    const popup = window.open('', '_blank', 'width=900,height=1200');

    if (!popup) {
      return;
    }

    const content = `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <title>Receta médica</title>
          <style>
            @page {
              size: A4;
              margin: 10mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              font-family: Arial, Helvetica, sans-serif;
              color: #0f172a;
              background: #ffffff;
            }

            .rx-page {
              position: relative;
              min-height: 100vh;
              padding: 26px 28px 34px;
              border: 2px solid #d9ecea;
              overflow: hidden;
              background: #ffffff;
            }

            .rx-page::before {
              content: '';
              position: absolute;
              right: -70px;
              top: -70px;
              width: 220px;
              height: 220px;
              border-radius: 50%;
              background: radial-gradient(circle, rgba(45, 212, 191, 0.16), transparent 70%);
            }

            .rx-page::after {
              content: '';
              position: absolute;
              right: -55px;
              bottom: -40px;
              width: 170px;
              height: 170px;
              border-radius: 50%;
              border: 8px solid rgba(45, 212, 191, 0.32);
            }

            .rx-header {
              display: grid;
              grid-template-columns: 92px 1fr 200px;
              gap: 16px;
              align-items: start;
              margin-bottom: 18px;
            }

            .rx-logo {
              width: 82px;
              height: 82px;
              border-radius: 22px;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #0f766e;
              font-size: 46px;
              font-weight: 800;
              border: 2px solid #99f6e4;
              background: #f0fdfa;
            }

            .rx-brand h1 {
              margin: 0;
              font-size: 34px;
              line-height: 1;
              color: #0f172a;
              font-weight: 800;
              text-transform: uppercase;
            }

            .rx-brand h2 {
              margin: 6px 0 0;
              font-size: 14px;
              letter-spacing: 3px;
              color: #0f766e;
              font-weight: 700;
              text-transform: uppercase;
            }

            .rx-brand .license {
              margin-top: 14px;
              font-size: 11px;
              color: #64748b;
            }

            .rx-hospital {
              text-align: right;
              padding-top: 8px;
            }

            .rx-hospital .title {
              font-size: 26px;
              font-weight: 800;
              color: #0f766e;
              line-height: 1;
            }

            .rx-hospital .sub {
              margin-top: 4px;
              font-size: 11px;
              color: #64748b;
              font-weight: 700;
            }

            .rx-divider {
              height: 3px;
              background: linear-gradient(90deg, #14b8a6, #2dd4bf);
              margin: 10px 0 18px;
            }

            .patient-grid {
              display: grid;
              grid-template-columns: 1fr;
              gap: 10px;
              margin-bottom: 16px;
            }

            .line-row {
              display: grid;
              grid-template-columns: 84px 1fr;
              gap: 10px;
              align-items: center;
            }

            .line-row.two {
              grid-template-columns: 48px 1fr 60px 1fr;
            }

            .line-label {
              font-size: 13px;
              color: #334155;
              font-weight: 700;
            }

            .line-value {
              min-height: 24px;
              border-bottom: 2px solid #cbd5e1;
              font-size: 13px;
              color: #0f172a;
              padding: 2px 4px;
            }

            .diagnosis-block {
              margin-bottom: 12px;
            }

            .diagnosis-block .line-value {
              min-height: 32px;
            }

            .rx-symbol {
              font-size: 72px;
              font-weight: 800;
              color: #0f766e;
              line-height: 1;
              margin: 8px 0 14px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
            }

            th,
            td {
              border: 1px solid #dbe6ea;
              padding: 9px 8px;
              text-align: left;
              vertical-align: top;
              font-size: 12px;
            }

            th {
              background: #ecfeff;
              color: #0f766e;
              font-weight: 800;
            }

            .obs {
              margin-top: 16px;
            }

            .obs-title {
              font-size: 12px;
              font-weight: 800;
              color: #334155;
              margin-bottom: 6px;
              text-transform: uppercase;
            }

            .obs-text {
              font-size: 13px;
              color: #0f172a;
              line-height: 1.5;
              min-height: 36px;
            }

            .signature-wrap {
              margin-top: 40px;
              display: flex;
              justify-content: flex-end;
            }

            .signature {
              width: 260px;
              text-align: center;
              border-top: 1px solid #94a3b8;
              padding-top: 8px;
              font-size: 13px;
              color: #334155;
            }

            .signature strong {
              display: block;
              font-size: 14px;
              margin-bottom: 3px;
              color: #0f172a;
            }

            .footer-info {
              position: absolute;
              left: 24px;
              bottom: 14px;
              display: grid;
              gap: 4px;
              font-size: 11px;
              color: #64748b;
            }
          </style>
        </head>
        <body>
          <div class="rx-page">
            <div class="rx-header">
              <div class="rx-logo">⚕</div>

              <div class="rx-brand">
                <h1>${this.escapeHtml(this.doctorName || 'Nombre del médico')}</h1>
                <h2>${this.escapeHtml(this.specialty || 'Especialidad')}</h2>
                <div class="license">Registro profesional ${this.escapeHtml(this.license || '—')}</div>
              </div>

              <div class="rx-hospital">
                <div class="title">${this.escapeHtml(this.clinicName || 'AGX Salud')}</div>
                <div class="sub">${this.escapeHtml(this.clinicSubtitle || 'Receta médica profesional')}</div>
              </div>
            </div>

            <div class="rx-divider"></div>

            <div class="patient-grid">
              <div class="line-row">
                <div class="line-label">Paciente:</div>
                <div class="line-value">${this.escapeHtml(this.patientName || '')}</div>
              </div>

              <div class="line-row">
                <div class="line-label">Dirección:</div>
                <div class="line-value">${this.escapeHtml(this.patientAddress || '')}</div>
              </div>

              <div class="line-row two">
                <div class="line-label">Edad:</div>
                <div class="line-value">${this.escapeHtml(this.patientAge || '')}</div>
                <div class="line-label">Fecha:</div>
                <div class="line-value">${this.escapeHtml(this.date || '')}</div>
              </div>
            </div>

            <div class="diagnosis-block">
              <div class="line-row">
                <div class="line-label">Diagnóstico:</div>
                <div class="line-value">${this.escapeHtml(this.diagnosis || '')}</div>
              </div>
            </div>

            <div class="rx-symbol">℞</div>

            <table>
              <thead>
                <tr>
                  <th>Medicamento</th>
                  <th>Presentación</th>
                  <th>Dosis</th>
                  <th>Frecuencia</th>
                  <th>Duración</th>
                  <th>Indicaciones</th>
                </tr>
              </thead>
              <tbody>
                ${this.buildMedicationRows()}
              </tbody>
            </table>

            <div class="obs">
              <div class="obs-title">Observaciones</div>
              <div class="obs-text">${this.escapeHtml(this.notes || 'Sin observaciones adicionales.')}</div>
            </div>

            <div class="signature-wrap">
              <div class="signature">
                <strong>${this.escapeHtml(this.doctorName || '')}</strong>
                ${this.escapeHtml(this.specialty || '')}
              </div>
            </div>

            <div class="footer-info">
              <div>${this.escapeHtml(this.clinicName || 'AGX Salud')}</div>
              <div>Documento generado desde el sistema médico</div>
            </div>
          </div>
        </body>
      </html>
    `;

    popup.document.open();
    popup.document.write(content);
    popup.document.close();

    setTimeout(() => {
      popup.focus();
      popup.print();
    }, 700);
  }
}