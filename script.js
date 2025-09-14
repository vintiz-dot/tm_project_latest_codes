// Tuition Manager — FullCalendar build + Admin CRUD
;(function(){
  const TM = (window.TM = window.TM || {});

  // ---------- State & persistence ----------
  const LS_KEY = "tm:students-data";

  function normalizeData(obj){
    const d = {
      students: Array.isArray(obj.students) ? obj.students : [],
      classes: Array.isArray(obj.classes) ? obj.classes : [],
      enrollments: Array.isArray(obj.enrollments) ? obj.enrollments : [],
      sessions: Array.isArray(obj.sessions) ? obj.sessions : [],
      teachers: Array.isArray(obj.teachers) ? obj.teachers : [],
      meta: typeof obj.meta === 'object' && obj.meta ? obj.meta : {}
    };
    d.classes.forEach(c => {
      if (typeof c.defaultDurationHrs !== 'number') c.defaultDurationHrs = 1;
      if (typeof c.priceVnd !== 'number') c.priceVnd = 0;
      if (typeof c.teacherRatePerHour !== 'number') c.teacherRatePerHour = 0;
      if (typeof c.notes !== 'string') c.notes = '';
      if (typeof c.monthNotes !== 'object' || !c.monthNotes) c.monthNotes = {};
    });
    d.sessions.forEach(s => {
      if (s.date && s.date.length > 10) s.date = s.date.slice(0,10);
      if (typeof s.durationHrs !== 'number') s.durationHrs = 1;
    });
    return d;
  }

  TM.data = normalizeData({students:[],classes:[],enrollments:[],sessions:[],teachers:[],meta:{}});
  TM.util = {
    fmtVnd(n){ n = Number(n||0); return n.toLocaleString(undefined, {maximumFractionDigits:0}); },
    nextId(prefix){
      const k = `seq:${prefix}`;
      const n = (TM.data.meta[k] || 0) + 1;
      TM.data.meta[k] = n; return `${prefix}-${String(n).padStart(6,"0")}`;
    }
  };

  // ---- CRUD helpers and enrollment ops ----
  TM.id = {
    student(){ return TM.util.nextId("STU"); },
    class(){   return TM.util.nextId("CLS"); },
    teacher(){ return TM.util.nextId("TEA"); },
    enroll(){  return TM.util.nextId("ENR"); }
  };

  TM.enroll = function(studentId, classId, opts={}){
    const exists = TM.data.enrollments.find(e=>e.studentId===studentId && e.classId===classId);
    if (exists){
      if (opts.discountPct != null) exists.discountPct = Number(opts.discountPct)||0;
      if (opts.enrolledAt) exists.enrolledAt = opts.enrolledAt;
      return exists;
    }
    const row = {
      id: TM.id.enroll(),
      studentId, classId,
      discountPct: Number(opts.discountPct)||0,
      enrolledAt: opts.enrolledAt || new Date().toISOString().slice(0,10),
      notes: opts.notes || ""
    };
    TM.data.enrollments.push(row);
    return row;
  };

  TM.setStudentClasses = function(studentId, classMap){ // classMap: { classId: discountPct }
    const keepSet = new Set(Object.keys(classMap||{}));
    TM.data.enrollments = TM.data.enrollments.filter(e=>{
      if (e.studentId !== studentId) return true;
      return keepSet.has(e.classId);
    });
    for (const [cid, disc] of Object.entries(classMap||{})){
      TM.enroll(studentId, cid, { discountPct: Number(disc)||0 });
    }
  };

  TM.setClassTeacher = function(classId, teacherId){
    const cls = TM.classById(classId); if (!cls) return;
    const t = teacherId ? TM.teacherById(teacherId) : null;
    cls.teacherId = t?.id || null;
    cls.teacherName = t?.name || null;
    if (t && typeof t.ratePerHour === 'number') cls.teacherRatePerHour = Number(t.ratePerHour);
  };

  TM.crud = {
    addStudent(payload){
      const s = Object.assign({ id: TM.id.student(), status:"active" }, payload);
      // If no student code/id is provided, assign a default code matching the internal id
      if (!s.studentId || String(s.studentId).trim() === ""){
        s.studentId = s.id;
      }
      TM.data.students.push(s);
      return s;
    },
    updateStudent(id, patch){
      const s = TM.data.students.find(x=>x.id===id); if (!s) return null;
      Object.assign(s, patch); return s;
    },
    deleteStudent(id){
      TM.data.students = TM.data.students.filter(s=>s.id!==id);
      TM.data.enrollments = TM.data.enrollments.filter(e=>e.studentId!==id);
    },

    addClass(payload){
      const c = Object.assign({ id: TM.id.class(), priceVnd:0, defaultDurationHrs:1 }, payload);
      TM.data.classes.push(c); return c;
    },
    updateClass(id, patch){
      const c = TM.data.classes.find(x=>x.id===id); if (!c) return null;
      Object.assign(c, patch); return c;
    },
    deleteClass(id){
      TM.data.classes = TM.data.classes.filter(c=>c.id!==id);
      TM.data.enrollments = TM.data.enrollments.filter(e=>e.classId!==id);
      TM.data.sessions = TM.data.sessions.filter(s=>s.classId!==id);
    },

    addTeacher(payload){
      const t = Object.assign({ id: TM.id.teacher(), ratePerHour:0 }, payload);
      TM.data.teachers.push(t); return t;
    },
    updateTeacher(id, patch){
      const t = TM.data.teachers.find(x=>x.id===id); if (!t) return null;
      Object.assign(t, patch); return t;
    },
    deleteTeacher(id){
      TM.data.teachers = TM.data.teachers.filter(t=>t.id!==id);
      TM.data.classes.forEach(c=>{ if (c.teacherId===id){ c.teacherId=null; c.teacherName=null; } });
      TM.data.sessions.forEach(s=>{ if (s.teacherId===id){ s.teacherId=null; s.teacherName=null; } });
    }
  };

  TM._saveToLocal = function(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(TM.data)); }catch{} };
  TM._loadFromLocal = function(){
    try{
      const raw = localStorage.getItem(LS_KEY); if (!raw) return false;
      TM.data = normalizeData(JSON.parse(raw));
      TM._updateDataStatus("local");
      return true;
    }catch{ return false; }
  };
  TM._applyLoadedData = function(obj, source){
    TM.data = normalizeData(obj);
    TM._saveToLocal();
    TM._updateDataStatus(source);
    document.dispatchEvent(new CustomEvent("tm:data:changed", { detail: { source } }));
  };
  TM._updateDataStatus = function(source){
    const el = document.getElementById("dataStatus"); if (!el) return;
    const s = TM.data.students.length, c = TM.data.classes.length, e = TM.data.enrollments.length;
    el.textContent = `Loaded ${s} students, ${e} enrollments, ${c} classes${source ? " ("+source+")" : ""}`;
  };

  TM.loadStudentsFromFile = async function(file){
    if (!file) return;
    const txt = await file.text();
    let obj; try{ obj = JSON.parse(txt); }catch{ alert("This file is not valid JSON."); return; }
    TM._applyLoadedData(obj, "file");
  };
  TM.downloadStudents = function(filename="students_data.json"){
    const blob = new Blob([JSON.stringify(TM.data, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  };

  // ---------- Lookups & finance ----------
  TM.rosterForClass = classId => TM.data.enrollments.filter(e=>e.classId===classId).map(e=>e.studentId);
  TM.studentById = id => TM.data.students.find(s=>s.id===id);
  TM.classById   = id => TM.data.classes.find(c=>c.id===id);
  TM.teacherById = id => TM.data.teachers.find(t=>t.id===id);
  TM.sessionsFor = (classId, ym) => TM.data.sessions.filter(s => s.classId === classId && String(s.date||"").slice(0,7) === ym);

  TM.revenueFor = function(cls, ym){
    const held = TM.sessionsFor(cls.id, ym).filter(s=>s.status==="held").length;
    return (Number(cls.priceVnd||0) * held * TM.rosterForClass(cls.id).length) || 0;
  };

  /**
   * Compute detailed revenue for a class in a month. This considers per-student
   * attendance and discounts. Only sessions with status "held" are billable.
   * A student is billed for a session if their attendance is not marked as
   * "excused" (i.e. present or absent/unexcused). Discounts from the
   * enrollment record are applied per student. If a session has no
   * attendance record for a student, that student is considered billable.
   *
   * @param {Object} cls  The class record
   * @param {string} ym   The year-month string (YYYY-MM)
   * @returns {number}    Total revenue for the class in the month
   */
  TM.revenueForDetailed = function(cls, ym){
    let total = 0;
    const enrolls = TM.data.enrollments.filter(e => e.classId === cls.id);
    const sessions = TM.sessionsFor(cls.id, ym).filter(s => s.status === "held");
    sessions.forEach(s => {
      enrolls.forEach(e => {
        const sid = e.studentId;
        let status = null;
        if (s.attendance && typeof s.attendance === 'object'){
          status = s.attendance[sid];
        }
        if (!status && Array.isArray(s.present)){
          status = s.present.includes(sid) ? "present" : null;
        }
        // Bill if status is not excused
        if (status !== "excused"){
          const disc = Number(e.discountPct || 0);
          const price = Number(cls.priceVnd || 0);
          total += price * (1 - disc / 100);
        }
      });
    });
    return total;
  };

  /**
   * Generate an invoice for a single student in a given month. This calculates
   * the amount owed per class by summing the class price for each held
   * session where the student is billed (present or absent/unexcused). Any
   * discounts on the enrollment are applied. The returned object contains
   * the total amount and a breakdown per class.
   *
   * @param {string} studentId   Student identifier
   * @param {string} ym          Month in YYYY-MM format
   * @returns {Object}           { total: number, items: Array<{classId, className, amount}> }
   */
  TM.invoiceForStudent = function(studentId, ym){
    // Group charges by class so duplicate enrollments do not double-bill
    // Gather unique classes for this student (ignore duplicate enrollments)
    const enrolls = TM.data.enrollments.filter(e => e.studentId === studentId);
    const uniq = {};
    enrolls.forEach(e => {
      if (!uniq[e.classId]) uniq[e.classId] = e;
    });
    const items = [];
    let total = 0;
    Object.keys(uniq).forEach(cid => {
      const e = uniq[cid];
      const cls = TM.classById(cid);
      const price = Number(cls?.priceVnd || 0);
      const disc  = Number(e.discountPct || 0);
      const sessions = TM.sessionsFor(cid, ym).filter(s => s.status === 'held');
      let subtotal = 0;
      sessions.forEach(s => {
        // Determine attendance status for this student
        let status = null;
        if (s.attendance && typeof s.attendance === 'object'){
          status = s.attendance[studentId];
        }
        if (!status && Array.isArray(s.present)){
          status = s.present.includes(studentId) ? 'present' : null;
        }
        if (status !== 'excused'){
          subtotal += price * (1 - disc / 100);
        }
      });
      total += subtotal;
      items.push({ classId: cid, className: cls?.name || cid, amount: subtotal });
    });
    return { total, items };
  };
  TM.costFor = function(cls, ym){
    const sess = TM.sessionsFor(cls.id, ym).filter(s=>s.status==="held");
    const baseRate = Number(cls.teacherRatePerHour||0);
    const baseHrs  = Number(cls.defaultDurationHrs||1);
    let sum = 0;
      for (const s of sess){
      const rate = s.teacherRatePerHourSnap != null ? Number(s.teacherRatePerHourSnap)
                : (s.teacherId ? (TM.teacherById(s.teacherId)?.ratePerHour || baseRate) : baseRate);
      // Use the larger of the session duration or class default to avoid underpaying
      const rawHrs = (s.durationHrs != null ? Number(s.durationHrs) : baseHrs);
      const hrs    = rawHrs < baseHrs ? baseHrs : rawHrs;
      sum += rate * hrs;
    }
    return sum;
  };

  // ---------- Data menu ----------
  TM.initDataHooks = function(){
    const pick = (id, cb)=>{
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("click", e=>{
        e.preventDefault();
        const input = document.createElement("input");
        input.type = "file"; input.accept = ".json,application/json";
        input.onchange = async ()=>{ const f = input.files?.[0]; if (f) await cb(f); };
        input.click();
      });
    };
    pick("actConnectStudents", TM.loadStudentsFromFile);
    const createBtn = document.getElementById("actCreateStudents");
    createBtn?.addEventListener("click", e=>{
      e.preventDefault();
      TM._applyLoadedData({students:[],classes:[],enrollments:[],sessions:[],teachers:[],meta:{}}, "new");
    });
    const saveBtn = document.getElementById("actSaveStudents");
    saveBtn?.addEventListener("click", e=>{ e.preventDefault(); TM.downloadStudents(); });

    TM._loadFromLocal();
    TM._updateDataStatus("local");
  };

  // ---------- Calendar / Cards (FullCalendar) ----------
  TM.initCalendarPage = function(){
    // Controls
    const $monthPicker = document.getElementById("monthPicker");
    const $btnPrev = document.getElementById("btnPrevMonth");
    const $btnNext = document.getElementById("btnNextMonth");
    const $wrap = document.getElementById("classCalendars");
    const $fileImport = document.getElementById("fileImport");
    const $btnExport = document.getElementById("btnExport");

    // Modals
    const sesModalEl = document.getElementById("sessionEditorModal");
    const sesModal = sesModalEl ? new bootstrap.Modal(sesModalEl) : null;
    const classModalEl = document.getElementById("classDetailModal");
    const classModal = classModalEl ? new bootstrap.Modal(classModalEl) : null;
    const notesModalEl = document.getElementById("classNotesModal");
    const notesModal = notesModalEl ? new bootstrap.Modal(notesModalEl) : null;

    // Session modal fields
    const $sesDate = document.getElementById("sessionDateLabel");
    const $sesTeacher = document.getElementById("sessionTeacher");
    const $sesDuration = document.getElementById("sessionDuration");
    const $sesNote = document.getElementById("sessionNote");
    const $btnSaveSession = document.getElementById("btnSaveSession");
    const $btnClearSession = document.getElementById("btnClearSession");

    // Class modal fields
    const $cdTitle = document.getElementById("cdTitle");
    const $cdTeacherSel = document.getElementById("cdTeacherSel");
    const $cdTeacherLine = document.getElementById("cdTeacherLine");
    const $cdPrice = document.getElementById("cdPrice");
    const $cdDuration = document.getElementById("cdDuration");
    const $cdNotes = document.getElementById("cdNotes");
    const $cdRosterBody = document.getElementById("cdRosterBody");
    const $cdMonth = document.getElementById("cdMonth");
    const $cdAttendanceBody = document.getElementById("cdAttendanceBody");

    // Notes modal fields
    const $cmTitle = document.getElementById("cmTitle");
    const $cmMonth = document.getElementById("cmMonth");
    const $cmNotesInput = document.getElementById("cmNotesInput");
    const $cmSaveNotes = document.getElementById("cmSaveNotes");

    let currentYm = (new Date()).toISOString().slice(0,7);
    $monthPicker && ($monthPicker.value = currentYm);

    const calendars = new Map();

    // Convert session records into FullCalendar event objects. Include both held and
    // cancelled sessions so the background colors reflect the current status. Held
    // sessions will be styled with the `held-day` class while cancelled sessions
    // use the `cancelled-day` class. Other statuses are ignored and will not
    // render on the calendar.
    function sessionsToEvents(classId){
      return TM.sessionsFor(classId, currentYm)
        .filter(s => s.status === "held" || s.status === "cancelled")
        .map(s => ({
          id: s.id,
          start: s.date,
          allDay: true,
          display: "background",
          classNames: [s.status === "held" ? "held-day" : "cancelled-day"]
        }));
    }

    /**
     * Toggle session status for a given class and date when the user single-clicks.
     * This implements a simple two-state toggle: if there is no session or the
     * session status is not 'held', a new held session is created; otherwise,
     * the held session is removed. Cancelled sessions can be managed via the
     * session editor modal (not via simple clicks).
     */
    function quickToggleHeld(classId, ymd){
      const cls = TM.classById(classId);
      let s = TM.data.sessions.find(x => x.classId === classId && x.date === ymd);
      if (!s || s.status !== 'held'){
        // Create or update to a held session
        if (!s){
          TM.data.sessions.push({
            id: TM.util.nextId("SES"),
            classId,
            date: ymd,
            status: "held",
            durationHrs: Number(cls?.defaultDurationHrs || 1),
            teacherId: cls?.teacherId || null,
            teacherName: cls?.teacherName || null,
            teacherRatePerHourSnap: (typeof cls?.teacherRatePerHour === 'number') ? cls.teacherRatePerHour : null,
            note: "",
            present: []
          });
        } else {
          s.status = 'held';
        }
      } else {
        // Remove the held session entirely
        TM.data.sessions = TM.data.sessions.filter(x => !(x.classId === classId && x.date === ymd));
      }
      TM._saveToLocal();
      document.dispatchEvent(new CustomEvent("tm:data:sessionsChanged"));
    }

    // Toggle cancelled state: right-click sets status to "cancelled", another right-click clears it.
    function quickToggleCancelled(classId, ymd){
      const cls = TM.classById(classId);
      let s = TM.data.sessions.find(x => x.classId === classId && x.date === ymd);
      if (!s){
        // No session exists: create a cancelled session with defaults
        TM.data.sessions.push({
          id: TM.util.nextId("SES"),
          classId, date: ymd, status: "cancelled",
          durationHrs: Number(cls?.defaultDurationHrs || 1),
          teacherId: cls?.teacherId || null,
          teacherName: cls?.teacherName || null,
          teacherRatePerHourSnap: (typeof cls?.teacherRatePerHour === 'number') ? cls.teacherRatePerHour : null,
          note: "",
          present: []
        });
      } else if (s.status === "cancelled"){
        // If already cancelled, remove it completely
        TM.data.sessions = TM.data.sessions.filter(x => !(x.classId === classId && x.date === ymd));
      } else {
        // Otherwise mark as cancelled
        s.status = "cancelled";
      }
      TM._saveToLocal();
      document.dispatchEvent(new CustomEvent("tm:data:sessionsChanged"));
    }

    function buildCardHtml(cls){
      const roster = TM.rosterForClass(cls.id);
      const revenue = TM.revenueForDetailed(cls, currentYm);
      const cost = TM.costFor(cls, currentYm);
      const net = revenue - cost;

      return `
        <div class="col-md-6 col-lg-4">
          <div class="card class-card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <div class="fw-semibold">${cls.name}</div>
              <span class="price-pill badge text-secondary">${TM.util.fmtVnd(cls.priceVnd)} VND / session</span>
            </div>
            <div class="card-body">
              <div class="small-muted mb-2">ID: ${cls.id}</div>
              <div class="d-flex flex-wrap gap-3 mb-2">
                <div><strong>${roster.length}</strong> student${roster.length!==1?"s":""}</div>
              </div>
              <div class="d-flex flex-column gap-1 mb-2">
                <div>Revenue (${currentYm}): <strong>${TM.util.fmtVnd(revenue)}</strong> VND</div>
                <div>Teacher cost (${currentYm}): <strong>${TM.util.fmtVnd(cost)}</strong> VND</div>
                <div>Net: <strong>${TM.util.fmtVnd(net)}</strong> VND</div>
              </div>

              <div id="fc-${cls.id}" class="fc-mini"></div>

              <div class="d-flex gap-2 mt-2">
                <button class="btn btn-sm btn-outline-primary" data-cmd="details" data-class="${cls.id}">Details</button>
                <button class="btn btn-sm btn-outline-secondary" data-cmd="notes" data-class="${cls.id}">Notes</button>
              </div>
            </div>
          </div>
        </div>`;
    }

    function renderAll(){
      const $wrap = document.getElementById("classCalendars");
      if (!$wrap) return;

      // Paint cards
      $wrap.innerHTML = TM.data.classes.map(buildCardHtml).join("") ||
        `<div class="col-12"><div class="alert alert-warning">No classes. Connect your JSON.</div></div>`;

      // Build calendars
      const calendars = new Map();
      TM.data.classes.forEach(cls => {
        const el = document.getElementById(`fc-${cls.id}`);
        if (!el || !window.FullCalendar) return;

        const calendar = new FullCalendar.Calendar(el, {
          initialView: "dayGridMonth",
          firstDay: 0,
          height: "auto",
          headerToolbar: false,
          fixedWeekCount: true,
          showNonCurrentDates: true,
          initialDate: `${currentYm}-01`,
          events: sessionsToEvents(cls.id),
          // Left-click toggles a held session on/off. Use info.dateStr (local date) to avoid timezone issues.
          dateClick(info){ quickToggleHeld(cls.id, info.dateStr); },
          dayCellDidMount(arg){
            // Compute local ISO date string (YYYY-MM-DD) without timezone shift
            const d = arg.date;
            const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            // Right-click opens the session editor for detailed editing
            arg.el.addEventListener("contextmenu", (ev) => {
              ev.preventDefault();
              // Use the global session editor to edit this specific session
              TM.openSessionEditor(cls.id, iso);
            });
            // Double-click (optional) also opens the editor for convenience
            arg.el.addEventListener("dblclick", () => {
              // On double-click, open the session editor via the global handler
              TM.openSessionEditor(cls.id, iso);
            });
          }
        });

        calendar.render();
        calendars.set(cls.id, calendar);
      });

      // Buttons inside cards
      $wrap?.addEventListener("click", (e)=>{
        const btn = e.target.closest("[data-cmd][data-class]");
        if (!btn) return;
        const classId = btn.getAttribute("data-class");
        const cmd = btn.getAttribute("data-cmd");
        if (cmd === "details") openClassDetails(classId);
        if (cmd === "notes") openClassNotes(classId);
      }); // avoid stacking by delegating events without once option
    }

    // Month navigation
    function gotoMonth(delta){
      const [y,m] = ($monthPicker?.value || currentYm).split("-").map(Number);
      const d = new Date(y, m-1 + delta, 1);
      currentYm = d.toISOString().slice(0,7);
      if ($monthPicker) $monthPicker.value = currentYm;
      renderAll();
    }
    $btnPrev?.addEventListener("click", ()=> gotoMonth(-1));
    $btnNext?.addEventListener("click", ()=> gotoMonth(+1));
    $monthPicker?.addEventListener("change", ()=>{ currentYm = $monthPicker.value || currentYm; renderAll(); });

    // File import/export
    $fileImport?.addEventListener("change", async (e)=>{
      const f = e.target.files && e.target.files[0];
      if (f){ await TM.loadStudentsFromFile(f); e.target.value = ""; }
    });
    $btnExport?.addEventListener("click", ()=> TM.downloadStudents());

    // Re-render when data changes
    document.addEventListener("tm:data:changed", renderAll);
    document.addEventListener("tm:data:sessionsChanged", renderAll);

    // ----- Helpers used by modals -----
    function openSessionEditor(classId, ymd){
      const $sesDate = document.getElementById("sessionDateLabel");
      if (!$sesDate) return;
      const cls = TM.classById(classId);
      $sesDate.textContent = `${ymd} — ${cls?.name || ""}`;

      const $sesTeacher = document.getElementById("sessionTeacher");
      const $sesDuration = document.getElementById("sessionDuration");
      const $sesNote = document.getElementById("sessionNote");
      const $btnSaveSession = document.getElementById("btnSaveSession");
      const $btnClearSession = document.getElementById("btnClearSession");

      // Teacher select
      const opts = [`<option value="">Unassigned</option>`]
        .concat(TM.data.teachers.map(t => `<option value="${t.id}">${t.name||t.id} — ${TM.util.fmtVnd(t.ratePerHour||0)} VND/hr</option>`));
      if ($sesTeacher) $sesTeacher.innerHTML = opts.join("");

      const s = TM.data.sessions.find(x=>x.classId===classId && x.date===ymd);
      if ($sesDuration) $sesDuration.value = s?.durationHrs ?? (cls?.defaultDurationHrs || 1);
      if ($sesNote) $sesNote.value = s?.note || "";
      if ($sesTeacher) $sesTeacher.value = s?.teacherId || "";
      // Insert or update a status select (held/cancelled)
      let statEl = document.getElementById("sessionStatus");
      if (!statEl){
        const wrap = document.createElement("div");
        wrap.className = "mb-3";
        wrap.innerHTML = `
          <label class="form-label">Status</label>
          <select id="sessionStatus" class="form-select">
            <option value="held">Held</option>
            <option value="cancelled">Cancelled</option>
          </select>`;
        // insert after duration if possible
        const ref = $sesDuration?.closest('.mb-3') || $sesDuration?.parentElement;
        if (ref && ref.parentElement){
          ref.parentElement.insertBefore(wrap, ref.nextSibling);
        }
        statEl = wrap.querySelector("#sessionStatus");
      }
      if (statEl) statEl.value = (s && s.status) ? s.status : 'held';

      const sesModalEl = document.getElementById("sessionEditorModal");
      const sesModal = sesModalEl ? new bootstrap.Modal(sesModalEl) : null;

      $btnSaveSession && ($btnSaveSession.onclick = () => {
        const teacherId = $sesTeacher?.value || "";
        const teacher = teacherId ? TM.teacherById(teacherId) : null;
        const existing = TM.data.sessions.find(x=>x.classId===classId && x.date===ymd);
        const statSel = document.getElementById("sessionStatus");
        const statusVal = statSel ? statSel.value : 'held';
        const payload = {
          id: existing?.id || TM.util.nextId("SES"),
          classId: classId,
          date: ymd,
          status: statusVal || 'held',
          durationHrs: Number($sesDuration?.value || 1),
          teacherId: teacherId || null,
          teacherName: teacher?.name || (teacherId || null),
          teacherRatePerHourSnap: teacher?.ratePerHour ?? null,
          note: $sesNote?.value || ""
        };
        if (existing) Object.assign(existing, payload); else TM.data.sessions.push(payload);
        TM._saveToLocal();
        document.dispatchEvent(new CustomEvent("tm:data:sessionsChanged"));
        sesModal?.hide();
      });

      $btnClearSession && ($btnClearSession.onclick = () => {
        TM.data.sessions = TM.data.sessions.filter(x=> !(x.classId===classId && x.date===ymd));
        TM._saveToLocal();
        document.dispatchEvent(new CustomEvent("tm:data:sessionsChanged"));
        sesModal?.hide();
      });

      sesModal?.show();
    }

    function openClassDetails(classId){
      const $cdTitle = document.getElementById("cdTitle");
      const $cdTeacherSel = document.getElementById("cdTeacherSel");
      const $cdTeacherLine = document.getElementById("cdTeacherLine");
      const $cdPrice = document.getElementById("cdPrice");
      const $cdDuration = document.getElementById("cdDuration");
      const $cdNotes = document.getElementById("cdNotes");
      const $cdRosterBody = document.getElementById("cdRosterBody");
      const $cdMonth = document.getElementById("cdMonth");
      const $cdAttendanceBody = document.getElementById("cdAttendanceBody");

      const cls = TM.classById(classId);
      if (!cls) return;
      $cdTitle && ($cdTitle.textContent = `${cls.name} • ${classId}`);

      // price/duration
      if ($cdPrice){ $cdPrice.value = Number(cls.priceVnd||0); $cdPrice.onchange = ()=>{ cls.priceVnd = Number($cdPrice.value||0); TM._saveToLocal(); document.dispatchEvent(new CustomEvent("tm:data:changed")); }; }
      if ($cdDuration){ $cdDuration.value = Number(cls.defaultDurationHrs||1); $cdDuration.onchange = ()=>{ cls.defaultDurationHrs = Number($cdDuration.value||1); TM._saveToLocal(); document.dispatchEvent(new CustomEvent("tm:data:changed")); }; }

      // teacher select
      const tOpts = [`<option value="">Unassigned</option>`]
        .concat(TM.data.teachers.map(t => `<option value="${t.id}">${t.name||t.id} — ${TM.util.fmtVnd(t.ratePerHour||0)} VND/hr</option>`));
      if ($cdTeacherSel){ $cdTeacherSel.innerHTML = tOpts.join(""); $cdTeacherSel.value = cls.teacherId || ""; }
      $cdTeacherSel && ($cdTeacherSel.onchange = ()=>{
        const t = TM.teacherById($cdTeacherSel.value);
        cls.teacherId = t?.id || null;
        cls.teacherName = t?.name || null;
        if (t && typeof t.ratePerHour === 'number') cls.teacherRatePerHour = Number(t.ratePerHour);
        TM._saveToLocal(); document.dispatchEvent(new CustomEvent("tm:data:changed")); fillTeacherLine();
      });
      function fillTeacherLine(){
        if (!$cdTeacherLine) return;
        const rate = Number(cls.teacherRatePerHour||0);
        const t = cls.teacherId ? TM.teacherById(cls.teacherId) : null;
        const tName = t?.name || cls.teacherName || "Unassigned";
        $cdTeacherLine.innerHTML = `Rate default: <strong>${TM.util.fmtVnd(rate)}</strong> VND/hr &nbsp;•&nbsp; ${tName}`;
      }
      fillTeacherLine();

      // notes
      if ($cdNotes){ $cdNotes.value = cls.notes || ""; $cdNotes.onchange = ()=>{ cls.notes = $cdNotes.value||""; TM._saveToLocal(); }; }

      // roster
      if ($cdRosterBody){
        const rosterIds = TM.rosterForClass(classId);
        const rows = rosterIds.map(sid => {
          const s = TM.studentById(sid);
          const enr = TM.data.enrollments.find(e=>e.classId===classId && e.studentId===sid);
          return `<tr>
              <td>${s?.name || sid}</td>
              <td>${s?.studentId || ""}</td>
              <td>${enr?.discountPct || 0}</td>
              <td>${enr?.enrolledAt || ""}</td>
            </tr>`;
        });
        $cdRosterBody.innerHTML = rows.join("") || `<tr><td colspan="4" class="text-muted">No students enrolled.</td></tr>`;
      }

      // attendance: show per-session status, teacher, duration and attendance counts (present/excused/absent), notes. Allow clicking row to edit session
      if ($cdMonth){
        $cdMonth.value = (new Date()).toISOString().slice(0,7);
        $cdMonth.onchange = ()=> renderCdAttendance();
      }
      function renderCdAttendance(){
        const ym = $cdMonth?.value || (new Date()).toISOString().slice(0,7);
        const sessions = TM.sessionsFor(classId, ym).sort((a,b)=> a.date.localeCompare(b.date));
        const rows = sessions.map(s => {
          const t = s.teacherId ? TM.teacherById(s.teacherId) : null;
          const tName = t?.name || s.teacherName || '—';
          // Compute attendance counts
          let present = 0, excused = 0, absent = 0;
          if (s.attendance && typeof s.attendance === 'object'){
            Object.values(s.attendance).forEach(val => {
              if (val === 'excused') excused++; else if (val === 'absent') absent++; else present++;
            });
          } else if (Array.isArray(s.present)){
            present = s.present.length;
          }
          const noteText = s.note ? s.note.split('\n')[0] : '';
          // Escape HTML in note preview
          const esc = (str) => String(str||'').replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
          return `<tr data-ds="${s.date}">
            <td>${s.date}</td>
            <td>${s.status}</td>
            <td>${tName}</td>
            <td class="text-end">${(s.durationHrs != null ? Number(s.durationHrs).toFixed(2) : '')}</td>
            <td class="text-end">${present}</td>
            <td class="text-end">${excused}</td>
            <td class="text-end">${absent}</td>
            <td>${esc(noteText)}</td>
          </tr>`;
        });
        if ($cdAttendanceBody){
          $cdAttendanceBody.innerHTML = rows.join('') || `<tr><td colspan="8" class="text-muted">No sessions in ${ym}.</td></tr>`;
          // Attach click events to open session editor
          $cdAttendanceBody.querySelectorAll('tr[data-ds]').forEach(tr => {
            tr.addEventListener('click', () => {
              const ds = tr.getAttribute('data-ds');
              TM.openSessionEditor(classId, ds);
            });
          });
        }
      }
      renderCdAttendance();

      const classModalEl = document.getElementById("classDetailModal");
      const classModal = classModalEl ? new bootstrap.Modal(classModalEl) : null;
      classModal?.show();
    }

    function openClassNotes(classId){
      const $cmTitle = document.getElementById("cmTitle");
      const $cmMonth = document.getElementById("cmMonth");
      const $cmNotesInput = document.getElementById("cmNotesInput");
      const $cmSaveNotes = document.getElementById("cmSaveNotes");
      const notesModalEl = document.getElementById("classNotesModal");
      const notesModal = notesModalEl ? new bootstrap.Modal(notesModalEl) : null;

      const cls = TM.classById(classId);
      if (!cls) return;
      const ym = (new Date()).toISOString().slice(0,7);
      $cmTitle && ($cmTitle.textContent = `${cls.name} • ${classId}`);
      if ($cmMonth){ $cmMonth.value = ym; $cmMonth.onchange = ()=>{ $cmNotesInput.value = cls.monthNotes?.[$cmMonth.value] || ""; }; }
      if ($cmNotesInput){ $cmNotesInput.value = cls.monthNotes?.[ym] || ""; }
      $cmSaveNotes?.addEventListener("click", ()=>{
        const m = $cmMonth?.value || ym;
        if (!cls.monthNotes) cls.monthNotes = {};
        cls.monthNotes[m] = $cmNotesInput.value || "";
        TM._saveToLocal();
        notesModal?.hide();
      }, { once: true });
      notesModal?.show();
    }

    // Expose details, notes and session editor functions globally so other modules (e.g. calendar hotfix) can reuse them
    // Note: assignment to TM.openClassDetails/Notes/SessionEditor moved to end of initCalendarPage to ensure the latest versions are used

    // Boot
    TM._loadFromLocal();
    renderAll();
  };

  // ---------- Admin Page (Students / Classes / Teachers CRUD) ----------
  TM.initAdminPage = function(){
    TM._loadFromLocal();

    // DOM shortcuts
    const $ = sel => document.querySelector(sel);

    // Tables / buttons / search
    const $tblStudents = $("#tblStudentsBody");
    const $tblClasses  = $("#tblClassesBody");
    const $tblTeachers = $("#tblTeachersBody");

    const $btnNewStudent = $("#btnNewStudent");
    const $btnNewClass   = $("#btnNewClass");
    const $btnNewTeacher = $("#btnNewTeacher");

    const $searchStudents = $("#searchStudents");
    const $searchClasses  = $("#searchClasses");
    const $searchTeachers = $("#searchTeachers");

    // Summary element for executive summary
    const $summary = document.getElementById('adminSummary');

    // Sort students by class flag (toggle with button)
    let sortStudentsByClass = false;

    // ------------ RENDERERS ------------
    function renderSummary(){
      if (!$summary) return;
      const totalStudents = TM.data.students.length;
      const enrolledSet = new Set(TM.data.enrollments.map(e=>e.studentId));
      const totalEnrolled = enrolledSet.size;
      const totalTeachers = TM.data.teachers.length;
      // Note value from meta
      const note = TM.data.meta && TM.data.meta.adminNotes ? TM.data.meta.adminNotes : '';
      $summary.innerHTML = `
        <div class="card">
          <div class="card-body">
            <div class="row g-3 mb-2">
              <div class="col-md-3"><strong>Total students:</strong> ${totalStudents}</div>
              <div class="col-md-3"><strong>Enrolled students:</strong> ${totalEnrolled}</div>
              <div class="col-md-3"><strong>Teachers:</strong> ${totalTeachers}</div>
            </div>
            <div class="mb-2"><label class="form-label"><strong>Admin notes</strong></label>
              <textarea id="adminNotes" class="form-control" rows="2">${note}</textarea>
            </div>
          </div>
        </div>`;
      // Bind input event to save notes
      const noteEl = document.getElementById('adminNotes');
      if (noteEl){
        noteEl.onchange = function(){
          if (!TM.data.meta) TM.data.meta = {};
          TM.data.meta.adminNotes = this.value || '';
          TM._saveToLocal();
        };
      }
    }
    function renderStudents(){
      if (!$tblStudents) return;
      const q = ($searchStudents?.value||"").toLowerCase();
      // Build filtered array first
      let items = TM.data.students.filter(s => !q || (s.name||"").toLowerCase().includes(q) || (s.studentId||"").toLowerCase().includes(q));
      // If sorting by class, sort alphabetically by first enrolled class name
      if (sortStudentsByClass){
        items = items.slice().sort((a,b)=>{
          const firstClass = (stu) => {
            const enrolls = TM.data.enrollments.filter(e=>e.studentId===stu.id);
            if (enrolls.length===0) return "zzzz";
            const names = enrolls.map(e=> TM.classById(e.classId)?.name || e.classId).sort();
            return names[0] || "zzzz";
          };
          return firstClass(a).toLowerCase().localeCompare(firstClass(b).toLowerCase());
        });
      }
      const rows = items.map(s=>{
        const classes = TM.data.enrollments
          .filter(e=>e.studentId===s.id)
          .map(e=>{
            const cls = TM.classById(e.classId);
            return `<span class="tag">${cls?.name||e.classId}${e.discountPct?` • ${e.discountPct}%`:''}</span>`;
          }).join(" ");
        return `<tr>
          <td>${s.name||"(Unnamed)"} <div class="small-muted">${s.email||""}</div></td>
          <td>${s.studentId||""}</td>
          <td>${classes||'<span class="text-muted">—</span>'}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary" data-edit-stu="${s.id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger ms-1" data-del-stu="${s.id}">Delete</button>
          </td>
        </tr>`;
      }).join("");
      $tblStudents.innerHTML = rows || `<tr><td colspan="4" class="text-muted">No students yet.</td></tr>`;
    }

    function renderClasses(){
      if (!$tblClasses) return;
      const q = ($searchClasses?.value||"").toLowerCase();
      const rows = TM.data.classes
        .filter(c => !q || (c.name||"").toLowerCase().includes(q) || (c.id||"").toLowerCase().includes(q))
        .map(c=>{
          const price   = TM.util.fmtVnd(c.priceVnd||0);
          const teacher = c.teacherName || (c.teacherId ? (TM.teacherById(c.teacherId)?.name || c.teacherId) : "—");
          return `<tr>
            <td>${c.name||"(Unnamed)"} <div class="small-muted">${c.level||""}</div></td>
            <td>${c.id}</td>
            <td>${price}</td>
            <td>${teacher}</td>
            <td class="text-end">
              <button class="btn btn-sm btn-outline-primary" data-edit-cls="${c.id}">Edit</button>
              <button class="btn btn-sm btn-outline-danger ms-1" data-del-cls="${c.id}">Delete</button>
            </td>
          </tr>`;
        }).join("");
      $tblClasses.innerHTML = rows || `<tr><td colspan="5" class="text-muted">No classes yet.</td></tr>`;
    }

    function renderTeachers(){
      if (!$tblTeachers) return;
      const q = ($searchTeachers?.value||"").toLowerCase();
      const rows = TM.data.teachers
        .filter(t => !q || (t.name||"").toLowerCase().includes(q))
        .map(t=>{
          const rate = TM.util.fmtVnd(t.ratePerHour||0);
          const classes = TM.data.classes.filter(c=>c.teacherId===t.id).map(c=>`<span class="tag">${c.name}</span>`).join(" ");
          return `<tr>
            <td>${t.name||"(Unnamed)"} <div class="small-muted">${t.email||""}</div></td>
            <td>${rate}</td>
            <td>${classes||'<span class="text-muted">—</span>'}</td>
            <td class="text-end">
              <button class="btn btn-sm btn-outline-primary" data-edit-tch="${t.id}">Edit</button>
              <button class="btn btn-sm btn-outline-danger ms-1" data-del-tch="${t.id}">Delete</button>
            </td>
          </tr>`;
        }).join("");
      $tblTeachers.innerHTML = rows || `<tr><td colspan="4" class="text-muted">No teachers yet.</td></tr>`;
    }

    function paintAll(){ renderStudents(); renderClasses(); renderTeachers(); }

    // ------------ MODAL HELPERS (use static modals in admin.html) ------------
    function openStudentModal(studentId=null){
      const s = studentId ? TM.data.students.find(x=>x.id===studentId) : null;

      // Fill assign-to-class list
      const $assign = document.getElementById("stuAssignList");
      if ($assign){
        $assign.innerHTML = TM.data.classes.map(c=>{
          const enr = s ? TM.data.enrollments.find(e=>e.studentId===s.id && e.classId===c.id) : null;
          const checked = enr ? "checked" : "";
          const disc = enr?.discountPct ?? 0;
          return `<div class="col-md-6">
            <div class="input-group input-group-sm">
              <div class="input-group-text">
                <input class="form-check-input mt-0" type="checkbox" value="${c.id}" ${checked} data-ass-cls>
              </div>
              <input class="form-control" value="${c.name}" disabled>
              <span class="input-group-text">discount%</span>
              <input class="form-control" type="number" step="1" min="0" max="100" value="${disc}" data-ass-disc="${c.id}">
            </div>
          </div>`;
        }).join("") || '<div class="text-muted">No classes yet.</div>';
      }

      // Prefill fields
      document.getElementById("studentModalTitle").textContent = s ? "Edit Student" : "New Student";
      document.getElementById("stuId").value = s?.id || "";
      document.getElementById("stuName").value = s?.name || "";
      document.getElementById("stuCode").value = s?.studentId || "";
      document.getElementById("stuStatus").value = s?.status || "active";
      document.getElementById("stuEmail").value = s?.email || "";
      document.getElementById("stuPhone").value = s?.phone || "";
      document.getElementById("stuDob").value = s?.dob || "";
      document.getElementById("stuGuardian").value = s?.guardianName || "";
      document.getElementById("stuGuardianPhone").value = s?.guardianPhone || "";
      document.getElementById("stuNote").value = s?.note || "";

      // Handle submit
      const form = document.getElementById("studentForm");
      form.onsubmit = (e)=>{
        e.preventDefault();
        const payload = {
          name: document.getElementById("stuName").value.trim(),
          studentId: document.getElementById("stuCode").value.trim(),
          status: document.getElementById("stuStatus").value,
          email: document.getElementById("stuEmail").value.trim(),
          phone: document.getElementById("stuPhone").value.trim(),
          dob: document.getElementById("stuDob").value || null,
          guardianName: document.getElementById("stuGuardian").value.trim(),
          guardianPhone: document.getElementById("stuGuardianPhone").value.trim(),
          note: document.getElementById("stuNote").value.trim()
        };
        const existingId = document.getElementById("stuId").value;
        const row = existingId ? TM.crud.updateStudent(existingId, payload) : TM.crud.addStudent(payload);
        const studentIdSaved = row.id;

        // collect assignments
        const selected = {};
        document.querySelectorAll("[data-ass-cls]").forEach(chk=>{
          if (chk.checked){
            const cid = chk.value;
            const disc = Number(document.querySelector(`[data-ass-disc="${cid}"]`)?.value||0);
            selected[cid] = disc;
          }
        });
        TM.setStudentClasses(studentIdSaved, selected);

        TM._saveToLocal();
        document.dispatchEvent(new CustomEvent("tm:data:changed"));
        paintAll();
        bootstrap.Modal.getInstance(document.getElementById("studentModal"))?.hide();
      };

      new bootstrap.Modal(document.getElementById("studentModal")).show();
    }

    function openClassModal(classId=null){
      const c = classId ? TM.classById(classId) : null;

      // Teacher options
      const $selT = document.getElementById("clsTeacher");
      if ($selT){
        const teacherOptions = ['<option value="">Unassigned</option>']
          .concat(TM.data.teachers.map(t => `<option value="${t.id}">${t.name||t.id} — ${TM.util.fmtVnd(t.ratePerHour||0)} VND/hr</option>`))
          .join("");
        $selT.innerHTML = teacherOptions;
        $selT.value = c?.teacherId || "";
      }

      // Student assign list
      const $assign = document.getElementById("clsAssignList");
      if ($assign){
        $assign.innerHTML = TM.data.students.map(s=>{
          const enr = c ? TM.data.enrollments.find(e=>e.classId===c.id && e.studentId===s.id) : null;
          const checked = enr ? "checked" : "";
          const disc = enr?.discountPct ?? 0;
          return `<div class="col-md-6">
            <div class="input-group input-group-sm">
              <div class="input-group-text">
                <input class="form-check-input mt-0" type="checkbox" value="${s.id}" ${checked} data-ass-stu>
              </div>
              <input class="form-control" value="${s.name||'(Unnamed)'}" disabled>
              <span class="input-group-text">discount%</span>
              <input class="form-control" type="number" step="1" min="0" max="100" value="${disc}" data-ass-disc="${s.id}">
            </div>
          </div>`;
        }).join("") || '<div class="text-muted">No students yet.</div>';
      }

      // Prefill fields
      document.getElementById("classModalTitle").textContent = c ? `Edit Class • ${c.id}` : "New Class";
      document.getElementById("clsId").value = c?.id || "";
      document.getElementById("clsName").value = c?.name || "";
      document.getElementById("clsPrice").value = c?.priceVnd ?? 0;
      document.getElementById("clsDuration").value = c?.defaultDurationHrs ?? 1;
      document.getElementById("clsCapacity").value = c?.capacity ?? "";
      document.getElementById("clsLevel").value = c?.level || "";
      document.getElementById("clsNote").value = c?.notes || "";

      // Submit
      const form = document.getElementById("classForm");
      form.onsubmit = (e)=>{
        e.preventDefault();
        const payload = {
          name: document.getElementById("clsName").value.trim(),
          priceVnd: Number(document.getElementById("clsPrice").value||0),
          defaultDurationHrs: Number(document.getElementById("clsDuration").value||1),
          capacity: document.getElementById("clsCapacity").value ? Number(document.getElementById("clsCapacity").value) : null,
          level: document.getElementById("clsLevel").value.trim(),
          notes: document.getElementById("clsNote").value.trim()
        };
        const existingId = document.getElementById("clsId").value;
        let cls = existingId ? TM.crud.updateClass(existingId, payload) : TM.crud.addClass(payload);

        // Primary teacher
        const tId = document.getElementById("clsTeacher").value || null;
        TM.setClassTeacher(cls.id, tId);

        // Student assignments for this class
        const selected = new Set();
        document.querySelectorAll("[data-ass-stu]").forEach(chk=>{
          if (chk.checked) selected.add(chk.value);
        });

        // Remove unenrolled for this class
        TM.data.enrollments = TM.data.enrollments.filter(e=> !(e.classId===cls.id && !selected.has(e.studentId)));

        // Ensure selected students are enrolled with given discounts
        selected.forEach(sid=>{
          const disc = Number(document.querySelector(`[data-ass-disc="${sid}"]`)?.value||0);
          TM.enroll(sid, cls.id, { discountPct: disc });
        });

        TM._saveToLocal();
        document.dispatchEvent(new CustomEvent("tm:data:changed"));
        paintAll();
        bootstrap.Modal.getInstance(document.getElementById("classModal"))?.hide();
      };

      new bootstrap.Modal(document.getElementById("classModal")).show();
    }

    function openTeacherModal(teacherId=null){
      const t = teacherId ? TM.teacherById(teacherId) : null;

      // Class assign list
      const $assign = document.getElementById("tchAssignList");
      if ($assign){
        $assign.innerHTML = TM.data.classes.map(c=>{
          const checked = (t && c.teacherId===t.id) ? "checked" : "";
          return `<div class="col-md-6">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" value="${c.id}" ${checked} data-ass-teach>
              <label class="form-check-label">${c.name}</label>
            </div>
          </div>`;
        }).join("") || '<div class="text-muted">No classes yet.</div>';
      }

      // Prefill
      document.getElementById("teacherModalTitle").textContent = t ? "Edit Teacher" : "New Teacher";
      document.getElementById("tchId").value = t?.id || "";
      document.getElementById("tchName").value = t?.name || "";
      document.getElementById("tchRate").value = t?.ratePerHour ?? 0;
      document.getElementById("tchSubjects").value = t?.subjects || "";
      document.getElementById("tchEmail").value = t?.email || "";
      document.getElementById("tchPhone").value = t?.phone || "";
      document.getElementById("tchNote").value = t?.note || "";

      // Submit
      const form = document.getElementById("teacherForm");
      form.onsubmit = (e)=>{
        e.preventDefault();
        const payload = {
          name: document.getElementById("tchName").value.trim(),
          ratePerHour: Number(document.getElementById("tchRate").value||0),
          subjects: document.getElementById("tchSubjects").value.trim(),
          email: document.getElementById("tchEmail").value.trim(),
          phone: document.getElementById("tchPhone").value.trim(),
          note: document.getElementById("tchNote").value.trim()
        };
        const existingId = document.getElementById("tchId").value;
        const tch = existingId ? TM.crud.updateTeacher(existingId, payload) : TM.crud.addTeacher(payload);

        // Assign/unassign as primary for classes
        const selected = new Set();
        document.querySelectorAll("[data-ass-teach]").forEach(chk=>{
          if (chk.checked) selected.add(chk.value);
        });
        TM.data.classes.forEach(c=>{
          if (selected.has(c.id)) TM.setClassTeacher(c.id, tch.id);
          else if (c.teacherId === tch.id) TM.setClassTeacher(c.id, null);
        });

        TM._saveToLocal();
        document.dispatchEvent(new CustomEvent("tm:data:changed"));
        paintAll();
        bootstrap.Modal.getInstance(document.getElementById("teacherModal"))?.hide();
      };

      new bootstrap.Modal(document.getElementById("teacherModal")).show();
    }

    // ------------ EVENTS ------------
    // New buttons
    $btnNewStudent?.addEventListener("click", ()=> openStudentModal(null));
    $btnNewClass?.addEventListener("click", ()=> openClassModal(null));
    $btnNewTeacher?.addEventListener("click", ()=> openTeacherModal(null));

    // Sort students by class toggle
    const $btnSortStudents = document.getElementById("btnSortStudents");
    if ($btnSortStudents){
      $btnSortStudents.addEventListener("click", function(){
        sortStudentsByClass = !sortStudentsByClass;
        // Update button text to reflect current state
        this.classList.toggle('active', sortStudentsByClass);
        this.textContent = sortStudentsByClass ? 'Sort by name' : 'Sort by class';
        renderStudents();
      });
    }

    // Delegated table actions
    $tblStudents?.addEventListener("click", (e)=>{
      const del = e.target.closest("[data-del-stu]");
      const edt = e.target.closest("[data-edit-stu]");
      if (del){
        const id = del.getAttribute("data-del-stu");
        if (confirm("Delete this student? This also removes their enrollments.")){
          TM.crud.deleteStudent(id); TM._saveToLocal();
          document.dispatchEvent(new CustomEvent("tm:data:changed"));
          paintAll();
        }
      }
      if (edt){
        const id = edt.getAttribute("data-edit-stu");
        openStudentModal(id);
      }
    });

    $tblClasses?.addEventListener("click", (e)=>{
      const del = e.target.closest("[data-del-cls]");
      const edt = e.target.closest("[data-edit-cls]");
      if (del){
        const id = del.getAttribute("data-del-cls");
        if (confirm("Delete this class? This also removes its enrollments and sessions.")){
          TM.crud.deleteClass(id); TM._saveToLocal();
          document.dispatchEvent(new CustomEvent("tm:data:changed"));
          paintAll();
        }
      }
      if (edt){
        const id = edt.getAttribute("data-edit-cls");
        openClassModal(id);
      }
    });

    $tblTeachers?.addEventListener("click", (e)=>{
      const del = e.target.closest("[data-del-tch]");
      const edt = e.target.closest("[data-edit-tch]");
      if (del){
        const id = del.getAttribute("data-del-tch");
        if (confirm("Delete this teacher? This will unassign them from classes and sessions.")){
          TM.crud.deleteTeacher(id); TM._saveToLocal();
          document.dispatchEvent(new CustomEvent("tm:data:changed"));
          paintAll();
        }
      }
      if (edt){
        const id = edt.getAttribute("data-edit-tch");
        openTeacherModal(id);
      }
    });

    // Search inputs
    $searchStudents?.addEventListener("input", renderStudents);
    $searchClasses?.addEventListener("input", renderClasses);
    $searchTeachers?.addEventListener("input", renderTeachers);

    // Global repaint triggers
    document.addEventListener("tm:data:changed", paintAll);

    // Boot paint
    paintAll();

    // Also render the summary when data changes
    renderSummary();
    document.addEventListener("tm:data:changed", renderSummary);
  };

  // ---------- (Optional) no-op stubs so other pages don’t error if not implemented here ----------
  // Enrollment manager: list students, search, and edit their class enrollments. Allows adding/removing enrollments and editing discounts/notes.
  TM.initEnrollmentPage = function(){
    TM._loadFromLocal();
    const searchEl    = document.getElementById('studentSearch');
    const listEl      = document.getElementById('studentList');
    const titleEl     = document.getElementById('selStudentTitle');
    const enrollBody  = document.getElementById('enrollRows');
    const btnAddRow   = document.getElementById('btnAddEnrollRow');
    const btnAddStudent= document.getElementById('btnAddStudent');
    let selectedId    = null;
    function renderList(){
      if (!listEl) return;
      const q = (searchEl?.value || '').toLowerCase();
      const items = TM.data.students.filter(s => {
        const name = (s.name || '').toLowerCase();
        const sid  = (s.studentId || '').toLowerCase();
        return !q || name.includes(q) || sid.includes(q);
      });
      listEl.innerHTML = items.map(s => {
        const active = (s.id === selectedId) ? ' active' : '';
        const label = s.name || s.studentId || s.id;
        return `<a href="#" class="list-group-item list-group-item-action${active}" data-sid="${s.id}">${label}</a>`;
      }).join('') || '<div class="text-muted">No students.</div>';
    }
    function renderEnrollments(){
      if (!enrollBody) return;
      if (!selectedId){
        titleEl && (titleEl.textContent = 'Select a student');
        enrollBody.innerHTML = '<tr><td colspan="5" class="text-muted">Select a student from the list.</td></tr>';
        return;
      }
      const stu = TM.studentById ? TM.studentById(selectedId) : TM.data.students.find(s => s.id === selectedId);
      titleEl && (titleEl.textContent = stu?.name || '(Unnamed)');
      const enrolls = TM.data.enrollments.filter(e => e.studentId === selectedId);
      enrollBody.innerHTML = enrolls.map((en, idx) => {
        const options = TM.data.classes.map(c => `<option value="${c.id}"${c.id===en.classId ? ' selected' : ''}>${c.name || c.id}</option>`).join('');
        return `<tr data-idx="${idx}">
          <td><select class="form-select form-select-sm" data-field="classId">${options}</select></td>
          <td><input type="number" min="0" max="100" class="form-control form-control-sm" data-field="discountPct" value="${en.discountPct||0}"></td>
          <td><input type="date" class="form-control form-control-sm" data-field="enrolledAt" value="${en.enrolledAt||''}"></td>
          <td><input type="text" class="form-control form-control-sm" data-field="notes" value="${en.notes||''}"></td>
          <td><button type="button" class="btn btn-sm btn-outline-danger" data-action="del">&times;</button></td>
        </tr>`;
      }).join('') || '<tr><td colspan="5" class="text-muted">No classes.</td></tr>';
      // Bind change handlers
      enrollBody.querySelectorAll('tr').forEach(tr => {
        const idx = Number(tr.getAttribute('data-idx'));
        const allEnrolls = TM.data.enrollments.filter(e => e.studentId === selectedId);
        const en = allEnrolls[idx];
        tr.querySelectorAll('[data-field]').forEach(input => {
          input.onchange = function(){
            const field = this.getAttribute('data-field');
            let val = this.value;
            if (!en) return;
            if (field === 'classId') en.classId = val;
            else if (field === 'discountPct') en.discountPct = Number(val)||0;
            else if (field === 'enrolledAt') en.enrolledAt = val;
            else if (field === 'notes') en.notes = val;
            TM._saveToLocal();
          };
        });
        const delBtn = tr.querySelector('[data-action="del"]');
        if (delBtn) delBtn.onclick = function(){
          const globalIndex = TM.data.enrollments.indexOf(en);
          if (globalIndex >= 0) TM.data.enrollments.splice(globalIndex, 1);
          TM._saveToLocal();
          renderEnrollments();
        };
      });
    }
    // List click
    listEl && (listEl.onclick = function(e){
      const item = e.target.closest('[data-sid]');
      if (item){
        e.preventDefault();
        selectedId = item.getAttribute('data-sid');
        // Remember selection globally for Open profile buttons
        TM._selStudentId = selectedId;
        renderList();
        renderEnrollments();
      }
    });
    // Search
    searchEl && (searchEl.oninput = renderList);
    // Add new enrollment row
    btnAddRow && (btnAddRow.onclick = function(){
      if (!selectedId) return;
      const defaultClassId = TM.data.classes[0]?.id || '';
      TM.data.enrollments.push({
        id: TM.id.enroll(),
        studentId: selectedId,
        classId: defaultClassId,
        discountPct: 0,
        enrolledAt: new Date().toISOString().slice(0,10),
        notes: ''
      });
      TM._saveToLocal();
      renderEnrollments();
    });
    // Add student
    btnAddStudent && (btnAddStudent.onclick = function(){
      const name = prompt('New student name?');
      if (!name) return;
      const s = TM.crud.addStudent({ name: name.trim() });
      TM._saveToLocal();
      selectedId = s.id;
      renderList();
      renderEnrollments();
    });
    renderList();
    renderEnrollments();
  };
  // Student profile page initializer: populate student details, attendance and invoice tabs
  TM.initStudentPage    = function(){
    TM._loadFromLocal();
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('id');
    const notFoundEl = document.getElementById('studentNotFound');
    if (!sid){ if (notFoundEl) notFoundEl.classList.remove('d-none'); return; }
    const stu = TM.studentById ? TM.studentById(sid) : (TM.data.students.find(s=>s.id===sid));
    if (!stu){ if (notFoundEl) notFoundEl.classList.remove('d-none'); return; }
    // Header
    document.getElementById('studentNameTitle').textContent = stu.name || '(Unnamed)';
    // Photo (if stored in student.photoDataUrl)
    const photoEl = document.getElementById('studentPhoto');
    if (photoEl){ photoEl.src = stu.photoDataUrl || ''; }
    // Bind file upload
    const photoInput = document.getElementById('photoInput');
    if (photoInput){
      photoInput.onchange = function(e){ const f = e.target.files[0]; if (!f) return; const reader = new FileReader(); reader.onload = function(evt){ stu.photoDataUrl = evt.target.result; photoEl.src = stu.photoDataUrl; TM._saveToLocal(); }; reader.readAsDataURL(f); };
    }
    // Overview fields binding helper
    function bindInput(id, key){ const el = document.getElementById(id); if (!el) return; el.value = stu[key] || ''; el.onchange = () => { stu[key] = el.value || ''; TM._saveToLocal(); }; }
    bindInput('fldStudentName','name');
    bindInput('fldStudentID','studentId');
    bindInput('fldDOB','dob');
    bindInput('fldContact','phone');
    bindInput('fldAddress','address');
    bindInput('g0Name','guardian1Name');
    bindInput('g0Rel','guardian1Rel');
    bindInput('g0Phone','guardian1Phone');
    bindInput('g0Email','guardian1Email');
    bindInput('g1Name','guardian2Name');
    bindInput('g1Rel','guardian2Rel');
    bindInput('g1Phone','guardian2Phone');
    bindInput('g1Email','guardian2Email');
    bindInput('emgName','emergencyName');
    bindInput('emgPhone','emergencyPhone');
    bindInput('fldNotes','note');
    // Enrollment tab: render enrollments list with editable fields
    function renderEnrollments(){
      const body = document.getElementById('studentEnrollBody');
      if (!body) return;
      const enrolls = TM.data.enrollments.filter(e => e.studentId === sid);
      if (!enrolls.length){
        body.innerHTML = '<tr><td colspan="5" class="text-muted">No enrollments.</td></tr>';
        return;
      }
      body.innerHTML = enrolls.map((e, idx) => {
        // Build class options dropdown
        const clsOpts = TM.data.classes.map(c => `<option value="${c.id}"${c.id===e.classId?' selected':''}>${c.name}</option>`).join('');
        return `<tr>
          <td><select class="form-select form-select-sm selEnrollClass" data-idx="${idx}">${clsOpts}</select></td>
          <td><input type="number" min="0" max="100" class="form-control form-control-sm fldEnrollDiscount" data-idx="${idx}" value="${e.discountPct||0}"></td>
          <td><input type="date" class="form-control form-control-sm fldEnrollDate" data-idx="${idx}" value="${e.enrolledAt||''}"></td>
          <td><input type="text" class="form-control form-control-sm fldEnrollNotes" data-idx="${idx}" value="${e.notes||''}"></td>
          <td class="text-end"><button class="btn btn-sm btn-link text-danger btnDelEnroll" data-idx="${idx}" title="Remove">&times;</button></td>
        </tr>`;
      }).join('');
      // Attach change handlers
      body.querySelectorAll('.selEnrollClass').forEach(sel => {
        sel.onchange = function(){ const i = Number(this.getAttribute('data-idx')); const e = enrolls[i]; if (e){ e.classId = this.value; TM._saveToLocal(); renderEnrollments(); } };
      });
      body.querySelectorAll('.fldEnrollDiscount').forEach(inp => {
        inp.onchange = function(){ const i = Number(this.getAttribute('data-idx')); const e = enrolls[i]; if (e){ e.discountPct = Number(this.value||0); TM._saveToLocal(); } };
      });
      body.querySelectorAll('.fldEnrollDate').forEach(inp => {
        inp.onchange = function(){ const i = Number(this.getAttribute('data-idx')); const e = enrolls[i]; if (e){ e.enrolledAt = this.value || ''; TM._saveToLocal(); } };
      });
      body.querySelectorAll('.fldEnrollNotes').forEach(inp => {
        inp.onchange = function(){ const i = Number(this.getAttribute('data-idx')); const e = enrolls[i]; if (e){ e.notes = this.value || ''; TM._saveToLocal(); } };
      });
      body.querySelectorAll('.btnDelEnroll').forEach(btn => {
        btn.onclick = function(){ const i = Number(this.getAttribute('data-idx')); const e = enrolls[i]; if (e){ const idxGlob = TM.data.enrollments.indexOf(e); if (idxGlob>=0){ TM.data.enrollments.splice(idxGlob,1); TM._saveToLocal(); renderEnrollments(); renderAttendance(); renderInvoice(); } } };
      });
    }
    renderEnrollments();
    // Add enrollment button
    const btnAddEnroll = document.getElementById('btnAddEnroll');
    if (btnAddEnroll){
      btnAddEnroll.onclick = function(){
        const defClass = TM.data.classes[0];
        if (!defClass){ alert('No classes available.'); return; }
        const newEnroll = {
          studentId: sid,
          classId: defClass.id,
          discountPct: 0,
          enrolledAt: new Date().toISOString().slice(0,10),
          notes: ''
        };
        TM.data.enrollments.push(newEnroll);
        TM._saveToLocal();
        renderEnrollments();
        renderAttendance();
        renderInvoice();
      };
    }
    // Attendance tab
    const attMonth = document.getElementById('attMonth');
    const attHolder = document.getElementById('attendanceHolder');
    const nowYm = new Date().toISOString().slice(0,7);
    if (attMonth) attMonth.value = nowYm;
    function renderAttendance(){
      if (!attHolder || !attMonth) return;
      const ym = attMonth.value || nowYm;
      const rows = [];
      // Loop through classes student is enrolled in
      const enrolls = TM.data.enrollments.filter(e => e.studentId === sid);
      enrolls.forEach(e => {
        const cls = TM.classById(e.classId);
        const sessions = TM.sessionsFor(e.classId, ym).filter(s => s.status === 'held');
        sessions.forEach(s => {
          let st = s.attendance && s.attendance[sid];
          if (!st && Array.isArray(s.present)) st = s.present.includes(sid) ? 'Present' : 'Present';
          if (!st) st = 'Present';
          const label = st.charAt(0).toUpperCase() + st.slice(1);
          const price = (st !== 'excused' ? (Number(cls.priceVnd||0)*(1-Number(e.discountPct||0)/100)) : 0);
          rows.push(`<tr><td>${s.date}</td><td>${cls?.name||e.classId}</td><td>${label}</td><td class="text-end">${price?TM.util.fmtVnd(price):'—'}</td></tr>`);
        });
      });
      attHolder.innerHTML = `<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Date</th><th>Class</th><th>Status</th><th class="text-end">Charge (VND)</th></tr></thead><tbody>${rows.join('')||'<tr><td colspan="4" class="text-muted">No attendance records.</td></tr>'}</tbody></table></div>`;
    }
    attMonth && (attMonth.onchange = renderAttendance);
    renderAttendance();
    // Invoice tab
    const invMonth = document.getElementById('invMonth');
    const invPrev = document.getElementById('invoicePreview');
    if (invMonth) invMonth.value = nowYm;
    function renderInvoice(){
      if (!invMonth || !invPrev) return;
      const ym = invMonth.value || nowYm;
      const invoice = TM.invoiceForStudent(sid, ym);
      const items = invoice.items.map(it => `<tr><td>${it.className}</td><td class="text-end">${TM.util.fmtVnd(it.amount)}</td></tr>`).join('') || '<tr><td colspan="2" class="text-muted">No charges.</td></tr>';
      invPrev.innerHTML = `<div class="table-responsive"><table class="table table-sm invoice-table"><thead><tr><th>Class</th><th class="text-end">Amount (VND)</th></tr></thead><tbody>${items}</tbody><tfoot><tr><th>Total</th><th class="text-end">${TM.util.fmtVnd(invoice.total)}</th></tr></tfoot></table></div>`;
    }
    invMonth && (invMonth.onchange = renderInvoice);
    renderInvoice();

    // Export buttons
    const btnCSVInvoice = document.getElementById('btnCSVInvoice');
    const btnPrintInvoice = document.getElementById('btnPrintInvoice');
    if (btnCSVInvoice) btnCSVInvoice.onclick = function(){
      const ym = invMonth.value || nowYm;
      const invoice = TM.invoiceForStudent(sid, ym);
      const lines = [];
      invoice.items.forEach(it => {
        lines.push(`${it.className},${it.amount}`);
      });
      lines.push(`Total,${invoice.total}`);
      const csv = lines.join('\n');
      const blob = new Blob([csv], {type:'text/csv'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `invoice_${sid}_${ym}.csv`; a.click(); URL.revokeObjectURL(url);
    };
    if (btnPrintInvoice) btnPrintInvoice.onclick = function(){
      // Open a new window with invoice content for printing
      const win = window.open('', '', 'width=800,height=600');
      const doc = win.document;
      doc.write('<html><head><title>Invoice</title>');
      doc.write('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">');
      doc.write('<style>body{margin:20px;} .table{width:100%;font-size:12px;} th,td{padding:4px;} </style>');
      doc.write('</head><body>');
      doc.write(`<h5>Invoice for ${stu.name || sid}</h5>`);
      doc.write(`<p>Month: ${ym}</p>`);
      doc.write(document.getElementById('invoicePreview').innerHTML);
      doc.write('</body></html>');
      doc.close();
      win.focus();
      win.print();
      win.close();
    };
  };

  // Teacher payroll page initializer: show teacher's sessions, hours and pay for selected month
  TM.initPayrollPage    = function(){
    TM._loadFromLocal();
    const monthInput = document.getElementById('payMonth');
    const teacherSelect = document.getElementById('payTeacher');
    const app = document.getElementById('payrollApp');
    if (!monthInput || !teacherSelect || !app) return;
    const nowYm = new Date().toISOString().slice(0,7);
    monthInput.value = monthInput.value || nowYm;
    // Populate teacher dropdown
    teacherSelect.innerHTML = '<option value="">All teachers</option>' + TM.data.teachers.map(t => `<option value="${t.id}">${t.name||t.id}</option>`).join('');
    function render(){
      const ym = monthInput.value || nowYm;
      const filterTid = teacherSelect.value;
      const teachers = TM.data.teachers.filter(t => !filterTid || t.id === filterTid);
      if (!teachers.length){ app.innerHTML = '<div class="alert alert-warning">No teachers found.</div>'; return; }
      const parts = [];
      teachers.forEach(t => {
        const sessions = TM.data.sessions.filter(s => s.status === 'held' && s.date && s.date.slice(0,7) === ym && s.teacherId === t.id);
        let totalHours = 0;
        let totalPay = 0;
        const rows = sessions.map(s => {
          const cls = TM.classById(s.classId);
          const rate = (s.teacherRatePerHourSnap != null ? s.teacherRatePerHourSnap : (t.ratePerHour || cls?.teacherRatePerHour || 0));
            // Compute hours: use session duration if present; otherwise fallback to class default.
            // If the session duration is smaller than the class default, use the default to avoid underpaying.
            const baseHrs = Number(cls?.defaultDurationHrs || 1);
            const rawHrs  = (s.durationHrs != null ? Number(s.durationHrs) : baseHrs);
            const hrs     = (rawHrs < baseHrs ? baseHrs : rawHrs);
            const pay     = rate * hrs;
            totalHours   += hrs;
            totalPay     += pay;
            return `<tr><td>${s.date}</td><td>${cls?.name || s.classId}</td><td class="text-end">${hrs.toFixed(2)}</td><td class="text-end">${TM.util.fmtVnd(rate)}</td><td class="text-end">${TM.util.fmtVnd(pay)}</td></tr>`;
        });
        // Create a collapsible section for each teacher
        const header = `<strong>${t.name || t.id}</strong> — <span class="text-muted">${t.email||''}</span>`;
        const body = `<table class="table table-sm mb-0"><thead><tr><th>Date</th><th>Class</th><th class="text-end">Hours</th><th class="text-end">Rate (VND/hr)</th><th class="text-end">Pay (VND)</th></tr></thead><tbody>${rows.join('')||'<tr><td colspan="5" class="text-muted">No sessions.</td></tr>'}</tbody><tfoot><tr><th colspan="2">Total</th><th class="text-end">${totalHours.toFixed(2)}</th><th></th><th class="text-end">${TM.util.fmtVnd(totalPay)}</th></tr></tfoot></table>`;
        const card = `<div class="card mb-3"><div class="card-header d-flex justify-content-between align-items-center" style="cursor:pointer" data-teach="${t.id}">${header}<span class="ms-auto icon">&#9662;</span></div><div class="card-body" id="paybody-${t.id}" style="display:none">${body}</div></div>`;
        parts.push(card);
      });
      app.innerHTML = parts.join('');
      // Attach toggle handlers
      app.querySelectorAll('[data-teach]').forEach(el => {
        el.addEventListener('click', function(){
          const tid = this.getAttribute('data-teach');
          const bodyEl = document.getElementById('paybody-'+tid);
          if (bodyEl){
            bodyEl.style.display = (bodyEl.style.display === 'none' || bodyEl.style.display === '') ? 'block' : 'none';
            // Toggle arrow direction in the icon span
            const icon = this.querySelector('.icon');
            if (icon){
              icon.innerHTML = (icon.innerHTML === '&#9662;' ? '&#9652;' : '&#9662;');
            }
          }
        });
      });
      // Update export CSV button label when data is rendered (no need to modify label)
    }
    monthInput.onchange = render;
    teacherSelect.onchange = render;
    render();

    // Export payroll data to CSV for all listed teachers in current selection
    const btnExp = document.getElementById('btnExportPayroll');
    if (btnExp){
      btnExp.onclick = function(){
        const ym = monthInput.value || new Date().toISOString().slice(0,7);
        const filterTid = teacherSelect.value;
        // Build CSV header
        let csv = 'Teacher,Date,Class,Hours,Rate (VND/hr),Pay (VND)\n';
        // Collect sessions by teacher
        const teachers = TM.data.teachers.filter(t => !filterTid || t.id === filterTid);
        teachers.forEach(t => {
          const sessions = TM.data.sessions.filter(s => s.status === 'held' && s.date && s.date.slice(0,7) === ym && s.teacherId === t.id);
          sessions.forEach(s => {
            const cls = TM.classById(s.classId);
            const rate = (s.teacherRatePerHourSnap != null ? s.teacherRatePerHourSnap : (t.ratePerHour || cls?.teacherRatePerHour || 0));
            const baseHrs = Number(cls?.defaultDurationHrs || 1);
            const rawHrs  = (s.durationHrs != null ? Number(s.durationHrs) : baseHrs);
            const hrs     = (rawHrs < baseHrs ? baseHrs : rawHrs);
            const pay     = rate * hrs;
            csv += `${t.name || t.id},${s.date},${cls?.name || s.classId},${hrs.toFixed(2)},${rate},${pay}\n`;
          });
          // Add subtotal line per teacher
          const totalHrs = sessions.reduce((sum, s) => {
            const cls = TM.classById(s.classId);
            const baseHrs = Number(cls?.defaultDurationHrs || 1);
            const rawHrs  = (s.durationHrs != null ? Number(s.durationHrs) : baseHrs);
            const hrs     = (rawHrs < baseHrs ? baseHrs : rawHrs);
            return sum + hrs;
          }, 0);
          const totalPay = sessions.reduce((sum, s) => {
            const cls = TM.classById(s.classId);
            const rate = (s.teacherRatePerHourSnap != null ? s.teacherRatePerHourSnap : (t.ratePerHour || cls?.teacherRatePerHour || 0));
            const baseHrs = Number(cls?.defaultDurationHrs || 1);
            const rawHrs  = (s.durationHrs != null ? Number(s.durationHrs) : baseHrs);
            const hrs     = (rawHrs < baseHrs ? baseHrs : rawHrs);
            return sum + rate * hrs;
          }, 0);
          csv += `${t.name || t.id},Total,,${totalHrs.toFixed(2)},,${totalPay}\n`;
        });
        // Download the CSV
        const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `payroll_${ym}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      };
    }
  };

  // Finance dashboard initializer: show income, costs, and profit with extra expenses
  TM.initFinancePage = function(){
    TM._loadFromLocal();
    const monthInput = document.getElementById('finMonth');
    const app = document.getElementById('financeApp');
    const expenseForm = document.getElementById('expenseForm');
    const expenseList = document.getElementById('expenseList');
    const nowYm = new Date().toISOString().slice(0,7);
    if (monthInput) monthInput.value = monthInput.value || nowYm;
    function render(){
      const ym = monthInput.value || nowYm;
      if (!app) return;
      // Compute per class revenue, cost and net
      const classes = TM.data.classes;
      let totalRevenue = 0;
      let totalCost = 0;
      let parts = [];
      classes.forEach(cls => {
        const rev = TM.revenueForDetailed(cls, ym);
        const cost = TM.costFor(cls, ym);
        const net = rev - cost;
        totalRevenue += rev;
        totalCost += cost;
        parts.push(`<tr><td>${cls.name}</td><td class="text-end">${TM.util.fmtVnd(rev)}</td><td class="text-end">${TM.util.fmtVnd(cost)}</td><td class="text-end">${TM.util.fmtVnd(net)}</td><td class="text-end">${rev?((net/rev*100).toFixed(1)+'%'):'—'}</td></tr>`);
      });
      // Extra expenses
      const extra = (TM.data.meta?.extraExpenses && TM.data.meta.extraExpenses[ym]) || [];
      const extraTotal = extra.reduce((sum,it) => sum + Number(it.amount||0), 0);
      const netTotal = totalRevenue - totalCost - extraTotal;
      const summary = `<table class="table table-sm"><thead><tr><th>Class</th><th class="text-end">Revenue</th><th class="text-end">Teacher Cost</th><th class="text-end">Net</th><th class="text-end">Profit %</th></tr></thead><tbody>${parts.join('')||'<tr><td colspan="5" class="text-muted">No classes.</td></tr>'}</tbody><tfoot><tr><th>Total</th><th class="text-end">${TM.util.fmtVnd(totalRevenue)}</th><th class="text-end">${TM.util.fmtVnd(totalCost)}</th><th class="text-end">${TM.util.fmtVnd(totalRevenue-totalCost)}</th><th></th></tr><tr><th>Extra expenses</th><th colspan="3"></th><th class="text-end">-${TM.util.fmtVnd(extraTotal)}</th></tr><tr><th>Net profit</th><th colspan="3"></th><th class="text-end">${TM.util.fmtVnd(netTotal)}</th></tr></tfoot></table>`;
      app.innerHTML = summary;
      // Render expense list
      if (expenseList){
        expenseList.innerHTML = extra.map((it,idx) => `<li class="list-group-item d-flex justify-content-between align-items-center"><span>${it.name}</span><span>${TM.util.fmtVnd(it.amount)}</span></li>`).join('') || '<li class="list-group-item text-muted">No extra expenses.</li>';
      }
    }
    // Handle adding expense
    if (expenseForm){
      expenseForm.onsubmit = function(e){ e.preventDefault(); const name = this.elements['expName'].value.trim(); const amt = Number(this.elements['expAmount'].value||0); const ym = monthInput.value || nowYm; if (!TM.data.meta.extraExpenses) TM.data.meta.extraExpenses = {}; if (!TM.data.meta.extraExpenses[ym]) TM.data.meta.extraExpenses[ym] = []; TM.data.meta.extraExpenses[ym].push({ name, amount: amt }); TM._saveToLocal(); this.reset(); render(); };
    }
    monthInput && (monthInput.onchange = render);
    render();
  };

  // Tuition page initializer: show monthly tuition for a selected student.
  // This page allows picking a student and month to generate an invoice based on attendance.
  // It uses TM.invoiceForStudent to compute charges only for sessions where the student
  // attended (present or absent/unexcused) and applies any enrollment discount. Excused
  // absences are not billed. The invoice is displayed in a simple table with class names
  // and amounts and a total.
  TM.initTuitionPage = function(){
    TM._loadFromLocal();
    const studentSelect = document.getElementById('tuitionStudent');
    const monthInput    = document.getElementById('tuitionMonth');
    const app           = document.getElementById('tuitionApp');
    if (!studentSelect || !monthInput || !app) return;
    // Populate students dropdown
    studentSelect.innerHTML = TM.data.students.map(s => `<option value="${s.id}">${s.name || s.id}</option>`).join('');
    // Set default month and student
    const nowYm = new Date().toISOString().slice(0,7);
    monthInput.value    = monthInput.value || nowYm;
    studentSelect.value = studentSelect.value || (TM.data.students[0]?.id || '');
    function render(){
      const sid = studentSelect.value;
      const ym  = monthInput.value || nowYm;
      if (!sid){ app.innerHTML = '<div class="alert alert-warning">No students available.</div>'; return; }
      const stu = TM.studentById ? TM.studentById(sid) : (TM.data.students.find(s=>s.id===sid));
      const invoice = TM.invoiceForStudent(sid, ym);
      // Build rows HTML via concatenation to avoid template interpolation issues
      let rowsHtml = '';
      if (invoice.items && invoice.items.length){
        invoice.items.forEach(function(it){
          rowsHtml += '<tr><td>' + (it.className || it.classId) + '</td><td class="text-end">' + TM.util.fmtVnd(it.amount) + '</td></tr>';
        });
      } else {
        rowsHtml = '<tr><td colspan="2" class="text-muted">No charges.</td></tr>';
      }
      const studentName = stu && stu.name ? stu.name : sid;
      const totalFmt = TM.util.fmtVnd(invoice.total);
      app.innerHTML = '<div class="card">' +
        '<div class="card-body">' +
        '<h6>' + studentName + ' — ' + ym + '</h6>' +
        '<div class="table-responsive">' +
        '<table class="table table-sm">' +
        '<thead><tr><th>Class</th><th class="text-end">Amount (VND)</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
        '<tfoot><tr><th>Total</th><th class="text-end">' + totalFmt + '</th></tr></tfoot>' +
        '</table>' +
        '</div>' +
        '</div>' +
        '</div>';
    }
    studentSelect.onchange = render;
    monthInput.onchange    = render;
    // Attach handlers for CSV export and print/PDF
    const btnCSV = document.getElementById('btnCSVTuition');
    const btnPrint = document.getElementById('btnPrintTuition');
    if (btnCSV) btnCSV.onclick = function(){
      const sid = studentSelect.value;
      const ym  = monthInput.value || nowYm;
      const invoice = TM.invoiceForStudent(sid, ym);
      let csv = 'Class,Amount (VND)\n';
      (invoice.items||[]).forEach(it => {
        csv += (it.className||it.classId) + ',' + it.amount + '\n';
      });
      csv += 'Total,' + invoice.total + '\n';
      const blob = new Blob([csv], {type:'text/csv'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tuition_${sid}_${ym}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };
    if (btnPrint) btnPrint.onclick = function(){
      window.print();
    };
    render();
  };

})();
/* ==== HOTFIX APPEND: robust calendar + correct modal ids + persistent handlers ==== */
;(function(){
  const TM = window.TM; if (!TM) return;

  // 1) Guard: ensure attendance array exists on sessions
  function fixAttendanceShape(){
    (TM.data.sessions||[]).forEach(s => { if (!Array.isArray(s.present)) s.present = []; });
  }
  const _applyLoadedData = TM._applyLoadedData;
  TM._applyLoadedData = function(obj, source){
    _applyLoadedData.call(TM, obj, source);
    fixAttendanceShape();
  };
  fixAttendanceShape();

  // 2) Small helpers for the fallback mini-grid
  const monthDays = (ym)=>{ const [y,m]=ym.split("-").map(Number); const last=new Date(y,m,0).getDate(); return Array.from({length:last},(_,i)=>i+1); };
  const firstDow  = (ym)=>{ const [y,m]=ym.split("-").map(Number); return new Date(y,m-1,1).getDay(); };

  // 3) Replace calendar initializer with an id-correct, library-optional version
  TM.initCalendarPage = function(){
    const $wrap         = document.getElementById("classCalendars");
    const $monthPicker  = document.getElementById("monthPicker");
    const $btnPrev      = document.getElementById("btnPrevMonth");
    const $btnNext      = document.getElementById("btnNextMonth");
    const $fileImport   = document.getElementById("fileImport");
    const $btnExport    = document.getElementById("btnExport");

    // Use the modal IDs defined in index.html
    // The calendar page uses #sessionEditorModal for session editing and #classDetailModal for class details.
    const $sessionModal = document.getElementById("sessionEditorModal");
    const $classModal   = document.getElementById("classDetailModal");

    let currentYm = new Date().toISOString().slice(0,7);
    if ($monthPicker) $monthPicker.value = currentYm;

    /**
     * Toggle session status for the calendar on the homepage. It cycles through
     * no-session → held → cancelled → clear. A right-click handler still
     * separately toggles cancelled status, but this cycle ensures the same
     * behaviour when repeatedly left-clicking a date. Attributes such as
     * duration, teacher and snapshot rate are preserved when transitioning
     * between statuses.
     */
    function quickToggleHeld(classId, ymd){
      const cls = TM.classById(classId);
      let s = TM.data.sessions.find(x => x.classId === classId && x.date === ymd);
      if (!s || s.status !== 'held'){
        // If no session or not held, create/update to a held session
        if (!s){
          TM.data.sessions.push({
            id: TM.util.nextId("SES"),
            classId: classId,
            date: ymd,
            status: 'held',
            durationHrs: Number(cls?.defaultDurationHrs || 1),
            teacherId: cls?.teacherId || null,
            teacherName: cls?.teacherName || null,
            teacherRatePerHourSnap: (typeof cls?.teacherRatePerHour === 'number') ? cls.teacherRatePerHour : null,
            note: '',
            present: []
          });
        } else {
          s.status = 'held';
        }
      } else {
        // If currently held, remove the session entirely
        TM.data.sessions = TM.data.sessions.filter(x => !(x.classId === classId && x.date === ymd));
      }
      TM._saveToLocal();
      document.dispatchEvent(new CustomEvent("tm:data:sessionsChanged"));
    }

    function openSessionEditor(classId, ymd){
      const cls = TM.classById(classId);
      if (!$sessionModal || !cls) return;
      const bs = new bootstrap.Modal($sessionModal);

      const $date     = document.getElementById("sessionDateLabel");
      const $teacher  = document.getElementById("sessionTeacher");
      const $dur      = document.getElementById("sessionDuration");
      const $note     = document.getElementById("sessionNote");
      const $save     = document.getElementById("btnSaveSession");
      const $clear    = document.getElementById("btnClearSession");

      let s = TM.data.sessions.find(x=>x.classId===classId && x.date===ymd) || {
        id: TM.util.nextId("SES"), classId, date: ymd, status:"held",
        durationHrs: Number(cls?.defaultDurationHrs||1),
        teacherId: cls?.teacherId || null,
        teacherName: cls?.teacherName || null,
        teacherRatePerHourSnap: (typeof cls?.teacherRatePerHour==='number') ? cls.teacherRatePerHour : null,
        note:"", present:[]
      };
      if (!Array.isArray(s.present)) s.present = [];

      // Title/date
      if ($date) $date.textContent = `${ymd} — ${cls?.name||""}`;

      // Teacher select
      if ($teacher){
        const opts = [`<option value="">Unassigned</option>`]
          .concat(TM.data.teachers.map(t=>`<option value="${t.id}">${t.name||t.id} — ${TM.util.fmtVnd(t.ratePerHour||0)} VND/hr</option>`));
        $teacher.innerHTML = opts.join("");
        $teacher.value = s.teacherId || (cls?.teacherId || "");
      }

      // Duration / Note
      if ($dur)  $dur.value  = s.durationHrs ?? (cls?.defaultDurationHrs || 1);
      if ($note) $note.value = s.note || "";

      // Add (or reuse) a rate override field just above the note
      let $rateInp = document.getElementById("sessionRate");
      if (!$rateInp){
        const wrap = document.createElement("div");
        wrap.className = "mb-3";
        wrap.innerHTML = `
          <label class="form-label">Custom rate for this day (VND / hr)</label>
          <input id="sessionRate" type="number" min="0" step="1000" class="form-control" placeholder="Leave empty to use teacher/class default">
          <div class="form-text">If blank, we snapshot the selected teacher’s current rate.</div>`;
        const container = $note?.closest('.mb-3') || $note?.parentElement;
        if (container && container.parentElement){
          container.parentElement.insertBefore(wrap, container);
        }
        $rateInp = wrap.querySelector("#sessionRate");
      }
      if ($rateInp) $rateInp.value = (s.teacherRatePerHourSnap != null && s.teacherId) ? s.teacherRatePerHourSnap : "";

      // Insert (or reuse) a session status select to choose between Held and Cancelled
      let $statusSel = document.getElementById("sessionStatus");
      if (!$statusSel){
        const wrapStatus = document.createElement("div");
        wrapStatus.className = "mb-3";
        wrapStatus.innerHTML = `
          <label class="form-label">Status</label>
          <select id="sessionStatus" class="form-select">
            <option value="held">Held</option>
            <option value="cancelled">Cancelled</option>
          </select>`;
        // insert after rate field if available, otherwise before note
        const ref = $rateInp?.closest('.mb-3') || $note?.closest('.mb-3') || $note?.parentElement;
        if (ref && ref.parentElement){
          ref.parentElement.insertBefore(wrapStatus, ref.nextSibling);
        }
        $statusSel = wrapStatus.querySelector("#sessionStatus");
      }
      if ($statusSel) $statusSel.value = s.status || 'held';

      // Attendance block (below rate). Use a select for each student to mark present/excused/absent.
      let $attList = document.getElementById("sessionAttendanceList");
      if (!$attList){
        const wrap = document.createElement("div");
        wrap.className = "mb-2";
        wrap.innerHTML = `
          <label class="form-label">Attendance</label>
          <div id="sessionAttendanceList" class="row g-2"></div>`;
        const container = $note?.closest('.mb-3') || $note?.parentElement;
        if (container && container.parentElement){
          container.parentElement.insertBefore(wrap, container);
        }
        $attList = wrap.querySelector("#sessionAttendanceList");
      }
      // Paint current roster with select boxes
      if ($attList){
        const rosterIds = TM.rosterForClass(classId);
        $attList.innerHTML = rosterIds.map(sid=>{
          const stu = TM.studentById(sid);
          // Determine existing attendance status: present by default
          let status = 'present';
          if (s.attendance && typeof s.attendance === 'object' && s.attendance[sid]){
            status = s.attendance[sid];
          } else if (Array.isArray(s.present)){
            status = s.present.includes(sid) ? 'present' : 'present';
          }
          return `<div class="col-md-6">
            <label class="form-label small">${stu?.name || sid}</label>
            <select class="form-select form-select-sm" data-sid="${sid}">
              <option value="present"${status==='present'?' selected':''}>Present</option>
              <option value="excused"${status==='excused'?' selected':''}>Excused</option>
              <option value="absent"${status==='absent'?' selected':''}>Absent</option>
            </select>
          </div>`;
        }).join("") || `<div class="text-muted">No students enrolled.</div>`;
      }

      // Save / Clear
      if ($save) $save.onclick = ()=>{
        const teacherId = $teacher?.value || "";
        const teacher   = teacherId ? TM.teacherById(teacherId) : null;
        const dur       = Number($dur?.value || 1);
        const note      = $note?.value || "";
        const rateOv    = (document.getElementById("sessionRate")?.value || "") === "" ? null : Number(document.getElementById("sessionRate").value);
        // Build attendance object from selects; default to present
        const att = {};
        document.querySelectorAll('#sessionAttendanceList select[data-sid]').forEach(sel => {
          const sid = sel.getAttribute('data-sid');
          att[sid] = sel.value || 'present';
        });
        const presentList = Object.keys(att).filter(sid => att[sid] === 'present');

        const existing = TM.data.sessions.find(x=>x.classId===classId && x.date===ymd);
        const statusSel = document.getElementById("sessionStatus");
        const statusVal = statusSel ? statusSel.value : 'held';
        const payload = {
          id: existing?.id || s.id,
          classId: classId,
          date: ymd,
          status: statusVal || 'held',
          durationHrs: dur,
          teacherId: teacherId || null,
          teacherName: teacher?.name || (teacherId || null),
          teacherRatePerHourSnap: (rateOv != null ? rateOv : (teacher?.ratePerHour ?? null)),
          note: note,
          attendance: att,
          present: presentList
        };
        if (existing) Object.assign(existing, payload); else TM.data.sessions.push(payload);
        TM._saveToLocal();
        document.dispatchEvent(new CustomEvent("tm:data:sessionsChanged"));
        bs.hide();
      };
      if ($clear) $clear.onclick = ()=>{
        TM.data.sessions = TM.data.sessions.filter(x=> !(x.classId===classId && x.date===ymd));
        TM._saveToLocal();
        document.dispatchEvent(new CustomEvent("tm:data:sessionsChanged"));
        bs.hide();
      };

      bs.show();
    }

    function buildCardHtml_grid(cls){
      const roster  = TM.rosterForClass(cls.id);
      const rev     = TM.revenueForDetailed(cls, currentYm);
      const cost    = TM.costFor(cls, currentYm);
      const net     = rev - cost;

      const days = monthDays(currentYm);
      const offset = firstDow(currentYm);
      const sess = TM.sessionsFor(cls.id, currentYm);
      const held = new Set(sess.filter(s => s.status === "held").map(s => s.date));
      const cancelled = new Set(sess.filter(s => s.status === "cancelled").map(s => s.date));

      const leading = Array.from({length:offset}, () => `<div class="calendar-cell disabled"></div>`);
      const grid = days.map(d => {
        const ymd = `${currentYm}-${String(d).padStart(2,'0')}`;
        let clsName = "";
        if (cancelled.has(ymd)) clsName = " cancelled";
        else if (held.has(ymd)) clsName = " held";
        return `<div class="calendar-cell${clsName}" data-class="${cls.id}" data-date="${ymd}">
                  <span class="small">${d}</span>
                </div>`;
      });

      const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(w=>`<div class="calendar-weekday">${w}</div>`).join("");

      return `
      <div class="col-md-6 col-lg-4">
        <div class="card class-card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <div class="fw-semibold">${cls.name}</div>
            <span class="price-pill badge text-secondary">${TM.util.fmtVnd(cls.priceVnd)} VND / session</span>
          </div>
          <div class="card-body">
            <div class="small-muted mb-2">ID: ${cls.id}</div>
            <div class="d-flex flex-wrap gap-3 mb-2"><div><strong>${roster.length}</strong> student${roster.length!==1?"s":""}</div></div>
            <div class="d-flex flex-column gap-1 mb-2">
              <div>Revenue (${currentYm}): <strong>${TM.util.fmtVnd(rev)}</strong> VND</div>
              <div>Teacher cost (${currentYm}): <strong>${TM.util.fmtVnd(cost)}</strong> VND</div>
              <div>Net: <strong>${TM.util.fmtVnd(net)}</strong> VND</div>
            </div>
            <div class="calendar-grid mb-2">
              ${weekdays}
              ${leading.join("")}
              ${grid.join("")}
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-primary" data-cmd="details" data-class="${cls.id}">Details</button>
              <button class="btn btn-sm btn-outline-secondary" data-cmd="notes" data-class="${cls.id}">Notes</button>
            </div>
          </div>
        </div>
      </div>`;
    }

    // Expose session and class helpers globally so other modules or event handlers use the most up-to-date versions.
    TM.openSessionEditor = openSessionEditor;
    TM.openClassDetails  = openClassDetails;
    TM.openClassNotes    = openClassNotes;

    function buildCardHtml_fc(cls){
      const roster  = TM.rosterForClass(cls.id);
      const rev     = TM.revenueForDetailed(cls, currentYm);
      const cost    = TM.costFor(cls, currentYm);
      const net     = rev - cost;

      return `
      <div class="col-md-6 col-lg-4">
        <div class="card class-card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <div class="fw-semibold">${cls.name}</div>
            <span class="price-pill badge text-secondary">${TM.util.fmtVnd(cls.priceVnd)} VND / session</span>
          </div>
          <div class="card-body">
            <div class="small-muted mb-2">ID: ${cls.id}</div>
            <div class="d-flex flex-wrap gap-3 mb-2"><div><strong>${roster.length}</strong> student${roster.length!==1?"s":""}</div></div>
            <div class="d-flex flex-column gap-1 mb-2">
              <div>Revenue (${currentYm}): <strong>${TM.util.fmtVnd(rev)}</strong> VND</div>
              <div>Teacher cost (${currentYm}): <strong>${TM.util.fmtVnd(cost)}</strong> VND</div>
              <div>Net: <strong>${TM.util.fmtVnd(net)}</strong> VND</div>
            </div>
            <div id="fc-${cls.id}" class="fc-mini"></div>
            <div class="d-flex gap-2 mt-2">
              <button class="btn btn-sm btn-outline-primary" data-cmd="details" data-class="${cls.id}">Details</button>
              <button class="btn btn-sm btn-outline-secondary" data-cmd="notes" data-class="${cls.id}">Notes</button>
            </div>
          </div>
        </div>
      </div>`;
    }

    function sessionsToEvents(classId){
      return TM.sessionsFor(classId, currentYm)
        .filter(s => s.status === "held" || s.status === "cancelled")
        .map(s => ({
          id: s.id,
          start: s.date,
          allDay: true,
          display: "background",
          classNames: [s.status === "held" ? "held-day" : "cancelled-day"]
        }));
    }

    function render(){
      if (!$wrap) return;

      const useFC = !!window.FullCalendar;
      $wrap.innerHTML = TM.data.classes.map(c => useFC ? buildCardHtml_fc(c) : buildCardHtml_grid(c)).join("") ||
        `<div class="col-12"><div class="alert alert-warning">No classes. Connect your JSON.</div></div>`;

      if (useFC){
        // Mount FullCalendar mini instances
        TM.data.classes.forEach(cls=>{
          const el = document.getElementById(`fc-${cls.id}`); if (!el) return;
        const cal = new FullCalendar.Calendar(el, {
            initialView: "dayGridMonth",
            firstDay: 0, height:"auto", headerToolbar:false, fixedWeekCount:true, showNonCurrentDates:true,
            initialDate: `${currentYm}-01`,
            events: sessionsToEvents(cls.id),
            // Left click toggles held on/off. Use info.dateStr for local date to avoid timezone issues
            dateClick: (info)=> {
              quickToggleHeld(cls.id, info.dateStr);
            },
            dayCellDidMount: (arg)=>{
              // Compute local ISO date string (YYYY-MM-DD)
              const d = arg.date;
              const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            // Right-click opens the session editor for detailed actions
              arg.el.addEventListener("contextmenu", (ev)=>{
                ev.preventDefault();
                // Use the local date string (iso) to open the session editor for this day
                openSessionEditor(cls.id, iso);
              });
            }
          });
          cal.render();
        });
      } else {
        // Fallback mini-grid (no FullCalendar). Single click cycles session status; right-click opens session editor.
        $wrap.addEventListener("click", (e) => {
          const cell = e.target.closest(".calendar-cell[data-date][data-class]");
          if (cell){
            const classId = cell.getAttribute("data-class");
            const dateStr = cell.getAttribute("data-date");
            // Cycle session status on left click
            quickToggleHeld(classId, dateStr);
            return;
          }
          // Buttons inside cards
          const btn = e.target.closest("[data-cmd][data-class]");
          if (btn){
            const classId = btn.getAttribute("data-class");
            const cmd     = btn.getAttribute("data-cmd");
            // Use global handlers (TM.*) so the latest implementations are used
            if (cmd === "details") TM.openClassDetails(classId);
            if (cmd === "notes")   TM.openClassNotes(classId);
          }
        });
        // Right-click on a cell opens the session editor for that specific day
        $wrap.addEventListener("contextmenu", (e) => {
          const cell = e.target.closest(".calendar-cell[data-date][data-class]");
          if (!cell) return;
          e.preventDefault();
          const classId = cell.getAttribute("data-class");
          const dateStr = cell.getAttribute("data-date");
          // Open session editor for the clicked date and class using global handler
          TM.openSessionEditor(classId, dateStr);
        });
      }
    }

    function gotoMonth(delta){
      const [y,m] = currentYm.split("-").map(Number);
      const d = new Date(y, m-1+delta, 1);
      currentYm = d.toISOString().slice(0,7);
      if ($monthPicker) $monthPicker.value = currentYm;
      render();
    }
    $btnPrev?.addEventListener("click", ()=> gotoMonth(-1));
    $btnNext?.addEventListener("click", ()=> gotoMonth(+1));
    $monthPicker?.addEventListener("change", ()=>{ currentYm = $monthPicker.value || currentYm; render(); });

    $fileImport?.addEventListener("change", async (e)=>{ const f = e.target.files && e.target.files[0]; if (f){ await TM.loadStudentsFromFile(f); e.target.value = ""; }});
    $btnExport?.addEventListener("click", ()=> TM.downloadStudents());

    document.addEventListener("tm:data:changed", render);
    document.addEventListener("tm:data:sessionsChanged", render);

    // Class detail modal (uses #classModal)
    function openClassDetails(classId){
      const cls = TM.classById(classId); if (!cls || !$classModal) return;
      const md = new bootstrap.Modal($classModal);

      const $cdTitle = document.getElementById("cdTitle");
      const $cdTeacherSel = document.getElementById("cdTeacherSel");
      const $cdTeacherLine = document.getElementById("cdTeacherLine");
      const $cdPrice = document.getElementById("cdPrice");
      const $cdDuration = document.getElementById("cdDuration");
      const $cdNotes = document.getElementById("cdNotes");
      const $cdRosterBody = document.getElementById("cdRosterBody");
      const $cdMonth = document.getElementById("cdMonth");
      const $cdAttendanceBody = document.getElementById("cdAttendanceBody");

      $cdTitle && ($cdTitle.textContent = `${cls.name} • ${classId}`);

      // Teacher select + line
      const tOpts = [`<option value="">Unassigned</option>`]
        .concat(TM.data.teachers.map(t=>`<option value="${t.id}">${t.name||t.id} — ${TM.util.fmtVnd(t.ratePerHour||0)} VND/hr</option>`));
      if ($cdTeacherSel){ $cdTeacherSel.innerHTML = tOpts.join(""); $cdTeacherSel.value = cls.teacherId || ""; }
      function fillTeacherLine(){
        const rate = Number(cls.teacherRatePerHour||0);
        const t = cls.teacherId ? TM.teacherById(cls.teacherId) : null;
        const tName = t?.name || cls.teacherName || "Unassigned";
        if ($cdTeacherLine) $cdTeacherLine.innerHTML = `Rate default: <strong>${TM.util.fmtVnd(rate)}</strong> VND/hr &nbsp;•&nbsp; ${tName}`;
      }
      $cdTeacherSel?.addEventListener("change", ()=>{
        const t = TM.teacherById($cdTeacherSel.value);
        cls.teacherId = t?.id || null; cls.teacherName = t?.name || null;
        if (t && typeof t.ratePerHour==='number') cls.teacherRatePerHour = Number(t.ratePerHour);
        TM._saveToLocal(); fillTeacherLine(); document.dispatchEvent(new CustomEvent("tm:data:changed"));
      });
      fillTeacherLine();

      // price/duration/notes
      if ($cdPrice){ $cdPrice.value = Number(cls.priceVnd||0); $cdPrice.onchange = ()=>{ cls.priceVnd = Number($cdPrice.value||0); TM._saveToLocal(); document.dispatchEvent(new CustomEvent("tm:data:changed")); }; }
      if ($cdDuration){ $cdDuration.value = Number(cls.defaultDurationHrs||1); $cdDuration.onchange = ()=>{ cls.defaultDurationHrs = Number($cdDuration.value||1); TM._saveToLocal(); document.dispatchEvent(new CustomEvent("tm:data:changed")); }; }
      if ($cdNotes){ $cdNotes.value = cls.notes || ""; $cdNotes.onchange = ()=>{ cls.notes = $cdNotes.value||""; TM._saveToLocal(); }; }

      // roster
      if ($cdRosterBody){
        const rosterIds = TM.rosterForClass(classId);
        const rows = rosterIds.map(sid=>{
          const s = TM.studentById(sid);
          const enr = TM.data.enrollments.find(e=>e.classId===classId && e.studentId===sid);
          return `<tr><td>${s?.name||sid}</td><td>${s?.studentId||""}</td><td class="text-end">${enr?.discountPct||0}</td><td>${enr?.enrolledAt||""}</td></tr>`;
        }).join("");
        $cdRosterBody.innerHTML = rows || `<tr><td colspan="4" class="text-muted">No students enrolled.</td></tr>`;
      }

      function paintAttendance(){
        const ym = $cdMonth?.value || currentYm;
        const sessions = TM.sessionsFor(classId, ym).sort((a,b)=> a.date.localeCompare(b.date));
        const rows = sessions.map(s=>{
          const t = s.teacherId ? TM.teacherById(s.teacherId) : null;
          const tName = t?.name || s.teacherName || "—";
          const count = Array.isArray(s.present) ? s.present.length : 0;
          return `<tr>
            <td>${s.date}</td><td>${s.status}</td><td>${tName}</td>
            <td class="text-end">${s.durationHrs?.toFixed?.(2) || s.durationHrs || ""}</td>
            <td class="text-end">${count}</td>
          </tr>`;
        }).join("");
        if ($cdAttendanceBody) $cdAttendanceBody.innerHTML = rows || `<tr><td colspan="5" class="text-muted">No sessions in ${ym}.</td></tr>`;
      }
      if ($cdMonth){ $cdMonth.value = currentYm; $cdMonth.onchange = paintAttendance; }
      paintAttendance();

      // Show default to Info tab
      const infoTabBtn = document.querySelector('[data-bs-target="#cdInfo"],[data-bs-target="#cdTabInfo"]');
      if (infoTabBtn) new bootstrap.Tab(infoTabBtn).show();

      md.show();
    }

    function openClassNotes(classId){
      // just open class modal & switch to Notes tab
      // Use global handler to ensure proper details modal opens
      TM.openClassDetails(classId);
      setTimeout(()=>{
        const notesBtn = document.querySelector('[data-bs-target="#cmNotes"]');
        if (notesBtn) new bootstrap.Tab(notesBtn).show();
        const cls = TM.classById(classId);
        const ym = currentYm;
        const $notes = document.getElementById("cmNotesInput");
        if ($notes) $notes.value = cls?.monthNotes?.[ym] || "";
        document.getElementById("cmSaveNotes")?.addEventListener("click", ()=>{
          if (!cls.monthNotes) cls.monthNotes = {};
          cls.monthNotes[ym] = document.getElementById("cmNotesInput")?.value || "";
          TM._saveToLocal();
        }, { once:true });
      }, 100);
    }

    // Boot
    TM._loadFromLocal();
    render();
  };

  
})();
console.log('hi')