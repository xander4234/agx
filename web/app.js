/* AGX Salud — Dashboard Médico */
const API = "/api";
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let token = localStorage.getItem("agx_token") || "";
let me = (() => { try { return JSON.parse(localStorage.getItem("agx_me")); } catch { return null; } })();

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
    no_show:["No asistió","bad"],
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
  if (name === "caja") loadCaja().catch(()=>{});
  if (name === "inventario") loadInventory().catch(()=>{});
  if (name === "recordatorios") renderReminders();
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
  const rolMap = { superadmin:"Superadministrador", admin:"Administración", provider:"Medicina General", staff:"Personal" };
  $("#heroSub").textContent = `Bienvenido, ${name.toUpperCase()} · ${rolMap[me?.role] || ""} · ${todayStr()}`;
}
function showLogin(){
  token = ""; me = null;
  localStorage.removeItem("agx_token");
  localStorage.removeItem("agx_me");
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
  renderReminders();
  renderPatients(PATIENTS);
  renderQueue();
  fillPatientSelects();
  await loadPrescriptions();
  await loadClinicConfig();
  await Promise.all([
    loadTemplates().catch(()=>{}),
    loadBirthdays().catch(()=>{}),
    loadInvAlerts().catch(()=>{}),
  ]);
}

/* ================= configuración del consultorio ================= */
let CLINIC = null;

async function loadClinicConfig(){
  try{
    CLINIC = await api("/clinic");
    $("#clinicChip").textContent = CLINIC.name || "AGX Salud";
    $("#clinicName").value = CLINIC.name || "";
    $("#clinicAddress") && ($("#clinicAddress").value = CLINIC.address || "");
    $("#clinicPhone") && ($("#clinicPhone").value = CLINIC.phone || "");
  }catch{}
  $("#meName") && ($("#meName").textContent = me?.name || "—");
  $("#meRole") && ($("#meRole").textContent = ({superadmin:"Superadministrador",admin:"Administrador",provider:"Médico",staff:"Personal"})[me?.role] || me?.role || "—");

  const isAdmin = ["admin", "superadmin"].includes(me?.role);
  $("#usersCard")?.classList.toggle("hidden", !isAdmin);
  $("#newUserCard")?.classList.toggle("hidden", !isAdmin);
  $("#clinicForm").querySelector("button").disabled = !isAdmin;
  $("#auditCard")?.classList.toggle("hidden", !isAdmin);
  if (isAdmin){ await loadUsers(); loadAudit().catch(()=>{}); }

  // panel de plataforma solo para el superadmin
  const isSuper = me?.role === "superadmin";
  $("#tabSuper")?.classList.toggle("hidden", !isSuper);
  if (isSuper) await loadSuperPanel();
}

/* ================= superadmin: consultorios de la plataforma ================= */
async function loadSuperPanel(){
  try{
    const clinics = await api("/superadmin/clinics");
    $("#superTable").innerHTML = clinics.length ? `
      <table class="tbl">
        <thead><tr><th>Consultorio</th><th>Usuarios</th><th>Pacientes</th><th>Creado</th><th></th></tr></thead>
        <tbody>${clinics.map(c => `
          <tr>
            <td data-label="Consultorio"><b>${escapeHtml(c.name)}</b></td>
            <td data-label="Usuarios">${c.users_count}</td>
            <td data-label="Pacientes">${c.patients_count}</td>
            <td data-label="Creado">${fmtDay(c.created_at)}</td>
            <td>${c.id !== CLINIC?.id
              ? `<button class="btn btn-outline btn-sm" data-delclinic="${c.id}" data-clinicname="${escapeHtml(c.name)}">Eliminar</button>`
              : `<span class="pill info">el tuyo</span>`}</td>
          </tr>`).join("")}
        </tbody>
      </table>` : `<div class="empty">Sin consultorios aún</div>`;
  }catch{
    $("#superTable").innerHTML = `<div class="empty">No se pudo cargar (¿tu sesión ya es superadmin? Cierra sesión y vuelve a entrar)</div>`;
  }
}

$("#superForm")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const msg = $("#superMsg");
  msg.textContent = "Creando consultorio…";
  try{
    const r = await api("/superadmin/clinics", { method:"POST", body: JSON.stringify({
      clinicName: $("#scClinic").value.trim(),
      adminName: $("#scAdmin").value.trim(),
      email: $("#scEmail").value.trim(),
      password: $("#scPass").value,
    })});
    msg.textContent = `✅ Creado. Entrégale al doctor: ${r.admin.email} / la clave que pusiste`;
    e.target.reset();
    await loadSuperPanel();
  }catch(err){
    msg.textContent = String(err.message).includes("email_in_use")
      ? "Ese email ya está registrado."
      : "No se pudo crear (revisa email y contraseña de 8+ caracteres).";
  }
});

$("#superTable")?.addEventListener("click", async (e)=>{
  const b = e.target.closest("button[data-delclinic]");
  if (!b) return;
  const nombre = b.dataset.clinicname;
  if (!confirm(`⚠️ ¿Eliminar el consultorio "${nombre}"?\n\nSe borrarán TODOS sus datos: usuarios, pacientes, citas, historias, recetas. Esta acción NO se puede deshacer.`)) return;
  if (!confirm(`Confirma otra vez: eliminar definitivamente "${nombre}".`)) return;
  try{ await api(`/superadmin/clinics/${b.dataset.delclinic}`, { method:"DELETE" }); await loadSuperPanel(); }
  catch{ alert("No se pudo eliminar."); }
});

async function loadUsers(){
  try{
    const users = await api("/clinic/users");
    const roleMap = { admin:"Administrador", provider:"Médico", staff:"Personal" };
    $("#usersTable").innerHTML = `
      <table class="tbl">
        <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th></th></tr></thead>
        <tbody>${users.map(u => `
          <tr>
            <td data-label="Nombre"><b>${escapeHtml(u.full_name)}</b></td>
            <td data-label="Email">${escapeHtml(u.email)}</td>
            <td data-label="Rol">${pillRole(u.role, roleMap)}</td>
            <td>${u.id !== me?.id ? `<button class="btn btn-outline btn-sm" data-deluser="${u.id}">Eliminar</button>` : `<span class="muted">tú</span>`}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
  }catch{
    $("#usersTable").innerHTML = `<div class="empty">No se pudieron cargar los usuarios</div>`;
  }
}

function pillRole(role, map){
  const cls = { admin:"info", provider:"ok", staff:"wait" }[role] || "info";
  return `<span class="pill ${cls}">${map[role] || role}</span>`;
}

$("#clinicForm")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const msg = $("#clinicMsg");
  msg.textContent = "Guardando…";
  try{
    const r = await api("/clinic", { method:"PUT", body: JSON.stringify({
      name: $("#clinicName").value.trim(),
      address: $("#clinicAddress").value.trim() || null,
      phone: $("#clinicPhone").value.trim() || null,
    }) });
    CLINIC = r;
    $("#clinicChip").textContent = r.name;
    msg.textContent = "Datos actualizados ✅ (saldrán en los nuevos PDF)";
  }catch{ msg.textContent = "No se pudo guardar (solo administradores)."; }
});

$("#userForm")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const msg = $("#userMsg");
  msg.textContent = "Creando…";
  try{
    await api("/clinic/users", { method:"POST", body: JSON.stringify({
      full_name: $("#uName").value.trim(),
      email: $("#uEmail").value.trim(),
      password: $("#uPass").value,
      role: $("#uRole").value,
    })});
    msg.textContent = "Usuario creado ✅";
    e.target.reset();
    await loadUsers();
  }catch(err){
    msg.textContent = String(err.message).includes("email_in_use")
      ? "Ese email ya está registrado."
      : "No se pudo crear (revisa email y contraseña de 8+ caracteres).";
  }
});

$("#usersTable")?.addEventListener("click", async (e)=>{
  const b = e.target.closest("button[data-deluser]");
  if (!b) return;
  if (!confirm("¿Eliminar este usuario? Ya no podrá iniciar sesión.")) return;
  try{ await api(`/clinic/users/${b.dataset.deluser}`, { method:"DELETE" }); await loadUsers(); }
  catch{ alert("No se pudo eliminar."); }
});

function fillPatientSelects(){
  const opts = PATIENTS.map(p => `<option value="${p.id}">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</option>`).join("");
  ["#apptPatient","#walkinPatient","#rxPatient","#payPatient"].forEach(sel => { const el = $(sel); if (el) el.innerHTML = opts; });
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
          <td data-label="Paciente"><b>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</b></td>
          <td data-label="Contacto">${escapeHtml(p.phone || "—")}</td>
          <td data-label="Antecedentes">${escapeHtml(p.conditions || "—")}</td>
          <td data-label="Registro">${fmtDay(p.created_at)}</td>
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
  "Recordatorios por WhatsApp que reducen el ausentismo",
  "Caja, estadísticas e inventario de tu consultorio",
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
    ${a.phone && ["scheduled","confirmed"].includes(a.status) ? `<button class="btn btn-wa btn-sm" data-wa="${a.id}" title="Enviar recordatorio por WhatsApp">📱 WhatsApp</button>` : ""}
    ${["scheduled","confirmed"].includes(a.status) ? `<button class="btn btn-outline btn-sm" data-status="${a.id}:no_show" title="El paciente no vino">✗ No asistió</button>` : ""}
    ${a.type === "virtual" ? `<button class="btn btn-primary btn-sm" data-room="${a.id}">Sala</button>` : ""}
    <button class="btn btn-outline btn-sm" data-hc="${a.patient_id}">Historia</button>
    <button class="btn btn-outline btn-sm" data-rxgo="${a.patient_id}:${a.id}">Receta</button>
  </div>`;
}

/* --- recordatorio por WhatsApp (sin costo, abre WhatsApp con el mensaje listo) --- */
function waPhone(raw){
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = "593" + d.slice(1);
  else if (d.length === 9) d = "593" + d;
  return d;
}
function openWhatsApp(apptId){
  const a = APPTS.find(x => x.id === apptId);
  if (!a) return;
  const phone = waPhone(a.phone);
  if (!phone){ alert("Este paciente no tiene teléfono registrado."); return; }
  const fecha = new Date(a.starts_at).toLocaleDateString("es-EC", { weekday:"long", day:"numeric", month:"long" });
  const hora = fmtTime(a.starts_at);
  const msg = `Hola ${a.first_name} 👋. Le recordamos su cita en ${CLINIC?.name || "el consultorio"} el ${fecha} a las ${hora}. Por favor confirme su asistencia. ¡Gracias!`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
}

let agendaMode = "list";
let weekOffset = 0;

$("#agendaViewToggle")?.addEventListener("click", (e)=>{
  const b = e.target.closest("button[data-amode]");
  if (!b) return;
  agendaMode = b.dataset.amode;
  $$("#agendaViewToggle button").forEach(x => x.classList.toggle("is-on", x === b));
  $("#apptTable").classList.toggle("hidden", agendaMode !== "list");
  $("#weekCalWrap").classList.toggle("hidden", agendaMode !== "week");
  if (agendaMode === "week") renderWeekCal();
});
$("#wkPrev")?.addEventListener("click", ()=>{ weekOffset--; renderWeekCal(); });
$("#wkNext")?.addEventListener("click", ()=>{ weekOffset++; renderWeekCal(); });
$("#wkToday")?.addEventListener("click", ()=>{ weekOffset = 0; renderWeekCal(); });

function renderWeekCal(){
  const el = $("#weekCal");
  if (!el) return;
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  const end = new Date(monday.getTime() + 7 * 86400000);

  $("#wkLabel").textContent = `${monday.toLocaleDateString("es-EC", { day:"numeric", month:"short" })} — ${new Date(end.getTime() - 86400000).toLocaleDateString("es-EC", { day:"numeric", month:"short", year:"numeric" })}`;

  const today = new Date(); today.setHours(0,0,0,0);
  el.innerHTML = `<div class="wk-grid">${days.map(d => {
    const next = new Date(d.getTime() + 86400000);
    const dayAppts = APPTS
      .filter(a => { const t = new Date(a.starts_at); return t >= d && t < next && a.status !== "canceled"; })
      .sort((a,b)=> new Date(a.starts_at) - new Date(b.starts_at));
    const isToday = d.getTime() === today.getTime();
    return `<div class="wk-day ${isToday ? "today" : ""}">
      <div class="wk-head">${d.toLocaleDateString("es-EC", { weekday:"short" })}<b>${d.getDate()}</b></div>
      ${dayAppts.map(a => `
        <button class="wk-chip st-${a.status}" data-atender="${a.id}" title="${escapeHtml(a.reason || "")} · ${pillLabel(a.status)}">
          <span class="wk-time">${fmtTime(a.starts_at)}</span>
          <span class="wk-name">${escapeHtml(a.first_name)} ${escapeHtml((a.last_name || "").slice(0,1))}.</span>
        </button>`).join("") || `<div class="wk-empty">—</div>`}
    </div>`;
  }).join("")}</div>`;
}
function pillLabel(status){
  return ({ scheduled:"Pendiente", confirmed:"Confirmada", waiting:"En espera", in_progress:"En atención", done:"Finalizada", canceled:"Cancelada", no_show:"No asistió" })[status] || status;
}

function renderAgenda(){
  if (agendaMode === "week") renderWeekCal();
  $("#apptTable").innerHTML = APPTS.length ? `
    <table class="tbl">
      <thead><tr><th>Paciente</th><th>Fecha</th><th>Tipo</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>${APPTS.map(a => `
        <tr>
          <td data-label="Paciente"><b>${escapeHtml(a.first_name)} ${escapeHtml(a.last_name)}</b><div class="muted">${escapeHtml(a.reason || "")}</div></td>
          <td data-label="Fecha">${fmtDate(a.starts_at)}</td>
          <td data-label="Tipo">${a.type === "virtual" ? "Virtual" : "Presencial"}</td>
          <td data-label="Estado">${pill(a.status)}</td>
          <td data-label="Acciones">${apptActions(a)}</td>
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
  const wa = e.target.closest("button[data-wa]");
  if (wa){ openWhatsApp(wa.dataset.wa); return; }

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
    setCie(enc.cie10_code, enc.cie10_desc);
    $("#cSoapMsg").textContent = "";
    $("#cVitalsMsg").textContent = "";
    $("#cFileMsg").textContent = "";
    $("#cPayMsg") && ($("#cPayMsg").textContent = "");
    $("#cFollowMsg") && ($("#cFollowMsg").textContent = "");

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

$("#cCertForm")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  if (!consultaAppt) return;
  const msg = $("#certMsg");
  msg.textContent = "Emitiendo…";
  try{
    const cert = await api("/certificates", { method:"POST", body: JSON.stringify({
      appointment_id: consultaAppt.id,
      rest_days: Number($("#certDias").value) || 0,
      diagnosis: $("#certDx").value.trim() || null,
      observations: $("#certObs").value.trim() || null,
    })});
    msg.textContent = "Certificado emitido ✅";
    e.target.reset();
    const res = await fetch(`${API}/certificates/${cert.id}/pdf`, { headers:{ Authorization:`Bearer ${token}` } });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(()=> URL.revokeObjectURL(url), 60_000);
  }catch{ msg.textContent = "No se pudo emitir (requiere rol médico/admin)."; }
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
      cie10_code: selectedCie?.code || null,
      cie10_desc: selectedCie?.desc || null,
    })});
    msg.textContent = "Nota guardada ✅";
  }catch{ msg.textContent = "No se pudo guardar."; }
});

/* --- buscador de diagnóstico CIE-10 --- */
let selectedCie = null;
let cieTimer = null;

function setCie(code, desc){
  if (code || desc){
    selectedCie = { code: code || "", desc: desc || "" };
    $("#cCieChipTxt").textContent = `${selectedCie.code} — ${selectedCie.desc}`;
    $("#cCieChip").classList.remove("hidden");
  } else {
    selectedCie = null;
    $("#cCieChip").classList.add("hidden");
  }
  $("#cCieSearch").value = "";
  $("#cCieList").classList.add("hidden");
}

$("#cCieSearch")?.addEventListener("input", (e)=>{
  clearTimeout(cieTimer);
  const term = e.target.value.trim();
  if (term.length < 2){ $("#cCieList").classList.add("hidden"); return; }
  cieTimer = setTimeout(async ()=>{
    try{
      const list = await api(`/icd10?q=${encodeURIComponent(term)}`);
      const box = $("#cCieList");
      if (!list.length){ box.classList.add("hidden"); return; }
      box.innerHTML = list.map(c => `
        <button type="button" class="cie-item" data-ciecode="${escapeHtml(c.code)}" data-ciedesc="${escapeHtml(c.desc)}">
          <b>${escapeHtml(c.code)}</b> ${escapeHtml(c.desc)}
        </button>`).join("");
      box.classList.remove("hidden");
    }catch{}
  }, 250);
});

$("#cCieList")?.addEventListener("click", (e)=>{
  const b = e.target.closest("button[data-ciecode]");
  if (!b) return;
  setCie(b.dataset.ciecode, b.dataset.ciedesc);
});
$("#cCieClear")?.addEventListener("click", ()=> setCie(null, null));
document.addEventListener("click", (e)=>{
  if (!e.target.closest(".cie-box")) $("#cCieList")?.classList.add("hidden");
});

/* --- plantillas rápidas (diagnóstico y receta) --- */
let TPL = { rx: [], dx: [] };

async function loadTemplates(){
  const all = await api("/templates");
  TPL.rx = all.filter(t => t.type === "rx");
  TPL.dx = all.filter(t => t.type === "dx");
  const opt = (t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`;
  $("#dxTplSel") && ($("#dxTplSel").innerHTML = `<option value="">— Sin plantilla —</option>` + TPL.dx.map(opt).join(""));
  $("#rxTplSel") && ($("#rxTplSel").innerHTML = `<option value="">— Sin plantilla —</option>` + TPL.rx.map(opt).join(""));
}

$("#dxTplApply")?.addEventListener("click", ()=>{
  const t = TPL.dx.find(x => x.id === $("#dxTplSel").value);
  if (!t) return;
  const c = t.content || {};
  if (c.assessment) $("#cSoapA").value = c.assessment;
  if (c.plan) $("#cSoapP").value = c.plan;
  if (c.cie10_code || c.cie10_desc) setCie(c.cie10_code, c.cie10_desc);
});

$("#dxTplSave")?.addEventListener("click", async ()=>{
  const name = prompt("Nombre de la plantilla (ej: Gripe común):");
  if (!name) return;
  try{
    await api("/templates", { method:"POST", body: JSON.stringify({
      type: "dx", name,
      content: {
        assessment: $("#cSoapA").value.trim() || null,
        plan: $("#cSoapP").value.trim() || null,
        cie10_code: selectedCie?.code || null,
        cie10_desc: selectedCie?.desc || null,
      },
    })});
    await loadTemplates();
    $("#cSoapMsg").textContent = "Plantilla guardada ✅";
  }catch{ $("#cSoapMsg").textContent = "No se pudo guardar la plantilla."; }
});

function rxItemHtml(it = {}){
  return `
    <label>Medicamento</label>
    <input class="rxMed" placeholder="Medicamento" value="${escapeHtml(it.medication || "")}" />
    <div class="grid2">
      <div><label>Dosis</label><input class="rxDose" placeholder="Dosis" value="${escapeHtml(it.dose || "")}" /></div>
      <div><label>Frecuencia</label><input class="rxFreq" placeholder="Frecuencia" value="${escapeHtml(it.frequency || "")}" /></div>
    </div>
    <label>Duración</label>
    <input class="rxDur" placeholder="Duración" value="${escapeHtml(it.duration || "")}" />`;
}

$("#rxTplApply")?.addEventListener("click", ()=>{
  const t = TPL.rx.find(x => x.id === $("#rxTplSel").value);
  if (!t) return;
  const c = t.content || {};
  const items = Array.isArray(c.items) && c.items.length ? c.items : [{}];
  $("#rxItems").innerHTML = items.map(it => `<div class="rx-item">${rxItemHtml(it)}</div>`).join("");
  if (c.instructions) $("#rxInstructions").value = c.instructions;
});

$("#rxTplSave")?.addEventListener("click", async ()=>{
  const items = $$("#rxItems .rx-item").map(el => ({
    medication: el.querySelector(".rxMed").value.trim(),
    dose: el.querySelector(".rxDose").value.trim() || null,
    frequency: el.querySelector(".rxFreq").value.trim() || null,
    duration: el.querySelector(".rxDur").value.trim() || null,
  })).filter(i => i.medication);
  if (!items.length){ $("#rxMsg").textContent = "Agrega medicamentos antes de guardar la plantilla."; return; }
  const name = prompt("Nombre de la plantilla (ej: Gripe adulto):");
  if (!name) return;
  try{
    await api("/templates", { method:"POST", body: JSON.stringify({
      type: "rx", name,
      content: { items, instructions: $("#rxInstructions").value.trim() || null },
    })});
    await loadTemplates();
    $("#rxMsg").textContent = "Plantilla guardada ✅";
  }catch{ $("#rxMsg").textContent = "No se pudo guardar la plantilla."; }
});

/* --- cobro de la consulta --- */
$("#cPayForm")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  if (!consultaAppt) return;
  const msg = $("#cPayMsg");
  msg.textContent = "Registrando…";
  try{
    await api("/payments", { method:"POST", body: JSON.stringify({
      patient_id: consultaAppt.patient_id,
      appointment_id: consultaAppt.id,
      amount: Number($("#cPayAmount").value),
      method: $("#cPayMethod").value,
      status: $("#cPayStatus").value,
      concept: `Consulta — ${consultaAppt.reason || "atención médica"}`,
    })});
    msg.textContent = "Cobro registrado en caja ✅";
    e.target.reset();
  }catch{ msg.textContent = "No se pudo registrar."; }
});

/* --- próximo control --- */
function setFollowInput(days){
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  $("#cFollowDate").value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
document.addEventListener("click", (e)=>{
  const f = e.target.closest("button[data-follow]");
  if (f) setFollowInput(Number(f.dataset.follow));
});

$("#cFollowForm")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  if (!consultaAppt) return;
  const msg = $("#cFollowMsg");
  const start = $("#cFollowDate").value;
  if (!start){ msg.textContent = "Elige fecha y hora."; return; }
  msg.textContent = "Agendando…";
  try{
    const starts = new Date(start);
    await api("/appointments", { method:"POST", body: JSON.stringify({
      patient_id: consultaAppt.patient_id,
      type: "in_person",
      reason: "Control / seguimiento",
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + 30 * 60000).toISOString(),
    })});
    msg.textContent = `Control agendado ✅ ${fmtDate(starts.toISOString())}`;
    e.target.reset();
    APPTS = await api("/appointments");
    renderAgenda();
  }catch{ msg.textContent = "No se pudo agendar."; }
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
          <td data-label="Paciente"><b>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</b><div class="muted">${escapeHtml(p.id_number || "")}</div></td>
          <td data-label="Contacto">${escapeHtml(p.phone || "—")}<div class="muted">${escapeHtml(p.email || "")}</div></td>
          <td data-label="Antecedentes" class="muted">${escapeHtml(p.allergies || "—")} · ${escapeHtml(p.conditions || "—")}</td>
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
      family_history: $("#pFamily").value.trim() || null,
      surgical_history: $("#pSurgical").value.trim() || null,
      habits: $("#pHabits").value.trim() || null,
      medications: $("#pMeds").value.trim() || null,
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
    ["Condiciones", p.conditions],
    ["Antec. familiares", p.family_history],
    ["Antec. quirúrgicos", p.surgical_history],
    ["Hábitos", p.habits],
    ["Medicación habitual", p.medications],
    ["Notas", p.notes],
  ];
  $("#hcInfo").innerHTML = kv.map(([k,v]) => `
    <div class="kv"><div class="k">${k}</div><div class="v">${escapeHtml(v || "—")}</div></div>`).join("");

  renderEvoCharts(vitals);

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

/* --- PDF de historia clínica completa --- */
$("#hcPdfBtn")?.addEventListener("click", async ()=>{
  if (!hcPatientId) return;
  try{
    const res = await fetch(`${API}/patients/${hcPatientId}/historia.pdf`, { headers:{ Authorization:`Bearer ${token}` } });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(()=> URL.revokeObjectURL(url), 60_000);
  }catch{ alert("No se pudo generar el PDF."); }
});

/* --- gráficas de evolución (SVG, sin librerías, funciona offline) --- */
function evoChart(title, unit, series){
  const pts = series.flatMap(s => s.points);
  if (pts.length < 2){
    return `<div class="evo-card"><div class="evo-title">${title}</div><div class="empty" style="padding:18px 6px;">Se necesitan al menos 2 registros</div></div>`;
  }
  const W = 300, H = 130, PL = 34, PR = 10, PT = 12, PB = 22;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  if (yMin === yMax){ yMin -= 1; yMax += 1; }
  const pad = (yMax - yMin) * 0.15;
  yMin -= pad; yMax += pad;
  const X = (x) => PL + ((x - xMin) / Math.max(xMax - xMin, 1)) * (W - PL - PR);
  const Y = (y) => PT + (1 - (y - yMin) / (yMax - yMin)) * (H - PT - PB);

  const grid = [0, 0.5, 1].map(f => {
    const y = PT + f * (H - PT - PB);
    const val = (yMax - f * (yMax - yMin)).toFixed(0);
    return `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>
            <text x="${PL - 5}" y="${y + 3}" text-anchor="end" font-size="8" fill="#94a3b8">${val}</text>`;
  }).join("");

  const lines = series.map(s => {
    const sorted = [...s.points].sort((a,b)=> a.x - b.x);
    const path = sorted.map(p => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
    const dots = sorted.map(p => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.6" fill="${s.color}"/>`).join("");
    return `<polyline points="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>${dots}`;
  }).join("");

  const first = new Date(xMin).toLocaleDateString("es-EC", { day:"2-digit", month:"short" });
  const last = new Date(xMax).toLocaleDateString("es-EC", { day:"2-digit", month:"short" });
  const legend = series.length > 1
    ? `<div class="evo-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join("")}</div>` : "";
  const latest = series.map(s => {
    const sorted = [...s.points].sort((a,b)=> a.x - b.x);
    return sorted.length ? sorted[sorted.length-1].y : null;
  }).filter(v => v !== null).join(" / ");

  return `<div class="evo-card">
    <div class="evo-title">${title} <b class="evo-last">${latest} ${unit}</b></div>
    <svg viewBox="0 0 ${W} ${H}" class="evo-svg">
      ${grid}${lines}
      <text x="${PL}" y="${H - 6}" font-size="8" fill="#94a3b8">${first}</text>
      <text x="${W - PR}" y="${H - 6}" text-anchor="end" font-size="8" fill="#94a3b8">${last}</text>
    </svg>
    ${legend}
  </div>`;
}

function renderEvoCharts(vitals){
  const el = $("#evoCharts");
  if (!el) return;
  const asc = [...(vitals || [])].reverse();
  const serie = (field) => asc
    .filter(v => v[field] !== null && v[field] !== undefined)
    .map(v => ({ x: new Date(v.taken_at).getTime(), y: Number(v[field]) }));

  el.innerHTML =
    evoChart("⚖️ Peso", "kg", [{ label:"Peso", color:"#0d9488", points: serie("weight_kg") }]) +
    evoChart("🩸 Presión arterial", "mmHg", [
      { label:"Sistólica", color:"#dc2626", points: serie("systolic") },
      { label:"Diastólica", color:"#2563eb", points: serie("diastolic") },
    ]) +
    evoChart("🍬 Glucosa", "mg/dl", [{ label:"Glucosa", color:"#d97706", points: serie("glucose_mgdl") }]);
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
  $("#eFamily").value = p.family_history || "";
  $("#eSurgical").value = p.surgical_history || "";
  $("#eHabits").value = p.habits || "";
  $("#eMeds").value = p.medications || "";
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
      family_history: $("#eFamily").value.trim() || null,
      surgical_history: $("#eSurgical").value.trim() || null,
      habits: $("#eHabits").value.trim() || null,
      medications: $("#eMeds").value.trim() || null,
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
            <td data-label="Paciente"><b>${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</b></td>
            <td data-label="Fecha">${fmtDate(r.created_at)}</td>
            <td data-label="Indicaciones" class="muted">${escapeHtml((r.instructions || "—").slice(0, 60))}</td>
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
          <td data-label="Paciente"><b>${escapeHtml(a.first_name)} ${escapeHtml(a.last_name)}</b></td>
          <td data-label="Llegada">${fmtTime(a.created_at)}</td>
          <td data-label="Motivo" class="muted">${escapeHtml(a.reason || "—")}</td>
          <td data-label="Estado">${pill(a.status)}</td>
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

/* ================= inventario ================= */
async function loadInventory(){
  const term = $("#invSearch")?.value.trim() || "";
  const list = await api(`/inventory${term ? `?search=${encodeURIComponent(term)}` : ""}`);
  const catMap = { med:"Medicamento", supply:"Insumo", other:"Otro" };
  const isAdmin = ["admin","superadmin"].includes(me?.role);
  const soon = Date.now() + 60 * 86400000;

  $("#invTable").innerHTML = list.length ? `
    <table class="tbl">
      <thead><tr><th>Ítem</th><th>Stock</th><th>Vence</th><th>Acciones</th></tr></thead>
      <tbody>${list.map(it => {
        const low = Number(it.stock) <= Number(it.min_stock);
        const expiring = it.expiry_date && new Date(it.expiry_date).getTime() <= soon;
        const expired = it.expiry_date && new Date(it.expiry_date) < new Date();
        return `
        <tr>
          <td data-label="Ítem"><b>${escapeHtml(it.name)}</b>
            <div class="muted">${catMap[it.category] || ""}${it.notes ? " · " + escapeHtml(it.notes) : ""}</div></td>
          <td data-label="Stock">
            <b style="${low ? "color:#dc2626" : ""}">${Number(it.stock)}</b> ${escapeHtml(it.unit || "")}
            ${low ? `<div><span class="pill bad">Stock bajo</span></div>` : ""}
            <div class="muted">mín: ${Number(it.min_stock)}</div>
          </td>
          <td data-label="Vence">${it.expiry_date ? fmtDay(it.expiry_date) : "—"}
            ${expired ? `<div><span class="pill bad">Vencido</span></div>` : expiring ? `<div><span class="pill wait">Por vencer</span></div>` : ""}</td>
          <td><div class="row-actions">
            <button class="btn btn-outline btn-sm" data-invadj="${it.id}:1" title="Entrada">＋</button>
            <button class="btn btn-outline btn-sm" data-invadj="${it.id}:-1" title="Salida">−</button>
            <button class="btn btn-outline btn-sm" data-invadjn="${it.id}" title="Ajustar cantidad">±N</button>
            ${isAdmin ? `<button class="btn btn-outline btn-sm" data-invdel="${it.id}">✕</button>` : ""}
          </div></td>
        </tr>`; }).join("")}
      </tbody>
    </table>` : `<div class="empty">Inventario vacío — agrega el primer ítem</div>`;
}

let invTimer = null;
$("#invSearch")?.addEventListener("input", ()=>{
  clearTimeout(invTimer);
  invTimer = setTimeout(()=> loadInventory().catch(()=>{}), 300);
});

$("#invForm")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const msg = $("#invMsg");
  msg.textContent = "Guardando…";
  try{
    await api("/inventory", { method:"POST", body: JSON.stringify({
      name: $("#invName").value.trim(),
      category: $("#invCat").value,
      unit: $("#invUnit").value.trim() || null,
      stock: Number($("#invStock").value) || 0,
      min_stock: Number($("#invMin").value) || 0,
      expiry_date: $("#invExpiry").value || null,
      notes: $("#invNotes").value.trim() || null,
    })});
    msg.textContent = "Ítem agregado ✅";
    e.target.reset();
    await loadInventory();
    loadInvAlerts().catch(()=>{});
  }catch{ msg.textContent = "No se pudo guardar."; }
});

$("#invTable")?.addEventListener("click", async (e)=>{
  const adj = e.target.closest("button[data-invadj]");
  if (adj){
    const [id, delta] = adj.dataset.invadj.split(":");
    try{ await api(`/inventory/${id}/adjust`, { method:"POST", body: JSON.stringify({ delta: Number(delta) }) }); await loadInventory(); loadInvAlerts().catch(()=>{}); }catch{}
    return;
  }
  const adjn = e.target.closest("button[data-invadjn]");
  if (adjn){
    const v = prompt("Cantidad a ajustar (positiva = entrada, negativa = salida):", "-1");
    const delta = Number(v);
    if (!v || !Number.isFinite(delta) || delta === 0) return;
    try{ await api(`/inventory/${adjn.dataset.invadjn}/adjust`, { method:"POST", body: JSON.stringify({ delta }) }); await loadInventory(); loadInvAlerts().catch(()=>{}); }catch{}
    return;
  }
  const del = e.target.closest("button[data-invdel]");
  if (del){
    if (!confirm("¿Eliminar este ítem del inventario?")) return;
    try{ await api(`/inventory/${del.dataset.invdel}`, { method:"DELETE" }); await loadInventory(); loadInvAlerts().catch(()=>{}); }
    catch{ alert("No se pudo eliminar."); }
  }
});

/* --- alertas de inventario en el dashboard --- */
async function loadInvAlerts(){
  const card = $("#invAlertCard");
  if (!card) return;
  const alerts = await api("/inventory/alerts");
  if (!alerts.length){ card.classList.add("hidden"); return; }
  card.classList.remove("hidden");
  $("#invAlertList").innerHTML = alerts.slice(0, 6).map(a => `
    <div class="bday-row">
      <span class="bday-ico">${a.low_stock ? "📉" : "⏰"}</span>
      <div class="bday-info"><b>${escapeHtml(a.name)}</b>
        <span>${a.low_stock ? `Quedan ${Number(a.stock)} ${escapeHtml(a.unit || "")} (mín ${Number(a.min_stock)})` : `Vence ${fmtDay(a.expiry_date)}`}</span>
      </div>
    </div>`).join("");
}

/* ================= recordatorios de citas ================= */
$("#remRange")?.addEventListener("change", ()=> renderReminders());

function renderReminders(){
  const el = $("#remTable");
  if (!el) return;
  const range = $("#remRange")?.value || "tomorrow";
  const today = new Date(); today.setHours(0,0,0,0);
  let from, to;
  if (range === "today"){ from = today; to = new Date(today.getTime() + 86400000); }
  else if (range === "tomorrow"){ from = new Date(today.getTime() + 86400000); to = new Date(today.getTime() + 2 * 86400000); }
  else { from = today; to = new Date(today.getTime() + 7 * 86400000); }

  const list = APPTS
    .filter(a => { const t = new Date(a.starts_at); return t >= from && t < to && ["scheduled","confirmed"].includes(a.status); })
    .sort((a,b)=> new Date(a.starts_at) - new Date(b.starts_at));

  $("#remCount").textContent = String(list.length);
  $("#remWithPhone").textContent = String(list.filter(a => a.phone).length);

  el.innerHTML = list.length ? `
    <table class="tbl">
      <thead><tr><th>Paciente</th><th>Fecha</th><th>Motivo</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>${list.map(a => `
        <tr>
          <td data-label="Paciente"><b>${escapeHtml(a.first_name)} ${escapeHtml(a.last_name)}</b>
            <div class="muted">${escapeHtml(a.phone || "sin teléfono")}</div></td>
          <td data-label="Fecha">${fmtDate(a.starts_at)}</td>
          <td data-label="Motivo" class="muted">${escapeHtml(a.reason || "—")}</td>
          <td data-label="Estado">${pill(a.status)}</td>
          <td><div class="row-actions">
            ${a.phone ? `<button class="btn btn-wa btn-sm" data-wa="${a.id}">📱 Recordar</button>` : `<span class="muted">sin teléfono</span>`}
            ${a.status === "scheduled" ? `<button class="btn btn-outline btn-sm" data-status="${a.id}:confirmed">✓ Confirmada</button>` : ""}
          </div></td>
        </tr>`).join("")}
      </tbody>
    </table>` : `<div class="empty">No hay citas pendientes en este rango 🎉</div>`;
}

/* ================= caja y estadísticas ================= */
const money = (v) => `$${Number(v || 0).toFixed(2)}`;

async function loadCaja(){
  try{
    const [sum, stats] = await Promise.all([api("/payments/summary"), api("/stats/overview")]);
    $("#cashToday").textContent = money(sum.today_total);
    $("#cashTodayCount").textContent = sum.today_count ? `${sum.today_count} cobro(s)` : "";
    $("#cashMonth").textContent = money(sum.month_total);
    $("#cashPending").textContent = money(sum.pending_total);
    $("#statAbsentism").textContent = `${stats.absentism_rate}%`;

    renderMiniBars("#stNewPatients", stats.new_patients_by_month.map(r => ({ label: monthShort(r.month), value: Number(r.count) })), "");
    renderMiniBars("#stIncome", stats.income_by_month.map(r => ({ label: monthShort(r.month), value: Number(r.total) })), "$");

    $("#stTopDx").innerHTML = stats.top_diagnoses.length
      ? stats.top_diagnoses.map(d => `<li><b>${escapeHtml((d.dx || "").slice(0, 48))}</b>${d.code ? ` <span class="muted">(${escapeHtml(d.code)})</span>` : ""} — ${d.count}</li>`).join("")
      : `<div class="empty">Aún sin diagnósticos registrados</div>`;

    $("#stBusyHours").innerHTML = stats.busy_hours.length
      ? stats.busy_hours.map(h => `<div class="hour-row"><b>${String(h.hour).padStart(2,"0")}:00</b><div class="hour-bar"><i style="width:${Math.round((h.count / stats.busy_hours[0].count) * 100)}%"></i></div><span>${h.count}</span></div>`).join("")
      : `<div class="empty">Sin datos aún</div>`;
  }catch{}
  await loadPayments().catch(()=>{});
}

function monthShort(ym){
  const [y, m] = String(ym).split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-EC", { month: "short" });
}

function renderMiniBars(sel, data, prefix){
  const el = $(sel);
  if (!el) return;
  if (!data.length){ el.innerHTML = `<div class="empty">Sin datos aún</div>`; return; }
  const max = Math.max(...data.map(d => d.value), 1);
  el.innerHTML = data.map(d => `
    <div class="wbar">
      <div class="num">${prefix}${d.value >= 1000 ? (d.value/1000).toFixed(1) + "k" : d.value}</div>
      <div class="bar" style="height:${Math.max(Math.round((d.value / max) * 100), 5)}%"></div>
      <div class="day">${d.label}</div>
    </div>`).join("");
}

async function loadPayments(){
  const f = $("#payFilter")?.value || "";
  const list = await api(`/payments${f ? `?status=${f}` : ""}`);
  const methodMap = { cash:"Efectivo", card:"Tarjeta", transfer:"Transf.", other:"Otro" };
  const isAdmin = ["admin","superadmin"].includes(me?.role);
  $("#payTable").innerHTML = list.length ? `
    <table class="tbl">
      <thead><tr><th>Paciente</th><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
      <tbody>${list.map(p => `
        <tr>
          <td data-label="Paciente"><b>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</b></td>
          <td data-label="Fecha">${fmtDate(p.created_at)}</td>
          <td data-label="Concepto" class="muted">${escapeHtml(p.concept || "—")} · ${methodMap[p.method] || p.method}</td>
          <td data-label="Monto"><b>${money(p.amount)}</b></td>
          <td data-label="Estado">${p.status === "paid" ? `<span class="pill ok">Pagado</span>` : `<span class="pill wait">Pendiente</span>`}</td>
          <td><div class="row-actions">
            ${p.status === "pending" ? `<button class="btn btn-primary btn-sm" data-payok="${p.id}">✓ Cobrar</button>` : ""}
            ${isAdmin ? `<button class="btn btn-outline btn-sm" data-paydel="${p.id}">✕</button>` : ""}
          </div></td>
        </tr>`).join("")}
      </tbody>
    </table>` : `<div class="empty">Sin movimientos aún — registra el primer cobro</div>`;
}

$("#payFilter")?.addEventListener("change", ()=> loadPayments().catch(()=>{}));

$("#payTable")?.addEventListener("click", async (e)=>{
  const ok = e.target.closest("button[data-payok]");
  if (ok){
    try{ await api(`/payments/${ok.dataset.payok}/pay`, { method:"POST" }); await loadCaja(); }catch{}
    return;
  }
  const del = e.target.closest("button[data-paydel]");
  if (del){
    if (!confirm("¿Eliminar este movimiento de caja?")) return;
    try{ await api(`/payments/${del.dataset.paydel}`, { method:"DELETE" }); await loadCaja(); }
    catch{ alert("No se pudo eliminar."); }
  }
});

$("#payForm")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const msg = $("#payMsg");
  msg.textContent = "Registrando…";
  try{
    await api("/payments", { method:"POST", body: JSON.stringify({
      patient_id: $("#payPatient").value,
      amount: Number($("#payAmount").value),
      method: $("#payMethod").value,
      status: $("#payStatus").value,
      concept: $("#payConcept").value.trim() || null,
    })});
    msg.textContent = "Cobro registrado ✅";
    e.target.reset();
    await loadCaja();
  }catch{ msg.textContent = "No se pudo registrar."; }
});

/* ================= cumpleaños de hoy ================= */
async function loadBirthdays(){
  const list = await api("/stats/birthdays");
  const card = $("#birthdayCard");
  if (!card) return;
  if (!list.length){ card.classList.add("hidden"); return; }
  card.classList.remove("hidden");
  $("#birthdayList").innerHTML = list.map(p => `
    <div class="bday-row">
      <span class="bday-ico">🎂</span>
      <div class="bday-info"><b>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</b><span>${p.age} años</span></div>
      ${p.phone ? `<button class="btn btn-wa btn-sm" data-bday="${escapeHtml(p.phone)}" data-bdayname="${escapeHtml(p.first_name)}">📱 Felicitar</button>` : ""}
    </div>`).join("");
}

document.addEventListener("click", (e)=>{
  const b = e.target.closest("button[data-bday]");
  if (!b) return;
  const phone = waPhone(b.dataset.bday);
  if (!phone) return;
  const msg = `¡Feliz cumpleaños, ${b.dataset.bdayname}! 🎉 Le deseamos un excelente día. Con cariño, ${CLINIC?.name || "su consultorio"} 🩺`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
});

/* ================= auditoría (solo admin) ================= */
async function loadAudit(){
  try{
    const rows = await api("/clinic/audit");
    $("#auditTable").innerHTML = rows.length ? `
      <table class="tbl">
        <thead><tr><th>Usuario</th><th>Acción</th><th>Recurso</th><th>Fecha</th></tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td data-label="Usuario"><b>${escapeHtml(r.user_name || "—")}</b></td>
            <td data-label="Acción">${auditVerb(r.method)}</td>
            <td data-label="Recurso" class="muted">${escapeHtml(auditPath(r.path))}</td>
            <td data-label="Fecha">${fmtDate(r.created_at)}</td>
          </tr>`).join("")}
        </tbody>
      </table>` : `<div class="empty">Sin eventos aún — se registran automáticamente</div>`;
  }catch{
    $("#auditTable").innerHTML = `<div class="empty">No se pudo cargar la auditoría</div>`;
  }
}
function auditVerb(m){
  return ({ GET:`<span class="pill info">Consultó</span>`, POST:`<span class="pill ok">Creó</span>`,
            PUT:`<span class="pill wait">Editó</span>`, DELETE:`<span class="pill bad">Eliminó</span>` })[m] || m;
}
function auditPath(p){
  const map = [
    [/^\/patients\/[0-9a-f-]+\/historia/, "Historia clínica completa (PDF)"],
    [/^\/patients\/[0-9a-f-]+/, "Ficha de paciente"], [/^\/patients/, "Paciente"],
    [/^\/appointments/, "Cita"], [/^\/encounters/, "Nota clínica"],
    [/^\/vitals/, "Signos vitales"], [/^\/prescriptions.*pdf/, "Receta (PDF)"],
    [/^\/prescriptions/, "Receta"], [/^\/certificates.*pdf/, "Certificado (PDF)"],
    [/^\/certificates/, "Certificado"], [/^\/files.*download/, "Descarga de examen"],
    [/^\/files/, "Examen/archivo"], [/^\/payments/, "Caja"],
    [/^\/templates/, "Plantilla"], [/^\/clinic\/users/, "Usuario"], [/^\/clinic/, "Consultorio"],
    [/^\/chat/, "Chat"],
  ];
  for (const [re, label] of map) if (re.test(p)) return label;
  return p;
}
$("#auditRefresh")?.addEventListener("click", ()=> loadAudit());

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
