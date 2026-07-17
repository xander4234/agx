/* AGX Salud — Dashboard Médico */
const API = "/api";
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let token = localStorage.getItem("agx_token") || "";
let me = (() => { try { return JSON.parse(localStorage.getItem("agx_me")); } catch { return null; } })();
let socket = null;
let currentThreadId = null;

// caches
let PATIENTS = [];
let APPTS = [];
let QUEUE = [];
let hcPatientId = null;
let soapApptId = null;

/* ================= helpers ================= */
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function fmtDate(iso){ try { return new Date(iso).toLocaleString("es-EC", { dateStyle:"short", timeStyle:"short" }); } catch { return iso; } }
function fmtDay(iso){ try { return new Date(iso).toLocaleDateString("es-EC", { dateStyle:"short" }); } catch { return iso; } }
function fmtTime(iso){ try { return new Date(iso).toLocaleTimeString("es-EC", { hour:"2-digit", minute:"2-digit" }); } catch { return iso; } }
function todayStr(){ return new Date().toLocaleDateString("es-EC", { day:"numeric", month:"long", year:"numeric" }); }

function pill(status){
  const map = {
    scheduled:["Pendiente","info"], confirmed:["Confirmada","ok"], waiting:["En espera","wait"],
    in_progress:["En atención","info"], done:["Finalizada","ok"], canceled:["Cancelada","bad"],
  };
  const [label, cls] = map[status] || [status, "info"];
  return `<span class="pill ${cls}">${label}</span>`;
}

async function api(path, options = {}){
  const headers = options.headers || {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok){
    const text = await res.text().catch(()=> "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

/* ================= navigation ================= */
function setView(name){
  $$(".tab").forEach(b => b.classList.toggle("is-active", b.dataset.view === name));
  $$(".view").forEach(v => v.classList.add("hidden"));
  const el = $("#view-" + name);
  if (el) el.classList.remove("hidden");
}
$("#tabs").addEventListener("click", (e)=>{
  const b = e.target.closest("button[data-view]");
  if (b) setView(b.dataset.view);
});
document.addEventListener("click", (e)=>{
  const nav = e.target.closest("[data-nav]");
  if (nav) setView(nav.dataset.nav);
});

/* ================= auth ================= */
function showApp(){
  $("#loginScreen").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
  const name = me?.name || "—";
  const rolMap = { admin:"Administración", provider:"Medicina General", staff:"Personal" };
  $("#heroSub").textContent = `Bienvenido, ${name.toUpperCase()} · ${rolMap[me?.role] || ""} · ${todayStr()}`;
}
function showLogin(){
  token = ""; me = null;
  localStorage.removeItem("agx_token");
  localStorage.removeItem("agx_me");
  if (socket){ socket.disconnect(); socket = null; }
  $("#appShell").classList.add("hidden");
  $("#loginScreen").classList.remove("hidden");
}

$("#loginForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const msg = $("#loginMsg");
  msg.textContent = "Ingresando…";
  const fd = new FormData(e.target);
  try{
    const res = await fetch(`${API}/auth/login`, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") })
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    token = data.token; me = data.user;
    localStorage.setItem("agx_token", token);
    localStorage.setItem("agx_me", JSON.stringify(me));
    msg.textContent = "";
    showApp();
    setView("dashboard");
    await loadAll();
  }catch{
    msg.textContent = "Credenciales incorrectas.";
  }
});
$("#btnLogout").addEventListener("click", showLogin);

/* ================= data load ================= */
async function loadAll(){
  [PATIENTS, APPTS, QUEUE] = await Promise.all([
    api("/patients?limit=200"),
    api("/appointments"),
    api("/appointments/queue"),
  ]);
  renderDashboard();
  renderAgenda();
  renderPatients(PATIENTS);
  renderQueue();
  renderChatAppts();
  fillPatientSelects();
  await loadPrescriptions();
}

function fillPatientSelects(){
  const opts = PATIENTS.map(p => `<option value="${p.id}">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</option>`).join("");
  ["#apptPatient","#walkinPatient","#rxPatient"].forEach(sel => { $(sel).innerHTML = opts; });
  $("#hcPatient").innerHTML = `<option value="">— Selecciona paciente —</option>` + opts;
  syncRxAppointments();
}

/* ================= dashboard ================= */
function renderDashboard(){
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today.getTime() + 86400000);
  const todays = APPTS.filter(a => { const d = new Date(a.starts_at); return d >= today && d < tomorrow; })
                      .sort((a,b)=> new Date(a.starts_at) - new Date(b.starts_at));
  const pending = APPTS.filter(a => ["scheduled","confirmed","waiting"].includes(a.status));
  const urgent = QUEUE.filter(a => a.status === "waiting");

  $("#statPatients").textContent = PATIENTS.length.toLocaleString("es-EC");
  $("#statToday").textContent = todays.length;
  $("#statPending").textContent = pending.length;
  $("#badgeToday").textContent = todays.length ? `+${todays.length}` : "";
  $("#badgePending").textContent = urgent.length ? `${urgent.length} urgentes` : "";
  $("#badgePatients").textContent = "";

  // agenda de hoy
  const list = todays.slice(0, 8).map(a => `
    <div class="agenda-item">
      <div class="agenda-time">${fmtTime(a.starts_at)}</div>
      <div class="agenda-info">
        <b>${escapeHtml(a.first_name)} ${escapeHtml(a.last_name)}</b>
        <span>${escapeHtml(a.reason || (a.type === "virtual" ? "Consulta virtual" : "Consulta"))}</span>
      </div>
      <div class="agenda-actions">${pill(a.status)}</div>
    </div>
  `).join("");
  $("#todayList").innerHTML = list || `<div class="empty">No hay consultas programadas para hoy</div>`;

  // pacientes recientes
  const recent = PATIENTS.slice(0, 6);
  $("#recentPatients").innerHTML = recent.length ? `
    <table class="tbl">
      <thead><tr><th>Paciente</th><th>Contacto</th><th>Antecedentes</th><th>Registro</th></tr></thead>
      <tbody>${recent.map(p => `
        <tr>
          <td><b>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</b></td>
          <td>${escapeHtml(p.phone || "—")}</td>
          <td>${escapeHtml(p.conditions || "—")}</td>
          <td>${fmtDay(p.created_at)}</td>
        </tr>`).join("")}
      </tbody>
    </table>` : `<div class="empty">Sin pacientes aún</div>`;

  // tareas pendientes derivadas de datos reales
  const todo = [];
  if (urgent.length) todo.push(`Atender ${urgent.length} paciente(s) en cola de espera`);
  const porConfirmar = todays.filter(a => a.status === "scheduled").length;
  if (porConfirmar) todo.push(`Confirmar ${porConfirmar} cita(s) de hoy`);
  const virtuales = todays.filter(a => a.type === "virtual" && !["done","canceled"].includes(a.status)).length;
  if (virtuales) todo.push(`Preparar ${virtuales} consulta(s) virtual(es)`);
  if (!todo.length) todo.push("Sin tareas pendientes ✅");
  $("#todoList").innerHTML = todo.map(t => `<li>${escapeHtml(t)}</li>`).join("");

  renderWeekChart();
}

/* ================= widgets de salud ================= */
function renderWeekChart(){
  const el = $("#weekChart");
  if (!el) return;
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--){
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push(d);
  }
  const counts = days.map(d => {
    const next = new Date(d.getTime() + 86400000);
    return APPTS.filter(a => { const t = new Date(a.starts_at); return t >= d && t < next; }).length;
  });
  const max = Math.max(...counts, 1);
  const total = counts.reduce((a,b)=>a+b, 0);
  $("#weekTotal").textContent = total ? `${total} cita(s)` : "";

  el.innerHTML = days.map((d, i) => {
    const h = Math.round((counts[i] / max) * 100);
    const isToday = i === 6;
    const dayName = d.toLocaleDateString("es-EC", { weekday: "short" });
    return `<div class="wbar ${isToday ? "today" : ""}">
      <div class="num">${counts[i] || ""}</div>
      <div class="bar" style="height:${Math.max(h, 5)}%" title="${counts[i]} cita(s)"></div>
      <div class="day">${dayName}</div>
    </div>`;
  }).join("");
}

/* --- consejos de salud rotativos --- */
const HEALTH_TIPS = [
  ["💧", "Beber al menos 8 vasos de agua al día ayuda a mantener la presión arterial estable y mejora la concentración."],
  ["🚶", "Caminar 30 minutos diarios reduce hasta un 30% el riesgo de enfermedades cardiovasculares."],
  ["🥗", "Consumir 5 porciones de frutas y verduras al día fortalece el sistema inmunológico."],
  ["😴", "Dormir entre 7 y 8 horas mejora la memoria y regula el metabolismo."],
  ["🧂", "Reducir la sal a menos de 5g diarios ayuda a controlar la hipertensión arterial."],
  ["🩺", "Un control médico preventivo al año permite detectar enfermedades a tiempo."],
  ["🧘", "5 minutos de respiración profunda al día reducen el estrés y la frecuencia cardiaca."],
  ["🦷", "Cepillarse los dientes 3 veces al día previene infecciones que pueden afectar al corazón."],
];
let tipIdx = 0;
function showTip(i){
  const icon = $("#tipIcon"), text = $("#tipText"), dots = $("#tipDots");
  if (!icon || !text) return;
  tipIdx = i % HEALTH_TIPS.length;
  text.classList.add("fade");
  setTimeout(()=>{
    icon.textContent = HEALTH_TIPS[tipIdx][0];
    text.textContent = HEALTH_TIPS[tipIdx][1];
    text.classList.remove("fade");
    dots.innerHTML = HEALTH_TIPS.map((_, j) => `<span class="${j === tipIdx ? "on" : ""}" data-tip="${j}"></span>`).join("");
  }, 350);
}
$("#tipDots")?.addEventListener("click", (e)=>{
  const d = e.target.closest("span[data-tip]");
  if (d) showTip(Number(d.dataset.tip));
});
showTip(Math.floor(Math.random() * HEALTH_TIPS.length));
setInterval(()=> showTip(tipIdx + 1), 9000);

/* --- calculadora IMC --- */
function calcIMC(){
  const peso = Number($("#imcPeso")?.value);
  const talla = Number($("#imcTalla")?.value) / 100;
  const box = $("#imcResult");
  if (!peso || !talla || peso <= 0 || talla <= 0){ box?.classList.add("hidden"); return; }
  const imc = peso / (talla * talla);
  if (!Number.isFinite(imc) || imc < 5 || imc > 100){ box.classList.add("hidden"); return; }

  const cats = [
    [18.5, "Bajo peso", "#60a5fa"],
    [25,   "Peso normal", "#10b981"],
    [30,   "Sobrepeso", "#d97706"],
    [99,   "Obesidad", "#dc2626"],
  ];
  const [, label, color] = cats.find(([lim]) => imc < lim);
  $("#imcValue").textContent = imc.toFixed(1);
  $("#imcValue").style.color = color;
  $("#imcCat").textContent = label;
  $("#imcCat").style.color = color;
  // posición del marcador: escala 15–40
  const pct = Math.min(Math.max((imc - 15) / 25, 0), 1) * 100;
  $("#imcMarker").style.left = `calc(${pct}% - 2px)`;
  box.classList.remove("hidden");
}
$("#imcPeso")?.addEventListener("input", calcIMC);
$("#imcTalla")?.addEventListener("input", calcIMC);

/* --- tabs de herramientas clínicas --- */
$("#toolTabs")?.addEventListener("click", (e)=>{
  const b = e.target.closest("button[data-tool]");
  if (!b) return;
  $$(".tool-tab").forEach(t => t.classList.toggle("is-on", t === b));
  $$(".tool-panel").forEach(pn => pn.classList.add("hidden"));
  $("#tool-" + b.dataset.tool)?.classList.remove("hidden");
});

/* --- dosis pediátrica (mg/kg/día) --- */
function calcDosis(){
  const peso = Number($("#dosPeso")?.value);
  const mgkg = Number($("#dosMgKg")?.value);
  const tomas = Number($("#dosTomas")?.value) || 3;
  const box = $("#dosResult");
  if (!peso || !mgkg || peso <= 0 || mgkg <= 0 || tomas <= 0){ box?.classList.add("hidden"); return; }
  const totalDia = peso * mgkg;
  const porToma = totalDia / tomas;
  $("#dosValue").textContent = porToma >= 100 ? Math.round(porToma) : porToma.toFixed(1);
  $("#dosValue").style.color = "#0d9488";
  $("#dosTotal").textContent = `Total diario: ${Math.round(totalDia)} mg en ${tomas} toma(s). Verificar dosis máxima del fármaco.`;
  box.classList.remove("hidden");
}
["#dosPeso","#dosMgKg","#dosTomas"].forEach(id => $(id)?.addEventListener("input", calcDosis));

/* --- zonas de frecuencia cardiaca --- */
function calcCardio(){
  const edad = Number($("#carEdad")?.value);
  const box = $("#carResult");
  if (!edad || edad < 1 || edad > 120){ box?.classList.add("hidden"); return; }
  const max = 220 - edad;
  $("#carMax").textContent = max;
  $("#carMax").style.color = "#0d9488";
  $("#carZ1").textContent = `${Math.round(max*0.5)}–${Math.round(max*0.7)} lpm`;
  $("#carZ2").textContent = `${Math.round(max*0.7)}–${Math.round(max*0.85)} lpm`;
  box.classList.remove("hidden");
}
$("#carEdad")?.addEventListener("input", calcCardio);

/* --- clasificación de presión arterial (AHA) --- */
function calcPresion(){
  const sys = Number($("#paSys")?.value);
  const dia = Number($("#paDia")?.value);
  const box = $("#paResult");
  if (!sys || !dia || sys < 40 || dia < 20){ box?.classList.add("hidden"); return; }
  let cat, color, note;
  if (sys > 180 || dia > 120){ cat = "🚨 Crisis hipertensiva"; color = "#dc2626"; note = "Atención médica inmediata."; }
  else if (sys >= 140 || dia >= 90){ cat = "Hipertensión etapa 2"; color = "#dc2626"; note = "Requiere manejo médico."; }
  else if (sys >= 130 || dia >= 80){ cat = "Hipertensión etapa 1"; color = "#ea580c"; note = "Cambios de estilo de vida + control."; }
  else if (sys >= 120){ cat = "Elevada"; color = "#d97706"; note = "Vigilar y mejorar hábitos."; }
  else { cat = "Normal"; color = "#10b981"; note = "Presión arterial saludable."; }
  $("#paValue").textContent = `${sys}/${dia}`;
  $("#paValue").style.color = color;
  $("#paCat").textContent = cat;
  $("#paCat").style.color = color;
  $("#paNote").textContent = note;
  box.classList.remove("hidden");
}
["#paSys","#paDia"].forEach(id => $(id)?.addEventListener("input", calcPresion));

/* --- login: mostrar contraseña + taglines rotativos --- */
$("#togglePass")?.addEventListener("click", ()=>{
  const inp = $("#passInput");
  inp.type = inp.type === "password" ? "text" : "password";
  $("#togglePass").textContent = inp.type === "password" ? "👁️" : "🙈";
});
const TAGLINES = [
  "Gestión médica inteligente para tu equipo",
  "Agenda, historia clínica y recetas en un solo lugar",
  "Telemedicina y chat en tiempo real con tus pacientes",
  "Triage asistido con inteligencia artificial",
  "Cumple la normativa del MSP Ecuador",
];
let tagIdx = 0;
setInterval(()=>{
  const el = $("#loginTagline");
  if (!el) return;
  el.classList.add("fade");
  setTimeout(()=>{
    tagIdx = (tagIdx + 1) % TAGLINES.length;
    el.textContent = TAGLINES[tagIdx];
    el.classList.remove("fade");
  }, 380);
}, 5000);

/* ================= agenda ================= */
function apptActions(a){
  return `<div class="row-actions">
    ${a.status === "scheduled" ? `<button class="btn btn-outline btn-sm" data-status="${a.id}:confirmed">Confirmar</button>` : ""}
    ${["scheduled","confirmed"].includes(a.status) ? `<button class="btn btn-outline btn-sm" data-status="${a.id}:waiting">A cola</button>` : ""}
    ${["scheduled","waiting","confirmed"].includes(a.status) ? `<button class="btn btn-primary btn-sm" data-atender="${a.id}">Atender</button>` : ""}
    ${a.status === "in_progress" ? `<button class="btn btn-primary btn-sm" data-atender="${a.id}">Consulta</button>` : ""}
    ${a.type === "virtual" ? `<button class="btn btn-primary btn-sm" data-room="${a.id}">Sala</button>` : ""}
    <button class="btn btn-outline btn-sm" data-chat="${a.id}">Chat</button>
    <button class="btn btn-outline btn-sm" data-hc="${a.patient_id}">Historia</button>
    <button class="btn btn-outline btn-sm" data-rxgo="${a.patient_id}:${a.id}">Receta</button>
  </div>`;
}

function renderAgenda(){
  $("#apptTable").innerHTML = APPTS.length ? `
    <table class="tbl">
      <thead><tr><th>Paciente</th><th>Fecha</th><th>Tipo</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>${APPTS.map(a => `
        <tr>
          <td><b>${escapeHtml(a.first_name)} ${escapeHtml(a.last_name)}</b><div class="muted">${escapeHtml(a.reason || "")}</div></td>
          <td>${fmtDate(a.starts_at)}</td>
          <td>${a.type === "virtual" ? "Virtual" : "Presencial"}</td>
          <td>${pill(a.status)}</td>
          <td>${apptActions(a)}</td>
        </tr>`).join("")}
      </tbody>
    </table>` : `<div class="empty">Sin citas registradas</div>`;
}

$("#apptForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const msg = $("#apptMsg");
  msg.textContent = "Creando…";
  try{
    await api("/appointments", { method:"POST", body: JSON.stringify({
      patient_id: $("#apptPatient").value,
      type: $("#apptType").value,
      reason: $("#apptReason").value.trim() || null,
      starts_at: new Date($("#apptStart").value).toISOString(),
      ends_at: new Date($("#apptEnd").value).toISOString(),
    })});
    msg.textContent = "Cita creada ✅";
    e.target.reset();
    await loadAll();
  }catch{ msg.textContent = "No se pudo crear la cita."; }
});

/* acciones compartidas en tablas de citas */
document.addEventListener("click", async (e)=>{
  const st = e.target.closest("button[data-status]");
  if (st){
    const [id, status] = st.dataset.status.split(":");
    try{ await api(`/appointments/${id}/status`, { method:"POST", body: JSON.stringify({ status }) }); await loadAll(); }catch{}
    return;
  }
  const room = e.target.closest("button[data-room]");
  if (room){
    try{
      const data = await api(`/appointments/${room.dataset.room}/virtual-room`);
      window.open(data.url, "_blank", "noopener");
    }catch{}
    return;
  }
  const chat = e.target.closest("button[data-chat]");
  if (chat){ await openChatForAppointment(chat.dataset.chat); return; }

  const hc = e.target.closest("button[data-hc]");
  if (hc){
    setView("historia");
    $("#hcPatient").value = hc.dataset.hc;
    await loadHistoria(hc.dataset.hc);
    return;
  }
  const rxgo = e.target.closest("button[data-rxgo]");
  if (rxgo){
    const [pid, aid] = rxgo.dataset.rxgo.split(":");
    setView("recetas");
    $("#rxPatient").value = pid;
    await syncRxAppointments(aid);
    return;
  }
  const pdf = e.target.closest("button[data-pdf]");
  if (pdf){ await openPdf(pdf.dataset.pdf); return; }

  const atender = e.target.closest("button[data-atender]");
  if (atender){ await openConsulta(atender.dataset.atender); return; }

  const dlFile = e.target.closest("button[data-dlfile]");
  if (dlFile){ await downloadFile(dlFile.dataset.dlfile); return; }

  const delFile = e.target.closest("button[data-delfile]");
  if (delFile){
    if (!confirm("¿Eliminar este archivo?")) return;
    try{ await api(`/files/${delFile.dataset.delfile}`, { method:"DELETE" }); await loadConsultaFiles(); }
    catch{ alert("No se pudo eliminar."); }
    return;
  }
});

/* ================= consulta médica ================= */
let consultaAppt = null;

async function openConsulta(appointmentId){
  try{
    const appt = await api(`/appointments/${appointmentId}`);
    // pasar a "en atención" si aún no lo está
    if (!["in_progress","done"].includes(appt.status)){
      await api(`/appointments/${appointmentId}/status`, { method:"POST", body: JSON.stringify({ status: "in_progress" }) });
      appt.status = "in_progress";
    }
    consultaAppt = appt;
    setView("consulta");

    $("#cName").textContent = `Consulta — ${appt.first_name} ${appt.last_name}`;
    $("#cSub").textContent = `${appt.reason || "Sin motivo registrado"} · ${fmtDate(appt.starts_at)} · ${appt.type === "virtual" ? "Virtual" : "Presencial"}`;

    // ficha resumida del paciente
    const p = await api(`/patients/${appt.patient_id}`);
    const kv = [
      ["Cédula", p.id_number], ["Teléfono", p.phone],
      ["Alergias", p.allergies], ["Condiciones", p.conditions],
    ];
    $("#cInfo").innerHTML = kv.map(([k,v]) => `
      <div class="kv"><div class="k">${k}</div><div class="v">${escapeHtml(v || "—")}</div></div>`).join("");

    // nota SOAP existente
    let enc = { subjective:"", objective:"", assessment:"", plan:"" };
    try{ enc = await api(`/encounters/appointment/${appointmentId}`); }catch{}
    $("#cSoapS").value = enc.subjective || "";
    $("#cSoapO").value = enc.objective || "";
    $("#cSoapA").value = enc.assessment || "";
    $("#cSoapP").value = enc.plan || "";
    $("#cSoapMsg").textContent = "";
    $("#cVitalsMsg").textContent = "";
    $("#cFileMsg").textContent = "";

    await Promise.all([loadConsultaFiles(), loadConsultaVitals()]);
    await loadAll(); // refresca estados en tablas
    setView("consulta");
  }catch{
    alert("No se pudo abrir la consulta.");
  }
}

async function loadConsultaFiles(){
  if (!consultaAppt) return;
  try{
    const files = await api(`/files?patient_id=${consultaAppt.patient_id}`);
    const catMap = { exam:"Examen", image:"Imagen", report:"Informe", other:"Otro" };
    $("#cFilesList").innerHTML = files.length ? `
      <table class="tbl">
        <thead><tr><th>Archivo</th><th>Tipo</th><th>Fecha</th><th></th></tr></thead>
        <tbody>${files.map(f => `
          <tr>
            <td><b>${escapeHtml(f.original_name)}</b><div class="muted">${(f.size_bytes/1024).toFixed(0)} KB</div></td>
            <td>${catMap[f.category] || escapeHtml(f.category)}</td>
            <td>${fmtDay(f.created_at)}</td>
            <td><div class="row-actions">
              <button class="btn btn-outline btn-sm" data-dlfile="${f.id}">Ver</button>
              <button class="btn btn-outline btn-sm" data-delfile="${f.id}">✕</button>
            </div></td>
          </tr>`).join("")}
        </tbody>
      </table>` : `<div class="empty">Sin archivos — sube el primer examen</div>`;
  }catch{}
}

async function loadConsultaVitals(){
  if (!consultaAppt) return;
  try{
    const vitals = await api(`/vitals/patient/${consultaAppt.patient_id}`);
    const last = vitals[0];
    $("#cVitalsLast").innerHTML = last
      ? `<div class="muted">Última: ${fmtDate(last.taken_at)} — PA ${last.systolic ?? "—"}/${last.diastolic ?? "—"} · FC ${last.heart_rate ?? "—"}</div>`
      : "";
  }catch{}
}

async function downloadFile(fileId){
  try{
    const res = await fetch(`${API}/files/${fileId}/download`, { headers:{ Authorization:`Bearer ${token}` } });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(()=> URL.revokeObjectURL(url), 60_000);
  }catch{ alert("No se pudo abrir el archivo."); }
}

$("#cBack").addEventListener("click", ()=> setView("agenda"));

$("#cFinish").addEventListener("click", async ()=>{
  if (!consultaAppt) return;
  if (!confirm("¿Finalizar la consulta?")) return;
  try{
    await api(`/appointments/${consultaAppt.id}/status`, { method:"POST", body: JSON.stringify({ status: "done" }) });
    await loadAll();
    setView("agenda");
  }catch{ alert("No se pudo finalizar."); }
});

$("#cGoRx").addEventListener("click", async ()=>{
  if (!consultaAppt) return;
  setView("recetas");
  $("#rxPatient").value = consultaAppt.patient_id;
  await syncRxAppointments(consultaAppt.id);
});

$("#cSoapForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  if (!consultaAppt) return;
  const msg = $("#cSoapMsg");
  msg.textContent = "Guardando…";
  try{
    await api(`/encounters/appointment/${consultaAppt.id}`, { method:"PUT", body: JSON.stringify({
      subjective: $("#cSoapS").value, objective: $("#cSoapO").value,
      assessment: $("#cSoapA").value, plan: $("#cSoapP").value,
    })});
    msg.textContent = "Nota guardada ✅";
  }catch{ msg.textContent = "No se pudo guardar."; }
});

$("#cVitalsForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  if (!consultaAppt) return;
  const msg = $("#cVitalsMsg");
  msg.textContent = "Guardando…";
  const val = (id) => { const v = $(id).value; return v === "" ? null : Number(v); };
  try{
    await api("/vitals", { method:"POST", body: JSON.stringify({
      patient_id: consultaAppt.patient_id,
      systolic: val("#cvSys"), diastolic: val("#cvDia"),
      heart_rate: val("#cvHr"), spo2: val("#cvSpo2"),
      temperature_c: val("#cvTemp"), weight_kg: val("#cvWeight"),
      glucose_mgdl: val("#cvGluc"),
    })});
    msg.textContent = "Signos guardados ✅";
    e.target.reset();
    await loadConsultaVitals();
  }catch{ msg.textContent = "No se pudo guardar."; }
});

$("#cFileForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  if (!consultaAppt) return;
  const msg = $("#cFileMsg");
  const file = $("#cFile").files[0];
  if (!file){ msg.textContent = "Selecciona un archivo."; return; }
  if (file.size > 10 * 1024 * 1024){ msg.textContent = "Máximo 10 MB."; return; }

  msg.textContent = "Subiendo…";
  const fd = new FormData();
  fd.append("file", file);
  fd.append("patient_id", consultaAppt.patient_id);
  fd.append("appointment_id", consultaAppt.id);
  fd.append("category", $("#cFileCat").value);
  try{
    const res = await fetch(`${API}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) throw new Error();
    msg.textContent = "Archivo subido ✅";
    e.target.reset();
    await loadConsultaFiles();
  }catch{ msg.textContent = "No se pudo subir (solo PDF/JPG/PNG, máx 10 MB)."; }
});

/* ================= pacientes ================= */
function renderPatients(list){
  const isAdmin = me?.role === "admin";
  $("#patientsTable").innerHTML = list.length ? `
    <table class="tbl">
      <thead><tr><th>Paciente</th><th>Contacto</th><th>Antecedentes</th><th>Acciones</th></tr></thead>
      <tbody>${list.map(p => `
        <tr>
          <td><b>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</b><div class="muted">${escapeHtml(p.id_number || "")}</div></td>
          <td>${escapeHtml(p.phone || "—")}<div class="muted">${escapeHtml(p.email || "")}</div></td>
          <td class="muted">${escapeHtml(p.allergies || "—")} · ${escapeHtml(p.conditions || "—")}</td>
          <td><div class="row-actions">
            <button class="btn btn-outline btn-sm" data-hc="${p.id}">Historia</button>
            ${isAdmin ? `<button class="btn btn-outline btn-sm" data-del="${p.id}">Eliminar</button>` : ""}
          </div></td>
        </tr>`).join("")}
      </tbody>
    </table>` : `<div class="empty">Sin resultados</div>`;
}

let searchTimer = null;
$("#patientSearch").addEventListener("input", (e)=>{
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async ()=>{
    const term = e.target.value.trim();
    try{
      const pts = await api(`/patients${term ? `?search=${encodeURIComponent(term)}` : "?limit=200"}`);
      renderPatients(pts);
    }catch{}
  }, 300);
});

$("#patientsTable").addEventListener("click", async (e)=>{
  const del = e.target.closest("button[data-del]");
  if (del){
    if (!confirm("¿Eliminar este paciente? Se borran también sus citas, signos y recetas.")) return;
    try{ await api(`/patients/${del.dataset.del}`, { method:"DELETE" }); await loadAll(); }
    catch{ alert("No se pudo eliminar."); }
  }
});

$("#patientForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const msg = $("#patientMsg");
  msg.textContent = "Guardando…";
  try{
    await api("/patients", { method:"POST", body: JSON.stringify({
      first_name: $("#pFirst").value.trim(),
      last_name: $("#pLast").value.trim(),
      id_number: $("#pIdNum").value.trim() || null,
      phone: $("#pPhone").value.trim() || null,
      email: $("#pEmail").value.trim() || null,
      birth_date: $("#pBirth").value || null,
      sex: $("#pSex").value || null,
      allergies: $("#pAllergies").value.trim() || null,
      conditions: $("#pConditions").value.trim() || null,
      notes: $("#pNotes").value.trim() || null,
    })});
    msg.textContent = "Paciente guardado ✅";
    e.target.reset();
    await loadAll();
  }catch{ msg.textContent = "No se pudo guardar."; }
});

/* ================= historia clínica ================= */
$("#hcPatient").addEventListener("change", async (e)=>{
  if (e.target.value) await loadHistoria(e.target.value);
  else $("#hcContent").classList.add("hidden");
});

async function loadHistoria(patientId){
  hcPatientId = patientId;
  $("#hcContent").classList.remove("hidden");
  $("#soapCard").classList.add("hidden");

  const [p, appts, vitals, hcFiles] = await Promise.all([
    api(`/patients/${patientId}`),
    api(`/appointments?patient_id=${patientId}`),
    api(`/vitals/patient/${patientId}`),
    api(`/files?patient_id=${patientId}`).catch(()=> []),
  ]);

  $("#hcFiles").innerHTML = hcFiles.length ? `
    <table class="tbl">
      <thead><tr><th>Archivo</th><th>Fecha</th><th></th></tr></thead>
      <tbody>${hcFiles.map(f => `
        <tr>
          <td><b>${escapeHtml(f.original_name)}</b></td>
          <td>${fmtDay(f.created_at)}</td>
          <td><button class="btn btn-outline btn-sm" data-dlfile="${f.id}">Ver</button></td>
        </tr>`).join("")}
      </tbody>
    </table>` : `<div class="empty">Sin archivos</div>`;

  hcPatientData = p;
  $("#hcEditForm").classList.add("hidden");
  $("#hcInfo").classList.remove("hidden");
  $("#hcName").textContent = `${p.first_name} ${p.last_name}`;
  const sexMap = { male:"Masculino", female:"Femenino", other:"Otro" };
  const kv = [
    ["Cédula", p.id_number], ["Teléfono", p.phone], ["Email", p.email],
    ["Nacimiento", p.birth_date ? fmtDay(p.birth_date) : null],
    ["Sexo", sexMap[p.sex]], ["Alergias", p.allergies],
    ["Condiciones", p.conditions], ["Notas", p.notes],
  ];
  $("#hcInfo").innerHTML = kv.map(([k,v]) => `
    <div class="kv"><div class="k">${k}</div><div class="v">${escapeHtml(v || "—")}</div></div>`).join("");

  $("#hcAppointments").innerHTML = appts.length ? `
    <table class="tbl">
      <thead><tr><th>Fecha</th><th>Motivo</th><th>Estado</th><th></th></tr></thead>
      <tbody>${appts.map(a => `
        <tr>
          <td>${fmtDate(a.starts_at)}</td>
          <td>${escapeHtml(a.reason || "—")}</td>
          <td>${pill(a.status)}</td>
          <td><button class="btn btn-outline btn-sm" data-soap="${a.id}">📝 Nota SOAP</button></td>
        </tr>`).join("")}
      </tbody>
    </table>` : `<div class="empty">Este paciente no tiene citas — crea una en Agenda para poder registrar notas</div>`;

  $("#vitalsHistory").innerHTML = vitals.length ? `
    <table class="tbl">
      <thead><tr><th>Fecha</th><th>PA</th><th>FC</th><th>SpO2</th><th>T°</th></tr></thead>
      <tbody>${vitals.slice(0, 10).map(v => `
        <tr>
          <td>${fmtDay(v.taken_at)}</td>
          <td>${v.systolic ?? "—"}/${v.diastolic ?? "—"}</td>
          <td>${v.heart_rate ?? "—"}</td>
          <td>${v.spo2 ?? "—"}%</td>
          <td>${v.temperature_c ?? "—"}</td>
        </tr>`).join("")}
      </tbody>
    </table>` : `<div class="empty">Sin registros</div>`;
}

/* --- editar ficha del paciente --- */
let hcPatientData = null;

$("#hcEditBtn").addEventListener("click", ()=>{
  if (!hcPatientData) return;
  const p = hcPatientData;
  $("#eFirst").value = p.first_name || "";
  $("#eLast").value = p.last_name || "";
  $("#eIdNum").value = p.id_number || "";
  $("#ePhone").value = p.phone || "";
  $("#eEmail").value = p.email || "";
  $("#eBirth").value = p.birth_date ? String(p.birth_date).slice(0,10) : "";
  $("#eSex").value = p.sex || "";
  $("#eAllergies").value = p.allergies || "";
  $("#eConditions").value = p.conditions || "";
  $("#eNotes").value = p.notes || "";
  $("#hcEditMsg").textContent = "";
  $("#hcEditForm").classList.remove("hidden");
  $("#hcInfo").classList.add("hidden");
});

$("#hcEditCancel").addEventListener("click", ()=>{
  $("#hcEditForm").classList.add("hidden");
  $("#hcInfo").classList.remove("hidden");
});

$("#hcEditForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  if (!hcPatientId) return;
  const msg = $("#hcEditMsg");
  msg.textContent = "Guardando…";
  try{
    await api(`/patients/${hcPatientId}`, { method:"PUT", body: JSON.stringify({
      first_name: $("#eFirst").value.trim(),
      last_name: $("#eLast").value.trim(),
      id_number: $("#eIdNum").value.trim() || null,
      phone: $("#ePhone").value.trim() || null,
      email: $("#eEmail").value.trim() || null,
      birth_date: $("#eBirth").value || null,
      sex: $("#eSex").value || null,
      allergies: $("#eAllergies").value.trim() || null,
      conditions: $("#eConditions").value.trim() || null,
      notes: $("#eNotes").value.trim() || null,
    })});
    msg.textContent = "Ficha actualizada ✅";
    $("#hcEditForm").classList.add("hidden");
    $("#hcInfo").classList.remove("hidden");
    await loadHistoria(hcPatientId);
    // refrescar listados que muestran nombre/datos
    PATIENTS = await api("/patients?limit=200");
    renderPatients(PATIENTS);
    fillPatientSelects();
    $("#hcPatient").value = hcPatientId;
  }catch{ msg.textContent = "No se pudo actualizar."; }
});

$("#hcAppointments").addEventListener("click", async (e)=>{
  const b = e.target.closest("button[data-soap]");
  if (!b) return;
  soapApptId = b.dataset.soap;
  $("#soapApptLabel").textContent = `cita ${soapApptId.slice(0,8)}`;
  let enc = { subjective:"", objective:"", assessment:"", plan:"" };
  try{ enc = await api(`/encounters/appointment/${soapApptId}`); }catch{}
  $("#soapS").value = enc.subjective || "";
  $("#soapO").value = enc.objective || "";
  $("#soapA").value = enc.assessment || "";
  $("#soapP").value = enc.plan || "";
  $("#soapMsg").textContent = "";
  $("#soapCard").classList.remove("hidden");
  $("#soapCard").scrollIntoView({ behavior:"smooth" });
});

$("#soapForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const msg = $("#soapMsg");
  msg.textContent = "Guardando…";
  try{
    await api(`/encounters/appointment/${soapApptId}`, { method:"PUT", body: JSON.stringify({
      subjective: $("#soapS").value, objective: $("#soapO").value,
      assessment: $("#soapA").value, plan: $("#soapP").value,
    })});
    msg.textContent = "Nota guardada ✅";
  }catch{ msg.textContent = "No se pudo guardar (requiere rol médico/admin)."; }
});
$("#soapCancel").addEventListener("click", ()=> $("#soapCard").classList.add("hidden"));

$("#vitalsForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  if (!hcPatientId) return;
  const msg = $("#vitalsMsg");
  msg.textContent = "Guardando…";
  const val = (id) => { const v = $(id).value; return v === "" ? null : Number(v); };
  try{
    await api("/vitals", { method:"POST", body: JSON.stringify({
      patient_id: hcPatientId,
      systolic: val("#vSys"), diastolic: val("#vDia"),
      heart_rate: val("#vHr"), spo2: val("#vSpo2"),
      temperature_c: val("#vTemp"), weight_kg: val("#vWeight"),
      glucose_mgdl: val("#vGluc"),
    })});
    msg.textContent = "Signos guardados ✅";
    e.target.reset();
    await loadHistoria(hcPatientId);
  }catch{ msg.textContent = "No se pudo guardar."; }
});

/* ================= recetas ================= */
async function loadPrescriptions(){
  try{
    const list = await api("/prescriptions");
    $("#rxTable").innerHTML = list.length ? `
      <table class="tbl">
        <thead><tr><th>Paciente</th><th>Fecha</th><th>Indicaciones</th><th></th></tr></thead>
        <tbody>${list.map(r => `
          <tr>
            <td><b>${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</b></td>
            <td>${fmtDate(r.created_at)}</td>
            <td class="muted">${escapeHtml((r.instructions || "—").slice(0, 60))}</td>
            <td><button class="btn btn-primary btn-sm" data-pdf="${r.id}">📄 PDF</button></td>
          </tr>`).join("")}
        </tbody>
      </table>` : `<div class="empty">Aún no hay recetas emitidas</div>`;
  }catch{
    $("#rxTable").innerHTML = `<div class="empty">No se pudieron cargar las recetas</div>`;
  }
}

async function openPdf(prescriptionId){
  try{
    const res = await fetch(`${API}/prescriptions/${prescriptionId}/pdf`, { headers:{ Authorization:`Bearer ${token}` } });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(()=> URL.revokeObjectURL(url), 60_000);
  }catch{ alert("No se pudo abrir el PDF."); }
}

async function syncRxAppointments(preselect){
  const pid = $("#rxPatient").value;
  if (!pid){ $("#rxAppt").innerHTML = ""; return; }
  try{
    const appts = await api(`/appointments?patient_id=${pid}`);
    $("#rxAppt").innerHTML = appts.length
      ? appts.map(a => `<option value="${a.id}">${fmtDate(a.starts_at)} — ${escapeHtml(a.reason || a.type)}</option>`).join("")
      : `<option value="">(sin citas — crea una primero)</option>`;
    if (preselect) $("#rxAppt").value = preselect;
  }catch{}
}
$("#rxPatient").addEventListener("change", ()=> syncRxAppointments());

$("#rxAddItem").addEventListener("click", ()=>{
  const div = document.createElement("div");
  div.className = "rx-item";
  div.innerHTML = `
    <label>Medicamento</label>
    <input class="rxMed" placeholder="Medicamento" />
    <div class="grid2">
      <div><label>Dosis</label><input class="rxDose" placeholder="Dosis" /></div>
      <div><label>Frecuencia</label><input class="rxFreq" placeholder="Frecuencia" /></div>
    </div>
    <label>Duración</label>
    <input class="rxDur" placeholder="Duración" />`;
  $("#rxItems").appendChild(div);
});

$("#rxForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const msg = $("#rxMsg");
  const apptId = $("#rxAppt").value;
  if (!apptId){ msg.textContent = "El paciente necesita una cita primero."; return; }

  const items = $$("#rxItems .rx-item").map(el => ({
    medication: el.querySelector(".rxMed").value.trim(),
    dose: el.querySelector(".rxDose").value.trim() || null,
    frequency: el.querySelector(".rxFreq").value.trim() || null,
    duration: el.querySelector(".rxDur").value.trim() || null,
  })).filter(i => i.medication);

  if (!items.length){ msg.textContent = "Agrega al menos un medicamento."; return; }
  msg.textContent = "Emitiendo…";
  try{
    const pr = await api("/prescriptions", { method:"POST", body: JSON.stringify({
      appointment_id: apptId,
      patient_id: $("#rxPatient").value,
      instructions: $("#rxInstructions").value.trim() || null,
      items,
    })});
    msg.textContent = "Receta emitida ✅";
    e.target.reset();
    $$("#rxItems .rx-item").slice(1).forEach(el => el.remove());
    await loadPrescriptions();
    await syncRxAppointments();
    await openPdf(pr.id);
  }catch{ msg.textContent = "No se pudo emitir (requiere rol médico/admin)."; }
});

/* ================= atención inmediata ================= */
function renderQueue(){
  $("#queueTable").innerHTML = QUEUE.length ? `
    <table class="tbl">
      <thead><tr><th>Paciente</th><th>Llegada</th><th>Motivo</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>${QUEUE.map(a => `
        <tr>
          <td><b>${escapeHtml(a.first_name)} ${escapeHtml(a.last_name)}</b></td>
          <td>${fmtTime(a.created_at)}</td>
          <td class="muted">${escapeHtml(a.reason || "—")}</td>
          <td>${pill(a.status)}</td>
          <td><div class="row-actions">
            ${a.status === "waiting" ? `<button class="btn btn-primary btn-sm" data-atender="${a.id}">Atender</button>` : ""}
            ${a.status === "in_progress" ? `<button class="btn btn-primary btn-sm" data-atender="${a.id}">Consulta</button>` : ""}
            <button class="btn btn-outline btn-sm" data-hc="${a.patient_id}">Historia</button>
          </div></td>
        </tr>`).join("")}
      </tbody>
    </table>` : `<div class="empty">La cola está vacía</div>`;
}

$("#walkinForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const msg = $("#walkinMsg");
  msg.textContent = "Agregando…";
  try{
    await api("/appointments/walkin", { method:"POST", body: JSON.stringify({
      patient_id: $("#walkinPatient").value,
      type: $("#walkinType").value,
      reason: $("#walkinReason").value.trim() || null,
    })});
    msg.textContent = "Agregado a la cola ✅";
    e.target.reset();
    await loadAll();
  }catch{ msg.textContent = "No se pudo agregar."; }
});

/* ================= chat ================= */
function renderChatAppts(){
  const recent = APPTS.slice(0, 15);
  $("#chatApptTable").innerHTML = recent.length ? `
    <table class="tbl">
      <thead><tr><th>Paciente</th><th>Fecha</th><th></th></tr></thead>
      <tbody>${recent.map(a => `
        <tr>
          <td><b>${escapeHtml(a.first_name)} ${escapeHtml(a.last_name)}</b><div class="muted">${escapeHtml(a.reason || "")}</div></td>
          <td>${fmtDate(a.starts_at)}</td>
          <td><button class="btn btn-outline btn-sm" data-chat="${a.id}">💬 Abrir chat</button></td>
        </tr>`).join("")}
      </tbody>
    </table>` : `<div class="empty">Sin citas</div>`;
}

async function ensureSocket(){
  if (socket) return socket;
  socket = io({ auth: { token } });
  socket.on("connect_error", (e)=> console.warn("socket:", e.message));
  socket.on("message:new", (msg)=>{
    if (currentThreadId && msg.thread_id === currentThreadId){
      const div = document.createElement("div");
      div.className = "msg";
      div.innerHTML = `<div class="meta">${escapeHtml(msg.sender_name || "Usuario")} · ${fmtDate(msg.created_at)}</div><div class="body">${escapeHtml(msg.body)}</div>`;
      $("#chatLog").appendChild(div);
      $("#chatLog").scrollTop = $("#chatLog").scrollHeight;
    }
  });
  return socket;
}

async function openChatForAppointment(appointmentId){
  setView("chat");
  try{
    const thread = await api("/chat/thread", { method:"POST", body: JSON.stringify({ appointment_id: appointmentId }) });
    currentThreadId = thread.id;
    const appt = APPTS.find(a => a.id === appointmentId);
    $("#chatSub").textContent = appt ? `Chat con ${appt.first_name} ${appt.last_name}` : `Hilo ${thread.id.slice(0,8)}`;

    const msgs = await api(`/chat/thread/${thread.id}/messages`);
    $("#chatLog").innerHTML = msgs.map(m => `
      <div class="msg">
        <div class="meta">${escapeHtml(m.sender_name || "Usuario")} · ${fmtDate(m.created_at)}</div>
        <div class="body">${escapeHtml(m.body)}</div>
      </div>`).join("");
    $("#chatLog").scrollTop = $("#chatLog").scrollHeight;

    const s = await ensureSocket();
    s.emit("thread:join", { threadId: thread.id });
  }catch{
    $("#chatSub").textContent = "No se pudo abrir el chat.";
  }
}

$("#chatForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const body = $("#chatInput").value.trim();
  if (!body || !currentThreadId) return;
  $("#chatInput").value = "";
  const s = await ensureSocket();
  s.emit("message:send", { threadId: currentThreadId, body });
});

/* ================= IA ================= */
$("#aiForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const msg = $("#aiMsg");
  msg.textContent = "Analizando…";
  $("#aiAnswer").textContent = "";
  try{
    const data = await api("/ai/triage", { method:"POST", body: JSON.stringify({ message: $("#aiMessage").value }) });
    msg.textContent = "";
    $("#aiAnswer").textContent = data.reply;
  }catch{ msg.textContent = "No se pudo analizar."; }
});

/* ================= boot ================= */
(async function boot(){
  if (!token) return showLogin();
  try{
    await api("/patients?limit=1");
    showApp();
    setView("dashboard");
    await loadAll();
  }catch{
    showLogin();
  }
})();
