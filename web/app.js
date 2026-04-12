/* AGX Salud — Frontend vanilla */
const API = "/api";
const $ = (s) => document.querySelector(s);

const loginCard = $("#loginCard");
const views = $("#views");
const loginForm = $("#loginForm");
const loginMsg = $("#loginMsg");

const btnLogout = $("#btnLogout");
const btnLogout2 = $("#btnLogout2");

const menu = $("#menu");
const title = $("#title");
const subtitle = $("#subtitle");

const statAppointments = $("#statAppointments");
const statPatients = $("#statPatients");
const statQueue = $("#statQueue");

const dashAppointments = $("#dashAppointments");

const patientsTable = $("#patientsTable");
const patientForm = $("#patientForm");
const patientMsg = $("#patientMsg");

const apptTable = $("#appointmentsTable");
const apptForm = $("#apptForm");
const apptPatient = $("#apptPatient");
const apptType = $("#apptType");
const apptStart = $("#apptStart");
const apptEnd = $("#apptEnd");
const apptReason = $("#apptReason");
const apptMsg = $("#apptMsg");

const queueTable = $("#queueTable");
const walkinForm = $("#walkinForm");
const walkinPatient = $("#walkinPatient");
const walkinType = $("#walkinType");
const walkinReason = $("#walkinReason");
const walkinMsg = $("#walkinMsg");

const chatApptTable = $("#chatApptTable");
const chatSub = $("#chatSub");
const chatLog = $("#chatLog");
const chatForm = $("#chatForm");
const chatInput = $("#chatInput");

const aiForm = $("#aiForm");
const aiMessage = $("#aiMessage");
const aiMsg = $("#aiMsg");
const aiAnswer = $("#aiAnswer");

const meName = $("#meName");
const meRole = $("#meRole");

const quickNewPatient = $("#quickNewPatient");
const quickNewAppt = $("#quickNewAppt");
const quickWalkIn = $("#quickWalkIn");

let token = localStorage.getItem("agx_token") || "";
let me = null;
let socket = null;
let currentThreadId = null;

function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function pill(status){
  const map = {
    scheduled: ["Programada", "info"],
    confirmed: ["Confirmada", "ok"],
    waiting: ["En cola", "wait"],
    in_progress: ["En atención", "info"],
    done: ["Finalizada", "ok"],
    canceled: ["Cancelada", "bad"],
  };
  const [label, cls] = map[status] || [status, "info"];
  return `<span class="pill ${cls}">${label}</span>`;
}

async function api(path, options = {}) {
  const headers = options.headers || {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(()=> "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

function setView(name) {
  document.querySelectorAll(".menu-item").forEach(b => b.classList.toggle("is-active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  $("#view-" + name).classList.remove("hidden");

  const titles = {
    dashboard: ["Dashboard", "Resumen de actividad"],
    appointments: ["Citas", "Agenda y estados"],
    patients: ["Pacientes", "Ficha y antecedentes"],
    queue: ["Atención inmediata", "Cola de turnos"],
    chat: ["Chat", "Privado por cita"],
    ai: ["IA (triage)", "Sugerencias — no diagnóstico"],
    settings: ["Cuenta", "Sesión actual"],
  };
  const [t, s] = titles[name] || ["", ""];
  title.textContent = t;
  subtitle.textContent = s;
}

async function loadPatientsSelects(patients){
  const options = patients.map(p => `<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join("");
  apptPatient.innerHTML = options;
  walkinPatient.innerHTML = options;
}

function renderPatientsTable(patients){
  const head = `<div class="row head"><div>Paciente</div><div>Contacto</div><div>Antecedentes</div><div>Acción</div></div>`;
  const rows = patients.map(p => `
    <div class="row">
      <div><b>${p.first_name} ${p.last_name}</b><div class="muted">${p.id_number || ""}</div></div>
      <div>${p.phone || "—"}<div class="muted">${p.email || ""}</div></div>
      <div class="muted">${(p.allergies || "—")} • ${(p.conditions || "—")}</div>
      <div><button class="btn btn-outline" data-vitals="${p.id}">Signos</button></div>
    </div>
  `).join("");
  patientsTable.innerHTML = `<div class="table">${head}${rows || `<div class="row"><div class="muted">Sin pacientes</div></div>`}</div>`;
}

function renderAppointmentsTable(appts, targetEl){
  const head = `<div class="row head"><div>Paciente</div><div>Fecha</div><div>Tipo</div><div>Estado</div></div>`;
  const rows = appts.map(a => `
    <div class="row">
      <div><b>${a.first_name} ${a.last_name}</b><div class="muted">${a.reason || ""}</div></div>
      <div>${fmtDate(a.starts_at)}<div class="muted">${fmtDate(a.ends_at)}</div></div>
      <div>${a.type === "virtual" ? "Virtual" : "Presencial"}</div>
      <div>
        ${pill(a.status)}
        <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-outline" data-status="${a.id}:confirmed">Confirmar</button>
          <button class="btn btn-outline" data-status="${a.id}:waiting">Cola</button>
          <button class="btn btn-outline" data-status="${a.id}:in_progress">Atender</button>
          <button class="btn btn-outline" data-status="${a.id}:done">Finalizar</button>
          ${a.type === "virtual" ? `<button class="btn btn-primary" data-room="${a.id}">Sala</button>` : ""}
          <button class="btn btn-outline" data-chat="${a.id}">Chat</button>
        </div>
      </div>
    </div>
  `).join("");
  targetEl.innerHTML = `<div class="table">${head}${rows || `<div class="row"><div class="muted">Sin citas</div></div>`}</div>`;
}

function renderQueueTable(appts){
  const head = `<div class="row head"><div>Paciente</div><div>Inicio</div><div>Tipo</div><div>Estado</div></div>`;
  const rows = appts.map(a => `
    <div class="row">
      <div><b>${a.first_name} ${a.last_name}</b><div class="muted">${a.reason || ""}</div></div>
      <div>${fmtDate(a.starts_at)}</div>
      <div>${a.type === "virtual" ? "Virtual" : "Presencial"}</div>
      <div>${pill(a.status)}</div>
    </div>
  `).join("");
  queueTable.innerHTML = `<div class="table">${head}${rows || `<div class="row"><div class="muted">Cola vacía</div></div>`}</div>`;
}

function renderChatMessages(msgs){
  chatLog.innerHTML = msgs.map(m => `
    <div class="msg">
      <div class="meta">${m.sender_name || "Usuario"} • ${fmtDate(m.created_at)}</div>
      <div class="body">${escapeHtml(m.body)}</div>
    </div>
  `).join("");
  chatLog.scrollTop = chatLog.scrollHeight;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

async function ensureSocket(){
  if (socket) return socket;
  socket = io({ auth: { token } });
  socket.on("connect_error", (e)=> console.warn("socket error", e.message));
  socket.on("message:new", (msg)=>{
    if (currentThreadId && msg.thread_id === currentThreadId) {
      // append
      const div = document.createElement("div");
      div.className = "msg";
      div.innerHTML = `<div class="meta">${msg.sender_name || "Usuario"} • ${fmtDate(msg.created_at)}</div><div class="body">${escapeHtml(msg.body)}</div>`;
      chatLog.appendChild(div);
      chatLog.scrollTop = chatLog.scrollHeight;
    }
  });
  return socket;
}

async function openChatForAppointment(appointmentId){
  setView("chat");

  const thread = await api("/chat/thread", { method:"POST", body: JSON.stringify({ appointment_id: appointmentId }) });
  currentThreadId = thread.id;

  chatSub.textContent = `Hilo: ${thread.id.slice(0,8)} • Cita: ${appointmentId.slice(0,8)}`;

  const msgs = await api(`/chat/thread/${thread.id}/messages`);
  renderChatMessages(msgs);

  const s = await ensureSocket();
  s.emit("thread:join", { threadId: thread.id });
}

async function loadAll(){
  const [patients, appts, queue] = await Promise.all([
    api("/patients"),
    api("/appointments"),
    api("/appointments/queue")
  ]);

  statPatients.textContent = patients.length;
  statAppointments.textContent = appts.length;
  statQueue.textContent = queue.length;

  // dashboard: show next 8 by starts_at asc
  const next = [...appts].sort((a,b)=> new Date(a.starts_at) - new Date(b.starts_at)).slice(0, 8);
  renderAppointmentsTable(next, dashAppointments);

  renderPatientsTable(patients);
  await loadPatientsSelects(patients);

  renderAppointmentsTable(appts, apptTable);
  renderQueueTable(queue);

  // chat appointment table
  renderAppointmentsTable(appts.slice(0, 15), chatApptTable);
}

function setAuthedUI(){
  loginCard.classList.add("hidden");
  views.classList.remove("hidden");
  btnLogout.classList.remove("hidden");
  meName.textContent = me?.name || "—";
  meRole.textContent = me?.role || "—";
}

function setLoggedOutUI(){
  token = "";
  me = null;
  localStorage.removeItem("agx_token");
  loginCard.classList.remove("hidden");
  views.classList.add("hidden");
  btnLogout.classList.add("hidden");
  if (socket) { socket.disconnect(); socket = null; }
}

loginForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  loginMsg.textContent = "Ingresando…";
  const fd = new FormData(loginForm);
  try{
    const data = await fetch(`${API}/auth/login`, {
      method:"POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") })
    }).then(r=> r.ok ? r.json() : Promise.reject(new Error("Credenciales inválidas")));
    token = data.token;
    me = data.user;
    localStorage.setItem("agx_token", token);
    loginMsg.textContent = "Listo ✅";
    setAuthedUI();
    setView("dashboard");
    await loadAll();
  }catch(err){
    loginMsg.textContent = "No se pudo ingresar. Revisa email y contraseña.";
  }
});

btnLogout.addEventListener("click", setLoggedOutUI);
btnLogout2.addEventListener("click", setLoggedOutUI);

menu.addEventListener("click", (e)=>{
  const b = e.target.closest("button[data-view]");
  if (!b) return;
  setView(b.dataset.view);
});

patientsTable.addEventListener("click", async (e)=>{
  const btn = e.target.closest("button[data-vitals]");
  if (!btn) return;
  const patientId = btn.dataset.vitals;

  // simple popup prompt for vitals
  const systolic = prompt("Sistólica (ej 120):");
  const diastolic = prompt("Diastólica (ej 80):");
  const heart = prompt("Frecuencia cardiaca (ej 70):");
  try{
    await api("/vitals", {
      method:"POST",
      body: JSON.stringify({
        patient_id: patientId,
        systolic: systolic ? Number(systolic) : null,
        diastolic: diastolic ? Number(diastolic) : null,
        heart_rate: heart ? Number(heart) : null
      })
    });
    alert("Signos guardados ✅");
  }catch{
    alert("No se pudo guardar.");
  }
});

patientForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  patientMsg.textContent = "Guardando…";
  try{
    await api("/patients", {
      method:"POST",
      body: JSON.stringify({
        first_name: $("#pFirst").value.trim(),
        last_name: $("#pLast").value.trim(),
        phone: $("#pPhone").value.trim() || null,
        email: $("#pEmail").value.trim() || null,
        allergies: $("#pAllergies").value.trim() || null,
        conditions: $("#pConditions").value.trim() || null,
        notes: $("#pNotes").value.trim() || null,
      })
    });
    patientMsg.textContent = "Listo ✅";
    patientForm.reset();
    await loadAll();
  }catch{
    patientMsg.textContent = "No se pudo guardar.";
  }
});

apptForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  apptMsg.textContent = "Creando…";
  try{
    await api("/appointments", {
      method:"POST",
      body: JSON.stringify({
        patient_id: apptPatient.value,
        type: apptType.value,
        reason: apptReason.value.trim() || null,
        starts_at: new Date(apptStart.value).toISOString(),
        ends_at: new Date(apptEnd.value).toISOString(),
      })
    });
    apptMsg.textContent = "Cita creada ✅";
    apptForm.reset();
    await loadAll();
  }catch{
    apptMsg.textContent = "No se pudo crear.";
  }
});

apptTable.addEventListener("click", async (e)=>{
  const st = e.target.closest("button[data-status]");
  if (st){
    const [id, status] = st.dataset.status.split(":");
    try{
      await api(`/appointments/${id}/status`, { method:"POST", body: JSON.stringify({ status }) });
      await loadAll();
    }catch{}
    return;
  }
  const room = e.target.closest("button[data-room]");
  if (room){
    const id = room.dataset.room;
    const data = await api(`/appointments/${id}/virtual-room`);
    window.open(data.url, "_blank", "noopener");
    return;
  }
  const chat = e.target.closest("button[data-chat]");
  if (chat){
    await openChatForAppointment(chat.dataset.chat);
    return;
  }
});

chatApptTable.addEventListener("click", async (e)=>{
  const chat = e.target.closest("button[data-chat]");
  if (chat) await openChatForAppointment(chat.dataset.chat);
  const room = e.target.closest("button[data-room]");
  if (room){
    const id = room.dataset.room;
    const data = await api(`/appointments/${id}/virtual-room`);
    window.open(data.url, "_blank", "noopener");
  }
});

walkinForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  walkinMsg.textContent = "Agregando…";
  try{
    await api("/appointments/walkin", {
      method:"POST",
      body: JSON.stringify({
        patient_id: walkinPatient.value,
        type: walkinType.value,
        reason: walkinReason.value.trim() || null
      })
    });
    walkinMsg.textContent = "Agregado ✅";
    walkinForm.reset();
    await loadAll();
  }catch{
    walkinMsg.textContent = "No se pudo agregar.";
  }
});

chatForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const body = chatInput.value.trim();
  if (!body || !currentThreadId) return;
  chatInput.value = "";
  const s = await ensureSocket();
  s.emit("message:send", { threadId: currentThreadId, body });
});

aiForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  aiMsg.textContent = "Analizando…";
  aiAnswer.textContent = "";
  try{
    const data = await api("/ai/triage", { method:"POST", body: JSON.stringify({ message: aiMessage.value }) });
    aiMsg.textContent = "Listo ✅";
    aiAnswer.textContent = data.reply;
  }catch{
    aiMsg.textContent = "No se pudo analizar.";
  }
});

quickNewPatient.addEventListener("click", ()=> { setView("patients"); window.scrollTo({top:0, behavior:"smooth"}); });
quickNewAppt.addEventListener("click", ()=> { setView("appointments"); window.scrollTo({top:0, behavior:"smooth"}); });
quickWalkIn.addEventListener("click", ()=> { setView("queue"); window.scrollTo({top:0, behavior:"smooth"}); });

// Boot
(async function boot(){
  btnLogout.classList.add("hidden");
  setView("dashboard");

  if (token){
    try{
      // test auth by calling a protected endpoint
      const pts = await api("/patients");
      // If success, show UI
      me = { name: "Sesión activa", role: "—" };
      setAuthedUI();
      await loadAll();
    }catch{
      setLoggedOutUI();
    }
  } else {
    setLoggedOutUI();
  }
})();
