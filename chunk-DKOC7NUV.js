import{a as O,b as W,e as R,k}from"./chunk-IVN5JHY4.js";import{A as M,C as i,D as t,F as y,G as u,H as v,I as r,K as C,N as s,O as c,P as p,R as w,X as S,Z as E,ba as P,j as x,l as b,p as g,q as m,u as l,y as _}from"./chunk-AUZNYQC4.js";function z(h,f){if(h&1){let o=y();i(0,"div",21)(1,"div",22)(2,"strong"),r(3),t(),i(4,"button",23),u("click",function(){let e=g(o).index,a=v();return m(a.removeMedication(e))}),r(5," Eliminar "),t()(),i(6,"div",9)(7,"div",10)(8,"label"),r(9,"Medicamento"),t(),i(10,"input",24),p("ngModelChange",function(e){let a=g(o).$implicit;return c(a.medicamento,e)||(a.medicamento=e),m(e)}),t()(),i(11,"div",10)(12,"label"),r(13,"Presentaci\xF3n"),t(),i(14,"input",25),p("ngModelChange",function(e){let a=g(o).$implicit;return c(a.presentacion,e)||(a.presentacion=e),m(e)}),t()(),i(15,"div",10)(16,"label"),r(17,"Dosis"),t(),i(18,"input",26),p("ngModelChange",function(e){let a=g(o).$implicit;return c(a.dosis,e)||(a.dosis=e),m(e)}),t()(),i(19,"div",10)(20,"label"),r(21,"Frecuencia"),t(),i(22,"input",27),p("ngModelChange",function(e){let a=g(o).$implicit;return c(a.frecuencia,e)||(a.frecuencia=e),m(e)}),t()(),i(23,"div",10)(24,"label"),r(25,"Duraci\xF3n"),t(),i(26,"input",28),p("ngModelChange",function(e){let a=g(o).$implicit;return c(a.duracion,e)||(a.duracion=e),m(e)}),t()(),i(27,"div",12)(28,"label"),r(29,"Indicaciones"),t(),i(30,"textarea",29),p("ngModelChange",function(e){let a=g(o).$implicit;return c(a.indicaciones,e)||(a.indicaciones=e),m(e)}),t()()()()}if(h&2){let o=f.$implicit,d=f.index;l(3),C("Medicamento ",d+1,""),l(7),s("ngModel",o.medicamento),l(4),s("ngModel",o.presentacion),l(4),s("ngModel",o.dosis),l(4),s("ngModel",o.frecuencia),l(4),s("ngModel",o.duracion),l(4),s("ngModel",o.indicaciones)}}var B=(()=>{class h{constructor(){this.router=x(P),this.doctorName="DR. \xC1NGEL ALC\xCDVAR",this.specialty="Medicina General",this.license="MSP-45877",this.clinicName="AGX Salud",this.clinicSubtitle="Receta m\xE9dica profesional",this.patientName="",this.patientAddress="",this.patientAge="",this.diagnosis="",this.notes="",this.date=new Date().toLocaleDateString("es-EC"),this.medications=[{medicamento:"",presentacion:"",dosis:"",frecuencia:"",duracion:"",indicaciones:""}]}get filledMedications(){let o=this.medications.filter(d=>d.medicamento.trim()||d.presentacion.trim()||d.dosis.trim()||d.frecuencia.trim()||d.duracion.trim()||d.indicaciones.trim());return o.length?o:this.medications}addMedication(){this.medications.push({medicamento:"",presentacion:"",dosis:"",frecuencia:"",duracion:"",indicaciones:""})}removeMedication(o){this.medications.length>1&&this.medications.splice(o,1)}goDashboard(){this.router.navigate(["/medico/dashboard"])}escapeHtml(o){return(o||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}buildMedicationRows(){return this.filledMedications.map(d=>`
      <tr>
        <td>${this.escapeHtml(d.medicamento||"\u2014")}</td>
        <td>${this.escapeHtml(d.presentacion||"\u2014")}</td>
        <td>${this.escapeHtml(d.dosis||"\u2014")}</td>
        <td>${this.escapeHtml(d.frecuencia||"\u2014")}</td>
        <td>${this.escapeHtml(d.duracion||"\u2014")}</td>
        <td>${this.escapeHtml(d.indicaciones||"\u2014")}</td>
      </tr>
    `).join("")||`
      <tr>
        <td>\u2014</td>
        <td>\u2014</td>
        <td>\u2014</td>
        <td>\u2014</td>
        <td>\u2014</td>
        <td>\u2014</td>
      </tr>
    `}printRecipe(){let o=window.open("","_blank","width=900,height=1200");if(!o)return;let d=`
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <title>Receta m\xE9dica</title>
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
              <div class="rx-logo">\u2695</div>

              <div class="rx-brand">
                <h1>${this.escapeHtml(this.doctorName||"Nombre del m\xE9dico")}</h1>
                <h2>${this.escapeHtml(this.specialty||"Especialidad")}</h2>
                <div class="license">Registro profesional ${this.escapeHtml(this.license||"\u2014")}</div>
              </div>

              <div class="rx-hospital">
                <div class="title">${this.escapeHtml(this.clinicName||"AGX Salud")}</div>
                <div class="sub">${this.escapeHtml(this.clinicSubtitle||"Receta m\xE9dica profesional")}</div>
              </div>
            </div>

            <div class="rx-divider"></div>

            <div class="patient-grid">
              <div class="line-row">
                <div class="line-label">Paciente:</div>
                <div class="line-value">${this.escapeHtml(this.patientName||"")}</div>
              </div>

              <div class="line-row">
                <div class="line-label">Direcci\xF3n:</div>
                <div class="line-value">${this.escapeHtml(this.patientAddress||"")}</div>
              </div>

              <div class="line-row two">
                <div class="line-label">Edad:</div>
                <div class="line-value">${this.escapeHtml(this.patientAge||"")}</div>
                <div class="line-label">Fecha:</div>
                <div class="line-value">${this.escapeHtml(this.date||"")}</div>
              </div>
            </div>

            <div class="diagnosis-block">
              <div class="line-row">
                <div class="line-label">Diagn\xF3stico:</div>
                <div class="line-value">${this.escapeHtml(this.diagnosis||"")}</div>
              </div>
            </div>

            <div class="rx-symbol">\u211E</div>

            <table>
              <thead>
                <tr>
                  <th>Medicamento</th>
                  <th>Presentaci\xF3n</th>
                  <th>Dosis</th>
                  <th>Frecuencia</th>
                  <th>Duraci\xF3n</th>
                  <th>Indicaciones</th>
                </tr>
              </thead>
              <tbody>
                ${this.buildMedicationRows()}
              </tbody>
            </table>

            <div class="obs">
              <div class="obs-title">Observaciones</div>
              <div class="obs-text">${this.escapeHtml(this.notes||"Sin observaciones adicionales.")}</div>
            </div>

            <div class="signature-wrap">
              <div class="signature">
                <strong>${this.escapeHtml(this.doctorName||"")}</strong>
                ${this.escapeHtml(this.specialty||"")}
              </div>
            </div>

            <div class="footer-info">
              <div>${this.escapeHtml(this.clinicName||"AGX Salud")}</div>
              <div>Documento generado desde el sistema m\xE9dico</div>
            </div>
          </div>
        </body>
      </html>
    `;o.document.open(),o.document.write(d),o.document.close(),setTimeout(()=>{o.focus(),o.print()},700)}static{this.\u0275fac=function(d){return new(d||h)}}static{this.\u0275cmp=b({type:h,selectors:[["app-recetas"]],standalone:!0,features:[w],decls:78,vars:12,consts:[[1,"recipe-shell"],[1,"recipe-header"],[1,"badge"],[1,"header-actions"],["type","button",1,"btn-secondary",3,"click"],["type","button",1,"btn-primary",3,"click"],[1,"recipe-grid"],[1,"form-panel"],[1,"panel-card"],[1,"form-grid"],[1,"form-group"],["type","text",3,"ngModelChange","ngModel"],[1,"form-group","full-col"],["type","text","placeholder","Nombre del paciente",3,"ngModelChange","ngModel"],["type","text","placeholder","Direcci\xF3n del paciente",3,"ngModelChange","ngModel"],["type","text","placeholder","Edad",3,"ngModelChange","ngModel"],["rows","3","placeholder","Diagn\xF3stico o motivo de consulta",3,"ngModelChange","ngModel"],[1,"panel-row"],["type","button",1,"btn-primary","small",3,"click"],["class","med-card",4,"ngFor","ngForOf"],["rows","4","placeholder","Observaciones m\xE9dicas, recomendaciones y advertencias",3,"ngModelChange","ngModel"],[1,"med-card"],[1,"panel-row","med-title"],["type","button",1,"btn-danger",3,"click"],["type","text","placeholder","Ej. Amoxicilina",3,"ngModelChange","ngModel"],["type","text","placeholder","Ej. 500 mg tabletas",3,"ngModelChange","ngModel"],["type","text","placeholder","Ej. 1 tableta",3,"ngModelChange","ngModel"],["type","text","placeholder","Ej. cada 8 horas",3,"ngModelChange","ngModel"],["type","text","placeholder","Ej. 7 d\xEDas",3,"ngModelChange","ngModel"],["rows","2","placeholder","Indicaciones espec\xEDficas para el paciente",3,"ngModelChange","ngModel"]],template:function(d,e){d&1&&(i(0,"section",0)(1,"div",1)(2,"div")(3,"span",2),r(4,"Receta m\xE9dica"),t(),i(5,"h1"),r(6,"Emisi\xF3n de receta"),t(),i(7,"p"),r(8,"Ingresa medicamentos, dosis e indicaciones y genera una impresi\xF3n profesional."),t()(),i(9,"div",3)(10,"button",4),u("click",function(){return e.goDashboard()}),r(11,"Volver"),t(),i(12,"button",5),u("click",function(){return e.printRecipe()}),r(13,"Imprimir receta"),t()()(),i(14,"div",6)(15,"div",7)(16,"div",8)(17,"h3"),r(18,"Datos del profesional"),t(),i(19,"div",9)(20,"div",10)(21,"label"),r(22,"M\xE9dico"),t(),i(23,"input",11),p("ngModelChange",function(n){return c(e.doctorName,n)||(e.doctorName=n),n}),t()(),i(24,"div",10)(25,"label"),r(26,"Especialidad"),t(),i(27,"input",11),p("ngModelChange",function(n){return c(e.specialty,n)||(e.specialty=n),n}),t()(),i(28,"div",10)(29,"label"),r(30,"Registro profesional"),t(),i(31,"input",11),p("ngModelChange",function(n){return c(e.license,n)||(e.license=n),n}),t()(),i(32,"div",10)(33,"label"),r(34,"Fecha"),t(),i(35,"input",11),p("ngModelChange",function(n){return c(e.date,n)||(e.date=n),n}),t()(),i(36,"div",10)(37,"label"),r(38,"Cl\xEDnica / Hospital"),t(),i(39,"input",11),p("ngModelChange",function(n){return c(e.clinicName,n)||(e.clinicName=n),n}),t()(),i(40,"div",10)(41,"label"),r(42,"Subt\xEDtulo"),t(),i(43,"input",11),p("ngModelChange",function(n){return c(e.clinicSubtitle,n)||(e.clinicSubtitle=n),n}),t()()()(),i(44,"div",8)(45,"h3"),r(46,"Datos del paciente"),t(),i(47,"div",9)(48,"div",12)(49,"label"),r(50,"Paciente"),t(),i(51,"input",13),p("ngModelChange",function(n){return c(e.patientName,n)||(e.patientName=n),n}),t()(),i(52,"div",12)(53,"label"),r(54,"Direcci\xF3n"),t(),i(55,"input",14),p("ngModelChange",function(n){return c(e.patientAddress,n)||(e.patientAddress=n),n}),t()(),i(56,"div",10)(57,"label"),r(58,"Edad"),t(),i(59,"input",15),p("ngModelChange",function(n){return c(e.patientAge,n)||(e.patientAge=n),n}),t()(),i(60,"div",12)(61,"label"),r(62,"Diagn\xF3stico"),t(),i(63,"textarea",16),p("ngModelChange",function(n){return c(e.diagnosis,n)||(e.diagnosis=n),n}),t()()()(),i(64,"div",8)(65,"div",17)(66,"h3"),r(67,"Medicamentos"),t(),i(68,"button",18),u("click",function(){return e.addMedication()}),r(69," Agregar medicamento "),t()(),_(70,z,31,7,"div",19),t(),i(71,"div",8)(72,"h3"),r(73,"Observaciones"),t(),i(74,"div",12)(75,"label"),r(76,"Notas adicionales"),t(),i(77,"textarea",20),p("ngModelChange",function(n){return c(e.notes,n)||(e.notes=n),n}),t()()()()()()),d&2&&(l(23),s("ngModel",e.doctorName),l(4),s("ngModel",e.specialty),l(4),s("ngModel",e.license),l(4),s("ngModel",e.date),l(4),s("ngModel",e.clinicName),l(4),s("ngModel",e.clinicSubtitle),l(8),s("ngModel",e.patientName),l(4),s("ngModel",e.patientAddress),l(4),s("ngModel",e.patientAge),l(4),s("ngModel",e.diagnosis),l(7),M("ngForOf",e.medications),l(7),s("ngModel",e.notes))},dependencies:[E,S,k,O,W,R],styles:["[_nghost-%COMP%]{display:block;min-height:100vh;font-family:Arial,Helvetica,sans-serif}*[_ngcontent-%COMP%]{box-sizing:border-box}.recipe-shell[_ngcontent-%COMP%]{min-height:100vh;padding:24px;background:radial-gradient(circle at top right,rgba(45,212,191,.14),transparent 24%),linear-gradient(180deg,#edf5f6,#e8f1f3)}.recipe-header[_ngcontent-%COMP%]{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:22px}.badge[_ngcontent-%COMP%]{display:inline-block;margin-bottom:12px;padding:9px 16px;border-radius:999px;background:#14b8a61f;color:#0f766e;font-size:13px;font-weight:700}.recipe-header[_ngcontent-%COMP%]   h1[_ngcontent-%COMP%]{margin:0 0 10px;font-size:42px;color:#0f172a}.recipe-header[_ngcontent-%COMP%]   p[_ngcontent-%COMP%]{margin:0;color:#64748b;font-size:15px}.header-actions[_ngcontent-%COMP%]{display:flex;gap:12px;flex-wrap:wrap}.recipe-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:1fr;gap:20px}.form-panel[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:18px}.panel-card[_ngcontent-%COMP%]{padding:22px;border-radius:24px;background:#ffffffdb;border:1px solid rgba(203,213,225,.85);box-shadow:0 14px 32px #0f172a0d}.panel-card[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%]{margin:0 0 16px;font-size:24px;color:#0f172a}.form-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.form-group[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:8px}.form-group.full-col[_ngcontent-%COMP%]{grid-column:1 / -1}.form-group[_ngcontent-%COMP%]   label[_ngcontent-%COMP%]{font-size:13px;font-weight:700;color:#475569}.form-group[_ngcontent-%COMP%]   input[_ngcontent-%COMP%], .form-group[_ngcontent-%COMP%]   textarea[_ngcontent-%COMP%]{width:100%;border:1px solid #dbe6ea;border-radius:14px;padding:14px 16px;font-size:14px;background:#fff;color:#0f172a;outline:none}.form-group[_ngcontent-%COMP%]   input[_ngcontent-%COMP%]:focus, .form-group[_ngcontent-%COMP%]   textarea[_ngcontent-%COMP%]:focus{border-color:#14b8a6;box-shadow:0 0 0 4px #14b8a61a}.panel-row[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.med-card[_ngcontent-%COMP%]{margin-top:14px;padding:16px;border-radius:18px;background:#f8fbfc;border:1px solid #e2ecef}.med-title[_ngcontent-%COMP%]{margin-bottom:12px}.btn-primary[_ngcontent-%COMP%], .btn-secondary[_ngcontent-%COMP%], .btn-danger[_ngcontent-%COMP%]{border:none;border-radius:14px;padding:13px 18px;font-size:14px;font-weight:700;cursor:pointer}.btn-primary[_ngcontent-%COMP%]{background:linear-gradient(135deg,#0ea5a4,#2dd4bf);color:#fff}.btn-secondary[_ngcontent-%COMP%]{background:#fff;color:#0f172a;border:1px solid #dbe6ea}.btn-danger[_ngcontent-%COMP%]{background:#fee2e2;color:#991b1b}.btn-primary.small[_ngcontent-%COMP%]{padding:11px 16px}@media (max-width: 700px){.recipe-shell[_ngcontent-%COMP%]{padding:16px}.form-grid[_ngcontent-%COMP%]{grid-template-columns:1fr}.recipe-header[_ngcontent-%COMP%]   h1[_ngcontent-%COMP%]{font-size:32px}.header-actions[_ngcontent-%COMP%]{width:100%}.header-actions[_ngcontent-%COMP%]   button[_ngcontent-%COMP%]{flex:1}}"]})}}return h})();export{B as RecetasComponent};
