/* ============================================================
   Dutton Plumbing — Daily Job Log (dark)
   Tabs: Log Job (form → INSERT) and Calendar (month heatmap,
   day panels, job detail sheets). Reads use the anon key
   (SELECT allowed via RLS); full-access work stays server-side.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- elements ---------- */
  var tabClock = document.getElementById("tab-clock");
  var tabLog = document.getElementById("tab-log");
  var tabCal = document.getElementById("tab-cal");
  var tabDispatch = document.getElementById("tab-dispatch");
  var viewClock = document.getElementById("view-clock");
  var viewLog = document.getElementById("view-log");
  var viewCal = document.getElementById("view-cal");
  var viewDispatch = document.getElementById("view-dispatch");
  var setupView = document.getElementById("setup-view");

  var formView = document.getElementById("crew-form");
  var successView = document.getElementById("success-view");
  var form = document.getElementById("crew-form");
  var submitBtn = document.getElementById("submit-btn");
  var formError = document.getElementById("form-error");
  var anotherBtn = document.getElementById("another-btn");

  var dateInput = document.getElementById("date");
  var personInput = document.getElementById("person");
  var jobNameInput = document.getElementById("job_name");
  var locationInput = document.getElementById("location");
  var descriptionInput = document.getElementById("description");
  var hoursInput = document.getElementById("hours");
  var segBtns = Array.prototype.slice.call(document.querySelectorAll(".seg-btn"));
  var jobStatus = "finished";
  var photoZone = document.getElementById("photo-zone");
  var photoInput = document.getElementById("photo-input");
  var photoThumbs = document.getElementById("photo-thumbs");
  var selectedPhotos = [];
  var MAX_PHOTOS = 6;

  var calGrid = document.getElementById("cal-grid");
  var calTitle = document.getElementById("cal-title");
  var prevBtn = document.getElementById("prev-month");
  var nextBtn = document.getElementById("next-month");
  var exportBtn = document.getElementById("export-btn");
  var exportLabel = document.getElementById("export-label");
  var dayPanel = document.getElementById("day-panel");
  var statHours = document.getElementById("stat-hours");
  var statHoursLabel = document.getElementById("stat-hours-label");
  var statJobs = document.getElementById("stat-jobs");
  var statPhotos = document.getElementById("stat-photos");

  var backdrop = document.getElementById("sheet-backdrop");
  var sheetBody = document.getElementById("sheet-body");
  var sheetClose = document.getElementById("sheet-close");

  /* ---------- setup check ---------- */
  function isConfigured() {
    return (
      typeof SUPABASE_URL === "string" &&
      SUPABASE_URL.indexOf("PASTE_") !== 0 &&
      typeof SUPABASE_ANON_KEY === "string" &&
      SUPABASE_ANON_KEY.indexOf("PASTE_") !== 0
    );
  }

  var db = null;
  if (!isConfigured() || !window.supabase) {
    viewClock.hidden = true;
    viewLog.hidden = true;
    viewCal.hidden = true;
    document.querySelector(".tabbar").hidden = true;
    setupView.hidden = false;
    return;
  }
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  /* ---------- helpers ---------- */
  var MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  var MONTHS_SHORT = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  var WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

  function pad(n) { return String(n).padStart(2, "0"); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function firstName(person) {
    return String(person).trim().split(/\s+/)[0] || "Tech";
  }

  // Person color coding: Kyle → rose, Caleb → teal, everyone else
  // gets a stable color from the name hash.
  var PALETTE = ["kyle", "caleb", "blue", "amber", "purple"];
  function personClass(person) {
    var f = firstName(person).toLowerCase();
    if (f.indexOf("kyle") === 0) return "kyle";
    if (f.indexOf("caleb") === 0) return "caleb";
    var h = 0;
    for (var i = 0; i < f.length; i++) h = (h * 31 + f.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  function longDate(dateStr) {
    var parts = dateStr.split("-");
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function fmtHours(h) {
    var n = Math.round(Number(h) * 100) / 100;
    return n + "h";
  }

  /* ---------- tabs ---------- */
  var calLoaded = false;

  function showTab(which) {
    var tabs = ["clock", "log", "cal", "dispatch"];
    var btns = { clock: tabClock, log: tabLog, cal: tabCal, dispatch: tabDispatch };
    var views = { clock: viewClock, log: viewLog, cal: viewCal, dispatch: viewDispatch };
    tabs.forEach(function (t) {
      var active = t === which;
      btns[t].classList.toggle("is-active", active);
      btns[t].setAttribute("aria-selected", active ? "true" : "false");
      views[t].hidden = !active;
    });
    if (which === "cal" && !calLoaded) loadMonth();
    if (which === "dispatch" && !dLoaded) loadDispatch();
    window.scrollTo(0, 0);
  }
  tabClock.addEventListener("click", function () { showTab("clock"); });
  tabLog.addEventListener("click", function () { showTab("log"); });
  tabCal.addEventListener("click", function () { showTab("cal"); });
  tabDispatch.addEventListener("click", function () { showTab("dispatch"); });

  /* ---------- default date = today ---------- */
  dateInput.value = todayStr();

  /* ---------- status segmented control ---------- */
  segBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      segBtns.forEach(function (b) {
        b.classList.remove("is-active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-pressed", "true");
      jobStatus = btn.getAttribute("data-status");
    });
  });

  /* ---------- photos: pick, preview, compress, upload ---------- */
  function clearPhotoError() {
    var msg = form.querySelector('[data-error-for="photos"]');
    if (msg) { msg.textContent = ""; msg.hidden = true; }
    fieldEl("photos").classList.remove("invalid");
  }

  function renderThumbs() {
    photoThumbs.innerHTML = "";
    selectedPhotos.forEach(function (file, idx) {
      var url = URL.createObjectURL(file);
      var d = document.createElement("div");
      d.className = "photo-thumb";
      d.innerHTML = '<img src="' + url + '" alt="Job photo ' + (idx + 1) + '">' +
        '<button type="button" class="thumb-remove" data-idx="' + idx + '" aria-label="Remove photo">&times;</button>';
      photoThumbs.appendChild(d);
    });
    photoThumbs.querySelectorAll(".thumb-remove").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        selectedPhotos.splice(Number(btn.getAttribute("data-idx")), 1);
        renderThumbs();
      });
    });
    photoZone.querySelector(".photo-hint").textContent =
      selectedPhotos.length === 0 ? "Tap to add photos (up to 6)" :
      selectedPhotos.length + " photo" + (selectedPhotos.length === 1 ? "" : "s") + " — tap to add more";
  }

  photoZone.addEventListener("click", function () { photoInput.click(); });
  photoZone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      photoInput.click();
    }
  });

  photoInput.addEventListener("change", function () {
    clearPhotoError();
    var files = Array.prototype.slice.call(photoInput.files || []);
    files.forEach(function (f) {
      if (selectedPhotos.length < MAX_PHOTOS && f.type.indexOf("image/") === 0) {
        selectedPhotos.push(f);
      }
    });
    photoInput.value = "";
    renderThumbs();
  });

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var objUrl = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var maxDim = 1600;
          var w = img.width, h = img.height;
          if (Math.max(w, h) > maxDim) {
            var s = maxDim / Math.max(w, h);
            w = Math.round(w * s);
            h = Math.round(h * s);
          }
          var canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(objUrl);
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob);
            else reject(new Error("compress"));
          }, "image/jpeg", 0.82);
        } catch (err) {
          URL.revokeObjectURL(objUrl);
          reject(err);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(objUrl);
        reject(new Error("load"));
      };
      img.src = objUrl;
    });
  }

  function batchId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  async function uploadPhotos(files) {
    var urls = [];
    var id = batchId();
    for (var i = 0; i < files.length; i++) {
      var blob = await compressImage(files[i]);
      var path = id + "/photo-" + Date.now() + "-" + i + ".jpg";
      var up = await db.storage.from("crew-photos").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw new Error("photos");
      var pub = db.storage.from("crew-photos").getPublicUrl(path);
      urls.push(pub.data.publicUrl);
    }
    return urls;
  }

  /* ---------- form validation ---------- */
  function fieldEl(name) {
    return form.querySelector('[data-field="' + name + '"]');
  }

  function clearErrors() {
    form.querySelectorAll(".field.invalid").forEach(function (el) {
      el.classList.remove("invalid");
    });
    form.querySelectorAll(".error-msg").forEach(function (el) {
      el.textContent = "";
      el.hidden = true;
    });
  }

  function setInvalid(name, message) {
    var wrap = fieldEl(name);
    if (!wrap) return;
    wrap.classList.add("invalid");
    var msg = wrap.querySelector('[data-error-for="' + name + '"]');
    if (msg) {
      msg.textContent = message;
      msg.hidden = false;
    }
  }

  function validate() {
    var errors = {};
    var values = { status: jobStatus };

    values.person = personInput.value.trim();
    if (!values.person) errors.person = "Enter your name.";

    values.date = dateInput.value.trim();
    if (!values.date) errors.date = "Pick the date you worked.";

    values.job_name = jobNameInput.value.trim();
    if (!values.job_name) errors.job_name = "Enter a job name.";

    values.location = locationInput.value.trim();

    values.description = descriptionInput.value.trim();
    if (!values.description) errors.description = "Say what you did.";

    var hoursRaw = hoursInput.value.trim();
    var hours = parseFloat(hoursRaw);
    if (hoursRaw === "" || isNaN(hours)) {
      errors.hours = "Enter your hours.";
    } else if (hours <= 0 || hours >= 24) {
      errors.hours = "Hours must be more than 0 and less than 24.";
    } else {
      values.hours = hours;
    }

    return { errors: errors, values: values };
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearErrors();
    formError.textContent = "";
    formError.hidden = true;

    var result = validate();
    var names = Object.keys(result.errors);
    if (names.length > 0) {
      names.forEach(function (n) { setInvalid(n, result.errors[n]); });
      var firstBad = form.querySelector(".field.invalid input, .field.invalid textarea");
      if (firstBad) firstBad.focus();
      return;
    }

    submitBtn.disabled = true;

    try {
      var photoUrls = [];
      if (selectedPhotos.length > 0) {
        submitBtn.innerHTML = "Uploading photos&hellip;";
        photoUrls = await uploadPhotos(selectedPhotos);
      }
      submitBtn.innerHTML = "Sending&hellip;";
      var res = await db.from("crew_logs").insert({
        person: result.values.person,
        date: result.values.date,
        job_name: result.values.job_name,
        location: result.values.location || null,
        description: result.values.description,
        hours: result.values.hours,
        status: result.values.status,
        photo_urls: photoUrls
      });
      if (res.error) throw res.error;
      selectedPhotos = [];
      renderThumbs();
      if (calLoaded) {
        var parts = result.values.date.split("-");
        if (Number(parts[0]) === calYear && Number(parts[1]) - 1 === calMonth) {
          loadMonth();
        }
      }
      showSuccess(result.values);
    } catch (err) {
      if (err && err.message === "photos") {
        setInvalid("photos", "Photo upload failed — check your signal and try again.");
      } else {
        formError.textContent =
          "Couldn't save — check your signal and tap Log Hours again. Your entry is still here.";
        formError.hidden = false;
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = "Log Hours";
    }
  });

  function showSuccess(v) {
    document.getElementById("sum-name").textContent = v.person;
    document.getElementById("sum-date").textContent = v.date;
    document.getElementById("sum-job").textContent = v.job_name;
    document.getElementById("sum-hours").textContent =
      v.hours + (Number(v.hours) === 1 ? " hour" : " hours");
    document.getElementById("sum-status").textContent =
      v.status === "ongoing" ? "Ongoing" : "Finished";
    formView.hidden = true;
    successView.hidden = false;
    window.scrollTo(0, 0);
  }

  anotherBtn.addEventListener("click", function () {
    personInput.value = "";
    jobNameInput.value = "";
    locationInput.value = "";
    descriptionInput.value = "";
    hoursInput.value = "";
    selectedPhotos = [];
    renderThumbs();
    clearErrors();
    formError.textContent = "";
    formError.hidden = true;
    successView.hidden = true;
    formView.hidden = false;
    window.scrollTo(0, 0);
    personInput.focus();
  });

  /* ---------- calendar state ---------- */
  var now = new Date();
  var calYear = now.getFullYear();
  var calMonth = now.getMonth();
  var selectedDate = null;
  var monthEntries = [];
  var byDate = {};

  prevBtn.addEventListener("click", function () {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    selectedDate = null;
    loadMonth();
  });
  nextBtn.addEventListener("click", function () {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    selectedDate = null;
    loadMonth();
  });

  async function loadMonth() {
    calLoaded = true;
    var start = calYear + "-" + pad(calMonth + 1) + "-01";
    var nm = calMonth + 1, ny = calYear;
    if (nm > 11) { nm = 0; ny++; }
    var end = ny + "-" + pad(nm + 1) + "-01";

    calTitle.textContent = MONTHS[calMonth] + " " + calYear;
    exportLabel.textContent = "Export " + MONTHS[calMonth] + " " + calYear + " (CSV)";
    statHoursLabel.textContent = MONTHS_SHORT[calMonth] + " hrs";
    calGrid.innerHTML = '<p class="empty-day">Loading&hellip;</p>';
    dayPanel.innerHTML = "";

    try {
      var res = await db
        .from("crew_logs")
        .select("id,person,date,job_name,location,description,hours,status,photo_urls")
        .gte("date", start)
        .lt("date", end)
        .order("date", { ascending: true })
        .order("submitted_at", { ascending: true })
        .limit(1000);
      if (res.error) throw res.error;
      monthEntries = res.data || [];
    } catch (err) {
      calGrid.innerHTML =
        '<p class="empty-day">Couldn&rsquo;t load — check your signal and reopen the History tab.</p>';
      return;
    }

    byDate = {};
    var totalHours = 0;
    var totalPhotos = 0;
    monthEntries.forEach(function (e) {
      (byDate[e.date] = byDate[e.date] || []).push(e);
      totalHours += Number(e.hours) || 0;
      totalPhotos += (e.photo_urls && e.photo_urls.length) || 0;
    });

    statHours.textContent = Math.round(totalHours * 100) / 100;
    statJobs.textContent = monthEntries.length;
    statPhotos.textContent = totalPhotos;

    renderGrid();
    var t = todayStr();
    if (byDate[t]) {
      selectDay(t);
    } else {
      dayPanel.innerHTML = "";
    }
  }

  function renderGrid() {
    var html = '<div class="cal-weekdays" role="row">' +
      WEEKDAYS.map(function (d) { return "<span>" + d + "</span>"; }).join("") +
      '</div><div class="cal-days">';

    var first = new Date(calYear, calMonth, 1).getDay();
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var t = todayStr();

    for (var i = 0; i < first; i++) {
      html += '<span class="day is-blank"></span>';
    }
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = calYear + "-" + pad(calMonth + 1) + "-" + pad(d);
      var list = byDate[ds] || [];
      var cls = "day";
      if (list.length) cls += " has-hours";
      if (ds === t) cls += " is-today";
      if (ds === selectedDate) cls += " is-selected";
      var hrs = "";
      if (list.length) {
        var sum = list.reduce(function (a, e) { return a + (Number(e.hours) || 0); }, 0);
        hrs = '<span class="day-hours">' + fmtHours(Math.round(sum * 100) / 100) + "</span>";
      }
      html += '<button type="button" class="' + cls + '" data-date="' + ds + '" role="gridcell" aria-label="' +
        esc(longDate(ds)) + (list.length ? ", " + list.length + " jobs" : "") + '">' +
        '<span class="day-num">' + d + "</span>" + hrs + "</button>";
    }
    html += "</div>";
    calGrid.innerHTML = html;

    calGrid.querySelectorAll(".day[data-date]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectDay(btn.getAttribute("data-date"));
      });
    });
  }

  function statusBadge(status) {
    if (status === "ongoing") {
      return '<span class="status-tag ongoing">&#9719; Ongoing</span>';
    }
    return '<span class="status-tag finished">&#10003; Finished</span>';
  }

  function selectDay(dateStr) {
    selectedDate = dateStr;
    renderGrid();
    renderDayPanel(dateStr);
  }

  function renderDayPanel(dateStr) {
    var list = byDate[dateStr] || [];
    if (!list.length) {
      dayPanel.innerHTML = '<div class="day-panel"><p class="empty-day" style="padding:0">No jobs logged this day.</p></div>';
      return;
    }
    var total = Math.round(list.reduce(function (a, e) { return a + (Number(e.hours) || 0); }, 0) * 100) / 100;

    var html = '<div class="day-panel">' +
      '<div class="day-panel-head"><h3>' + esc(longDate(dateStr)) + "</h3>" +
      '<button type="button" class="copy-btn" id="copy-day">Copy for invoice</button></div>' +
      '<p class="day-totals">' + list.length + (list.length === 1 ? " job" : " jobs") +
      " &middot; " + total + " hrs total</p>";

    list.forEach(function (e) {
      var pc = personClass(e.person);
      var photoCount = (e.photo_urls && e.photo_urls.length) ?
        '<span class="photo-count">&#128247; ' + e.photo_urls.length + "</span>" : "";
      html += '<button type="button" class="job-card st-' + pc + '" data-id="' + e.id + '">' +
        '<div class="job-top"><span class="job-title">' + esc(e.job_name || e.customer || "Job") + "</span>" +
        '<span class="job-hours">' + fmtHours(e.hours) + "</span></div>" +
        '<div class="job-meta"><span class="name-tag ' + (pc === "kyle" || pc === "caleb" ? pc : "") + '">' +
        esc(firstName(e.person)) + "</span>" + statusBadge(e.status) + photoCount + "</div>" +
        (e.location ? '<div class="job-loc">' + esc(e.location) + "</div>" : "") +
        (e.description ? '<p class="job-desc">' + esc(e.description) + "</p>" : "") +
        "</button>";
    });
    html += "</div>";
    dayPanel.innerHTML = html;

    document.getElementById("copy-day").addEventListener("click", function () {
      copyDay(dateStr, this);
    });
    dayPanel.querySelectorAll(".job-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var id = Number(card.getAttribute("data-id"));
        var entry = null;
        monthEntries.forEach(function (e) { if (e.id === id) entry = e; });
        if (entry) openSheet(entry);
      });
    });
  }

  /* ---------- copy for invoice ---------- */
  function copyDay(dateStr, btn) {
    var list = byDate[dateStr] || [];
    var total = Math.round(list.reduce(function (a, e) { return a + (Number(e.hours) || 0); }, 0) * 100) / 100;
    var text = longDate(dateStr) + " — " + list.length +
      (list.length === 1 ? " job, " : " jobs, ") + total + " hrs\n" +
      list.map(function (e) {
        var tag = e.status === "ongoing" ? " (ongoing)" : "";
        return "• " + firstName(e.person) + " — " + (e.job_name || "") +
          (e.location ? " @ " + e.location : "") + " — " + (e.description || "") +
          " (" + e.hours + "h)" + tag;
      }).join("\n");

    function done(ok) {
      btn.textContent = ok ? "Copied!" : "Copy failed";
      setTimeout(function () { btn.textContent = "Copy for invoice"; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { done(document.execCommand("copy")); }
      catch (err) { done(false); }
      document.body.removeChild(ta);
    }
  }

  /* ---------- export CSV ---------- */
  function csvCell(v) {
    var s = String(v == null ? "" : v);
    return '"' + s.replace(/"/g, '""') + '"';
  }

  exportBtn.addEventListener("click", function () {
    var rows = [["Date", "Technician", "Job Name", "Location", "Status", "Hours", "Photos", "Work Performed"]];
    monthEntries.forEach(function (e) {
      rows.push([e.date, e.person, e.job_name || "", e.location || "",
        e.status === "ongoing" ? "Ongoing" : "Finished", e.hours,
        (e.photo_urls || []).join("; "), e.description || ""]);
    });
    var csv = rows.map(function (r) { return r.map(csvCell).join(","); }).join("\n");
    var blob = new Blob([csv], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "crew-log-" + calYear + "-" + pad(calMonth + 1) + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  /* ---------- job detail sheet ---------- */
  function openSheet(e) {
    var pc = personClass(e.person);
    var photosHtml = "";
    if (e.photo_urls && e.photo_urls.length) {
      photosHtml = '<div class="section-label">Photos</div><div class="sheet-photos">' +
        e.photo_urls.map(function (u) {
          return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' +
            esc(u) + '" alt="Job photo" loading="lazy"></a>';
        }).join("") + "</div>";
    }
    sheetBody.innerHTML =
      '<h3 class="sheet-title">' + esc(e.job_name || e.customer || "Job") + "</h3>" +
      '<div class="sheet-row"><span class="hours-big">' + fmtHours(e.hours) + "</span>" +
      '<span class="name-tag ' + (pc === "kyle" || pc === "caleb" ? pc : "") + '">' + esc(e.person) + "</span>" +
      statusBadge(e.status) + "</div>" +
      '<div class="sheet-row"><span class="dim">' + esc(longDate(e.date)) +
      (e.location ? " &middot; " + esc(e.location) : "") + "</span></div>" +
      (e.description ?
        '<div class="notes-box"><div class="notes-label">Work performed</div><p>' +
        esc(e.description) + "</p></div>" : "") +
      photosHtml +
      '<div class="d-actions"><button type="button" class="btn-outline btn-block" id="edit-entry-btn">Edit entry</button></div>';
    document.getElementById("edit-entry-btn").addEventListener("click", function () {
      openEditForm(e);
    });
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeSheet() {
    backdrop.hidden = true;
    document.body.style.overflow = "";
  }

  sheetClose.addEventListener("click", closeSheet);
  backdrop.addEventListener("click", function (e) {
    if (e.target === backdrop) closeSheet();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (!backdrop.hidden) closeSheet();
      if (!eFormBackdrop.hidden) closeEditForm();
      if (!dFormBackdrop.hidden) closeDForm();
      if (!dDetailBackdrop.hidden) closeDDetail();
    }
  });

  /* ---------- edit entry ---------- */
  var eFormBackdrop = document.getElementById("eform-backdrop");
  var eFormClose = document.getElementById("eform-close");
  var eForm = document.getElementById("e-form");
  var eFormError = document.getElementById("e-form-error");
  var eSubmitBtn = document.getElementById("e-submit-btn");
  var eEditingId = null;
  var eStatus = "finished";
  var eSegBtns = Array.prototype.slice.call(
    eForm.querySelectorAll(".seg-btn"));

  eSegBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setEStatus(btn.getAttribute("data-estatus"));
    });
  });

  function setEStatus(s) {
    eStatus = s === "ongoing" ? "ongoing" : "finished";
    eSegBtns.forEach(function (b) {
      var on = b.getAttribute("data-estatus") === eStatus;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  /* ----- edit-entry photos: existing URLs + new picks (Alex, 2026-11-13) ----- */
  var ePhotoZone = document.getElementById("e-photo-zone");
  var ePhotoInput = document.getElementById("e-photo-input");
  var ePhotoThumbs = document.getElementById("e-photo-thumbs");
  var ePhotos = []; // [{url: "..."} already saved | {file: File} newly picked]

  function renderEThumbs() {
    ePhotoThumbs.innerHTML = "";
    ePhotos.forEach(function (p, idx) {
      var url = p.url || URL.createObjectURL(p.file);
      var d = document.createElement("div");
      d.className = "photo-thumb";
      d.innerHTML = '<img src="' + esc(url) + '" alt="Job photo ' + (idx + 1) + '">' +
        '<button type="button" class="thumb-remove" data-idx="' + idx + '" aria-label="Remove photo">&times;</button>';
      ePhotoThumbs.appendChild(d);
    });
    ePhotoThumbs.querySelectorAll(".thumb-remove").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        ePhotos.splice(Number(btn.getAttribute("data-idx")), 1);
        renderEThumbs();
      });
    });
    ePhotoZone.querySelector(".photo-hint").textContent =
      ePhotos.length === 0 ? "Tap to add photos (up to 6)" :
      ePhotos.length + " photo" + (ePhotos.length === 1 ? "" : "s") + " — tap to add more";
  }

  ePhotoZone.addEventListener("click", function () { ePhotoInput.click(); });
  ePhotoZone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      ePhotoInput.click();
    }
  });
  ePhotoInput.addEventListener("change", function () {
    var files = Array.prototype.slice.call(ePhotoInput.files || []);
    files.forEach(function (f) {
      if (ePhotos.length < MAX_PHOTOS && f.type.indexOf("image/") === 0) {
        ePhotos.push({ file: f });
      }
    });
    ePhotoInput.value = "";
    renderEThumbs();
  });

  function eField(name) {
    return eForm.querySelector('[data-field="' + name + '"]');
  }

  function eClearErrors() {
    eForm.querySelectorAll(".field.invalid").forEach(function (el) {
      el.classList.remove("invalid");
    });
    eForm.querySelectorAll(".error-msg").forEach(function (el) {
      el.textContent = "";
      el.hidden = true;
    });
    eFormError.textContent = "";
    eFormError.hidden = true;
  }

  function eSetInvalid(name, message) {
    var wrap = eField(name);
    if (!wrap) return;
    wrap.classList.add("invalid");
    var msg = wrap.querySelector('[data-error-for="' + name + '"]');
    if (msg) {
      msg.textContent = message;
      msg.hidden = false;
    }
  }

  function openEditForm(entry) {
    eEditingId = entry.id;
    eClearErrors();
    document.getElementById("e_date").value = entry.date || "";
    document.getElementById("e_person").value = entry.person || "";
    document.getElementById("e_job_name").value = entry.job_name || "";
    document.getElementById("e_location").value = entry.location || "";
    document.getElementById("e_hours").value =
      entry.hours != null ? entry.hours : "";
    document.getElementById("e_description").value = entry.description || "";
    setEStatus(entry.status);
    ePhotos = (entry.photo_urls || []).map(function (u) { return { url: u }; });
    renderEThumbs();
    closeSheet();
    eFormBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeEditForm() {
    eFormBackdrop.hidden = true;
    document.body.style.overflow = "";
  }

  eFormClose.addEventListener("click", closeEditForm);
  eFormBackdrop.addEventListener("click", function (e) {
    if (e.target === eFormBackdrop) closeEditForm();
  });

  eForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    eClearErrors();

    var person = document.getElementById("e_person").value.trim();
    var date = document.getElementById("e_date").value;
    var jobName = document.getElementById("e_job_name").value.trim();
    var location = document.getElementById("e_location").value.trim();
    var description = document.getElementById("e_description").value.trim();
    var hoursRaw = document.getElementById("e_hours").value.trim();
    var hours = parseFloat(hoursRaw);

    var bad = false;
    if (!person) { eSetInvalid("e_person", "Enter your name."); bad = true; }
    if (!date) { eSetInvalid("e_date", "Pick the date you worked."); bad = true; }
    if (!jobName) { eSetInvalid("e_job_name", "Enter a job name."); bad = true; }
    if (!description) { eSetInvalid("e_description", "Say what you did."); bad = true; }
    if (hoursRaw === "" || isNaN(hours)) {
      eSetInvalid("e_hours", "Enter your hours.");
      bad = true;
    } else if (hours <= 0 || hours >= 24) {
      eSetInvalid("e_hours", "Hours must be more than 0 and less than 24.");
      bad = true;
    }
    if (bad) return;

    eSubmitBtn.disabled = true;
    eSubmitBtn.innerHTML = "Saving&hellip;";
    try {
      var keptUrls = [];
      var newFiles = [];
      ePhotos.forEach(function (p) {
        if (p.url) keptUrls.push(p.url);
        else newFiles.push(p.file);
      });
      var uploadedUrls = [];
      if (newFiles.length) {
        eSubmitBtn.innerHTML = "Uploading photos&hellip;";
        uploadedUrls = await uploadPhotos(newFiles);
        eSubmitBtn.innerHTML = "Saving&hellip;";
      }
      var res = await db.from("crew_logs").update({
        person: person,
        date: date,
        job_name: jobName,
        location: location || null,
        description: description,
        hours: hours,
        status: eStatus,
        photo_urls: keptUrls.concat(uploadedUrls)
      }).eq("id", eEditingId);
      if (res.error) throw res.error;
      closeEditForm();
      await loadMonth();
      if (byDate[date]) selectDay(date);
      window.scrollTo(0, 0);
    } catch (err) {
      if (err && err.message === "photos") {
        eSetInvalid("e_photos", "Photo upload failed — check your signal and try again.");
      } else {
        eFormError.textContent =
          "Couldn't save — check your signal and tap Save changes again.";
        eFormError.hidden = false;
      }
    } finally {
      eSubmitBtn.disabled = false;
      eSubmitBtn.innerHTML = "Save changes";
    }
  });

  /* ================= DISPATCH ================= */
  var dCalGrid = document.getElementById("d-cal-grid");
  var dCalTitle = document.getElementById("d-cal-title");
  var dPrevBtn = document.getElementById("d-prev-month");
  var dNextBtn = document.getElementById("d-next-month");
  var dAddBtn = document.getElementById("d-add-btn");
  var dDayPanel = document.getElementById("d-day-panel");
  var dFormBackdrop = document.getElementById("dform-backdrop");
  var dFormClose = document.getElementById("dform-close");
  var dFormTitle = document.getElementById("dform-title");
  var dJobForm = document.getElementById("d-job-form");
  var dFormError = document.getElementById("d-form-error");
  var dSubmitBtn = document.getElementById("d-submit-btn");
  var dDetailBackdrop = document.getElementById("ddetail-backdrop");
  var dDetailBody = document.getElementById("ddetail-body");
  var dDetailClose = document.getElementById("ddetail-close");

  var dNow = new Date();
  var dYear = dNow.getFullYear();
  var dMonth = dNow.getMonth();
  var dSelectedDate = null;
  var dJobs = [];
  var dByDate = {};
  var dLoaded = false;
  var dPriority = "flexible";
  var dEditingId = null;
  var dAutoRolled = false;
  var DAY_CAPACITY = 8; // productive hours per tech per day

  function techBucket(tech) {
    var s = String(tech || "").trim().toLowerCase();
    return s === "" ? "unassigned" : s;
  }

  function prettyBucket(b) {
    if (b === "unassigned") return "Unassigned";
    return b.charAt(0).toUpperCase() + b.slice(1);
  }

  function nextDateStr(ds) {
    var p = ds.split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    d.setDate(d.getDate() + 1);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function shortDate(ds) {
    var p = ds.split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] + ", " +
      MONTHS_SHORT[d.getMonth()] + " " + d.getDate();
  }

  function priorityLabel(p) {
    if (p === "emergency") return "Emergency";
    if (p === "urgent") return "Urgent";
    return "Flexible";
  }

  function dStatusLabel(s) {
    if (s === "done") return "Done";
    if (s === "waiting_parts") return "Waiting on parts";
    return "Scheduled";
  }

  function pillClass(j) {
    if (j.status === "done") return "done";
    return j.priority || "flexible";
  }

  dPrevBtn.addEventListener("click", function () {
    dMonth--;
    if (dMonth < 0) { dMonth = 11; dYear--; }
    dSelectedDate = null;
    loadDispatch();
  });
  dNextBtn.addEventListener("click", function () {
    dMonth++;
    if (dMonth > 11) { dMonth = 0; dYear++; }
    dSelectedDate = null;
    loadDispatch();
  });
  dAddBtn.addEventListener("click", function () { openDForm(dSelectedDate, null); });

  async function loadDispatch() {
    dLoaded = true;
    var start = dYear + "-" + pad(dMonth + 1) + "-01";
    var nm = dMonth + 1, ny = dYear;
    if (nm > 11) { nm = 0; ny++; }
    var end = ny + "-" + pad(nm + 1) + "-01";

    dCalTitle.textContent = MONTHS[dMonth] + " " + dYear;
    dCalGrid.innerHTML = '<p class="empty-day">Loading&hellip;</p>';
    dDayPanel.innerHTML = "";

    try {
      var res = await db.from("dispatch_jobs")
        .select("*")
        .gte("job_date", start)
        .lt("job_date", end)
        .order("job_date", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(500);
      if (res.error) throw res.error;
      dJobs = res.data || [];
    } catch (err) {
      dCalGrid.innerHTML =
        '<p class="empty-day">Couldn&rsquo;t load — check your signal and reopen the Calendar tab.</p>';
      return;
    }

    dByDate = {};
    dJobs.forEach(function (j) {
      (dByDate[j.job_date] = dByDate[j.job_date] || []).push(j);
    });

    // Adaptive rollover: unfinished past-due jobs move to the first
    // day with room. Runs once per session (on first tab open).
    var moved = [];
    if (!dAutoRolled) {
      dAutoRolled = true;
      moved = await rolloverOverdue();
    }
    showDBanner(moved);

    renderDispatchGrid();
    if (dSelectedDate && dByDate[dSelectedDate]) {
      renderDDayPanel(dSelectedDate);
    } else {
      var t = todayStr();
      if (dByDate[t]) {
        selectDDay(t);
      } else {
        dSelectedDate = null;
        renderDispatchGrid();
        dDayPanel.innerHTML = "";
      }
    }
  }

  function renderDispatchGrid() {
    var html = '<div class="cal-weekdays" role="row">' +
      WEEKDAYS.map(function (d) { return "<span>" + d + "</span>"; }).join("") +
      '</div><div class="cal-days">';

    var first = new Date(dYear, dMonth, 1).getDay();
    var daysInMonth = new Date(dYear, dMonth + 1, 0).getDate();
    var t = todayStr();

    for (var i = 0; i < first; i++) {
      html += '<span class="day is-blank"></span>';
    }
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = dYear + "-" + pad(dMonth + 1) + "-" + pad(d);
      var list = dByDate[ds] || [];
      var cls = "day";
      if (ds === t) cls += " is-today";
      if (ds === dSelectedDate) cls += " is-selected";
      var pills = list.slice(0, 3).map(function (j) {
        return '<span class="pill ' + pillClass(j) + '" data-id="' + j.id + '">' +
          esc(j.title) + "</span>";
      }).join("");
      if (list.length > 3) {
        pills += '<span class="more-link">+' + (list.length - 3) + " more</span>";
      }
      html += '<button type="button" class="' + cls + '" data-date="' + ds + '" role="gridcell" aria-label="' +
        esc(longDate(ds)) + (list.length ? ", " + list.length + " jobs" : "") + '">' +
        '<span class="day-num">' + d + "</span>" + pills + "</button>";
    }
    html += "</div>";
    dCalGrid.innerHTML = html;

    dCalGrid.querySelectorAll(".pill").forEach(function (p) {
      p.addEventListener("click", function (ev) {
        ev.stopPropagation();
        openDDetail(Number(p.getAttribute("data-id")));
      });
    });
    dCalGrid.querySelectorAll(".day[data-date]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectDDay(btn.getAttribute("data-date"));
      });
    });
  }

  function selectDDay(dateStr) {
    dSelectedDate = dateStr;
    renderDispatchGrid();
    renderDDayPanel(dateStr);
  }

  function renderDDayPanel(dateStr) {
    var list = dByDate[dateStr] || [];
    var addBtn = '<button type="button" class="copy-btn" id="d-day-add">&#43; Add job</button>';
    if (!list.length) {
      dDayPanel.innerHTML = '<div class="day-panel">' +
        '<div class="day-panel-head"><h3>' + esc(longDate(dateStr)) + "</h3>" + addBtn + "</div>" +
        '<p class="empty-day" style="padding:8px 0">No jobs scheduled.</p></div>';
      document.getElementById("d-day-add").addEventListener("click", function () {
        openDForm(dateStr, null);
      });
      return;
    }
    var load = dayLoad(list);
    var loadLine = list.length + (list.length === 1 ? " job" : " jobs") +
      " &middot; " + load.total + "h planned";
    if (load.over) loadLine += ' &middot; <span style="color:#fbbf24;font-weight:700">overbooked</span>';
    var techLine = Object.keys(load.byTech).map(function (b) {
      return prettyBucket(b) + " " + load.byTech[b] + "h";
    }).join(" &middot; ");
    var html = '<div class="day-panel">' +
      '<div class="day-panel-head"><h3>' + esc(longDate(dateStr)) + "</h3>" + addBtn + "</div>" +
      '<p class="day-totals">' + loadLine + "</p>" +
      (techLine ? '<p class="day-totals">' + techLine + "</p>" : "");
    list.forEach(function (j) {
      html += '<button type="button" class="d-job-card" data-id="' + j.id + '">' +
        '<div class="job-top"><span class="job-title">' + esc(j.title) + "</span></div>" +
        '<div class="job-meta"><span class="pri-tag ' + pillClass(j) + '">' + esc(priorityLabel(j.priority)) + "</span>" +
        (j.tech ? '<span class="name-tag">' + esc(firstName(j.tech)) + "</span>" : "") +
        (j.status !== "scheduled" ?
          '<span class="status-tag ' + (j.status === "done" ? "finished" : "ongoing") + '">' +
          esc(dStatusLabel(j.status)) + "</span>" : "") +
        "</div>" +
        (j.client_name ? '<div class="job-loc">' + esc(j.client_name) + "</div>" : "") +
        "</button>";
    });
    html += "</div>";
    dDayPanel.innerHTML = html;
    document.getElementById("d-day-add").addEventListener("click", function () {
      openDForm(dateStr, null);
    });
    dDayPanel.querySelectorAll(".d-job-card").forEach(function (card) {
      card.addEventListener("click", function () {
        openDDetail(Number(card.getAttribute("data-id")));
      });
    });
  }

  /* ---------- dispatch: add/edit form ---------- */
  var dPriBtns = Array.prototype.slice.call(dJobForm.querySelectorAll(".seg-btn"));
  dPriBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      dPriBtns.forEach(function (b) {
        b.classList.remove("is-active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-pressed", "true");
      dPriority = btn.getAttribute("data-priority");
    });
  });

  function setDPriority(p) {
    dPriority = p || "flexible";
    dPriBtns.forEach(function (b) {
      var on = b.getAttribute("data-priority") === dPriority;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function dField(name) {
    return dJobForm.querySelector('[data-field="' + name + '"]');
  }

  function dClearErrors() {
    dJobForm.querySelectorAll(".field.invalid").forEach(function (el) {
      el.classList.remove("invalid");
    });
    dJobForm.querySelectorAll(".error-msg").forEach(function (el) {
      el.textContent = "";
      el.hidden = true;
    });
    dFormError.textContent = "";
    dFormError.hidden = true;
  }

  function dSetInvalid(name, message) {
    var wrap = dField(name);
    if (!wrap) return;
    wrap.classList.add("invalid");
    var msg = wrap.querySelector('[data-error-for="' + name + '"]');
    if (msg) {
      msg.textContent = message;
      msg.hidden = false;
    }
  }

  function openDForm(dateStr, job) {
    dEditingId = job ? job.id : null;
    dFormTitle.textContent = job ? "Edit job" : "Add job";
    dSubmitBtn.innerHTML = job ? "Save changes" : "&#43; Schedule Job";
    dClearErrors();
    document.getElementById("d_title").value = job ? job.title || "" : "";
    document.getElementById("d_client").value = job ? job.client_name || "" : "";
    document.getElementById("d_phone").value = job ? job.phone || "" : "";
    document.getElementById("d_address").value = job ? job.address || "" : "";
    document.getElementById("d_tech").value = job ? job.tech || "" : "";
    document.getElementById("d_date").value = job ? job.job_date : (dateStr || todayStr());
    document.getElementById("d_notes").value = job ? job.notes || "" : "";
    document.getElementById("d_hours").value =
      job && job.projected_hours != null ? job.projected_hours : 2;
    setDPriority(job ? job.priority : "flexible");
    dDetailBackdrop.hidden = true;
    dFormBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeDForm() {
    dFormBackdrop.hidden = true;
    if (dDetailBackdrop.hidden) document.body.style.overflow = "";
  }

  dFormClose.addEventListener("click", closeDForm);
  dFormBackdrop.addEventListener("click", function (e) {
    if (e.target === dFormBackdrop) closeDForm();
  });

  dJobForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    dClearErrors();

    var title = document.getElementById("d_title").value.trim();
    var date = document.getElementById("d_date").value;
    var bad = false;
    if (!title) { dSetInvalid("d_title", "Enter a job name."); bad = true; }
    if (!date) { dSetInvalid("d_date", "Pick a date."); bad = true; }
    var hrsRaw = document.getElementById("d_hours").value.trim();
    var hrs = parseFloat(hrsRaw);
    if (hrsRaw === "" || isNaN(hrs) || hrs <= 0 || hrs > 16) {
      dSetInvalid("d_hours", "Enter projected hours (0.5–16).");
      bad = true;
    }
    if (bad) return;

    var payload = {
      title: title,
      client_name: document.getElementById("d_client").value.trim() || null,
      phone: document.getElementById("d_phone").value.trim() || null,
      address: document.getElementById("d_address").value.trim() || null,
      tech: document.getElementById("d_tech").value.trim() || null,
      job_date: date,
      priority: dPriority,
      projected_hours: hrs,
      notes: document.getElementById("d_notes").value.trim() || null
    };

    dSubmitBtn.disabled = true;
    dSubmitBtn.innerHTML = "Saving&hellip;";
    try {
      var res = dEditingId ?
        await db.from("dispatch_jobs").update(payload).eq("id", dEditingId) :
        await db.from("dispatch_jobs").insert(payload);
      if (res.error) throw res.error;
      closeDForm();
      dSelectedDate = date;
      await loadDispatch();
      window.scrollTo(0, 0);
    } catch (err) {
      dFormError.textContent = "Couldn't save — check your signal and try again.";
      dFormError.hidden = false;
    } finally {
      dSubmitBtn.disabled = false;
      dSubmitBtn.innerHTML = dEditingId ? "Save changes" : "&#43; Schedule Job";
    }
  });

  /* ---------- dispatch: detail sheet ---------- */
  function openDDetail(id) {
    var j = null;
    dJobs.forEach(function (x) { if (x.id === id) j = x; });
    if (!j) return;
    var pc = pillClass(j);
    var statusBtns = ["scheduled", "waiting_parts", "done"].map(function (s) {
      return '<button type="button" class="d-status-btn' + (j.status === s ? " is-active" : "") +
        '" data-status="' + s + '">' + dStatusLabel(s) + "</button>";
    }).join("");
    var tel = j.phone ? j.phone.replace(/[^0-9+]/g, "") : "";
    dDetailBody.innerHTML =
      '<h3 class="sheet-title">' + esc(j.title) + "</h3>" +
      '<div class="sheet-row"><span class="pri-tag ' + pc + '">' + esc(priorityLabel(j.priority)) + "</span>" +
      '<span class="status-tag' + (j.status === "done" ? " finished" : j.status === "waiting_parts" ? " ongoing" : "") + '">' +
      esc(dStatusLabel(j.status)) + "</span></div>" +
      (j.client_name ? '<div class="sheet-row"><span class="dim">' + esc(j.client_name) + "</span></div>" : "") +
      (j.address ? '<div class="sheet-row"><span class="dim">' + esc(j.address) + "</span></div>" : "") +
      '<div class="sheet-row"><span class="dim">' + esc(longDate(j.job_date)) +
      (j.tech ? " &middot; " + esc(j.tech) : "") + "</span></div>" +
      '<div class="sheet-row"><span class="dim">Planned: ' + (Number(j.projected_hours) || 0) +
      "h</span></div>" +
      (j.notes ? '<div class="notes-box"><div class="notes-label">Notes</div><p>' + esc(j.notes) + "</p></div>" : "") +
      '<div class="section-label">Status</div>' +
      '<div class="d-status-row">' + statusBtns + "</div>" +
      '<div class="d-actions">' +
      (tel ? '<a class="btn-outline btn-block d-call" href="tel:' + esc(tel) + '">Call ' +
        esc(j.client_name || "client") + "</a>" : "") +
      '<button type="button" class="btn-outline btn-block" id="d-edit-btn">Edit job</button>' +
      "</div>";
    dDetailBody.querySelectorAll(".d-status-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        setDStatus(id, b.getAttribute("data-status"));
      });
    });
    document.getElementById("d-edit-btn").addEventListener("click", function () {
      openDForm(null, j);
    });
    dDetailBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }

  async function setDStatus(id, status) {
    try {
      var res = await db.from("dispatch_jobs").update({ status: status }).eq("id", id);
      if (res.error) throw res.error;
      await loadDispatch();
      openDDetail(id);
    } catch (err) {
      // keep the sheet open; the status buttons simply won't reflect the change
    }
  }

  function closeDDetail() {
    dDetailBackdrop.hidden = true;
    document.body.style.overflow = "";
  }

  dDetailClose.addEventListener("click", closeDDetail);
  dDetailBackdrop.addEventListener("click", function (e) {
    if (e.target === dDetailBackdrop) closeDDetail();
  });

  /* ---------- dispatch: adaptive rollover ---------- */
  // Planned (non-done) load for a list of jobs, per tech bucket.
  function dayLoad(list) {
    var total = 0;
    var byTech = {};
    var over = false;
    list.forEach(function (j) {
      if (j.status === "done") return;
      var h = Number(j.projected_hours) || 0;
      total += h;
      var b = techBucket(j.tech);
      byTech[b] = Math.round(((byTech[b] || 0) + h) * 100) / 100;
    });
    Object.keys(byTech).forEach(function (b) {
      if (byTech[b] > DAY_CAPACITY) over = true;
    });
    return { total: Math.round(total * 100) / 100, byTech: byTech, over: over };
  }

  // Moves unfinished past-due jobs to the earliest day with room,
  // in priority order. Done and waiting-on-parts jobs are never moved.
  async function rolloverOverdue() {
    var t = todayStr();
    var overdue = dJobs.filter(function (j) {
      return j.status === "scheduled" && j.job_date < t;
    });
    if (!overdue.length) return [];

    var priRank = { emergency: 0, urgent: 1, flexible: 2 };
    overdue.sort(function (a, b) {
      return ((priRank[a.priority] == null ? 2 : priRank[a.priority]) -
              (priRank[b.priority] == null ? 2 : priRank[b.priority])) ||
        (a.job_date < b.job_date ? -1 : a.job_date > b.job_date ? 1 : 0);
    });

    // Current planned load per day per tech bucket (non-done jobs).
    var loads = {};
    dJobs.forEach(function (j) {
      if (j.status === "done") return;
      var b = techBucket(j.tech);
      var h = Number(j.projected_hours) || 0;
      loads[j.job_date] = loads[j.job_date] || {};
      loads[j.job_date][b] = Math.round(((loads[j.job_date][b] || 0) + h) * 100) / 100;
    });

    var moved = [];
    for (var i = 0; i < overdue.length; i++) {
      var j = overdue[i];
      var b = techBucket(j.tech);
      var hrs = Number(j.projected_hours) || 0;
      var from = j.job_date;
      if (loads[from] && loads[from][b]) {
        loads[from][b] = Math.round((loads[from][b] - hrs) * 100) / 100;
      }
      var day = t;
      var placed = false;
      for (var k = 0; k < 60; k++) {
        var lb = (loads[day] && loads[day][b]) || 0;
        if (lb + hrs <= DAY_CAPACITY) { placed = true; break; }
        day = nextDateStr(day);
      }
      if (!placed) {
        loads[from] = loads[from] || {};
        loads[from][b] = Math.round(((loads[from][b] || 0) + hrs) * 100) / 100;
        continue;
      }
      var res = await db.from("dispatch_jobs").update({ job_date: day }).eq("id", j.id);
      if (res.error) {
        loads[from] = loads[from] || {};
        loads[from][b] = Math.round(((loads[from][b] || 0) + hrs) * 100) / 100;
        continue;
      }
      loads[day] = loads[day] || {};
      loads[day][b] = Math.round(((loads[day][b] || 0) + hrs) * 100) / 100;
      j.job_date = day;
      moved.push({ id: j.id, title: j.title, from: from, to: day });
    }

    dByDate = {};
    dJobs.forEach(function (x) {
      (dByDate[x.job_date] = dByDate[x.job_date] || []).push(x);
    });
    return moved;
  }

  function showDBanner(moved) {
    var el = document.getElementById("d-banner");
    if (!moved.length) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    var items = moved.map(function (m) {
      return "<li>" + esc(m.title) + " &rarr; " + esc(shortDate(m.to)) + "</li>";
    }).join("");
    el.innerHTML = "<strong>" + moved.length +
      (moved.length === 1 ? " job" : " jobs") +
      " rolled forward</strong> — not finished in time, moved to the first day with room." +
      "<ul>" + items + "</ul>" +
      '<div class="banner-actions">' +
      '<button type="button" class="btn-outline btn-small" id="d-undo">Undo</button>' +
      '<button type="button" class="btn-outline btn-small" id="d-dismiss">Dismiss</button>' +
      "</div>";
    el.hidden = false;
    document.getElementById("d-undo").addEventListener("click", async function () {
      el.hidden = true;
      for (var i = 0; i < moved.length; i++) {
        await db.from("dispatch_jobs").update({ job_date: moved[i].from }).eq("id", moved[i].id);
      }
      dSelectedDate = null;
      await loadDispatch();
    });
    document.getElementById("d-dismiss").addEventListener("click", function () {
      el.hidden = true;
    });
  }

  /* ==========================================================
     CLOCK — PIN clock in/out (added 2026-10-31)
     First screen of the app. A 4-digit PIN identifies each guy
     (SHA-256 hash in crew_members; the PIN itself is never
     stored). At clock-out the day's job hours (plus drive time
     and lunch) are tallied against the shift. Unaccounted
     time does NOT block finishing (Alex, 2026-11-10), but at
     least ONE entry is required to clock out (Alex,
     2026-11-11) — and logging MORE than the shift blocks.
     At least 30% of the shift must be accounted for before
     Finish unlocks (Alex, 2026-11-13). A shift left open into
     a later day is fixed at the next clock-out: the tech sets
     the real out-time for that day (punch flagged manual) and
     logs that day's work, and only then can clock in fresh
     (Alex, 2026-11-13).
     The entries land in crew_logs like the Log Hours form.
     Punches live in clock_punches. A missed punch can be added
     or fixed by hand (flagged manual = true; Alex's call —
     Bouncie truck GPS is the backstop).
     If the phone has no signal, punches and clock-out bundles
     queue in localStorage and sync when signal returns.
     ========================================================== */

  var LS_SHIFT = "dutton_clock_shift_v1";
  var LS_OUTBOX = "dutton_clock_outbox_v1";

  var ckPinCard = document.getElementById("clock-pin-card");
  var ckSetupCard = document.getElementById("clock-setup-card");
  var ckMainCard = document.getElementById("clock-main-card");
  var ckOutCard = document.getElementById("clock-out-card");
  var ckDoneCard = document.getElementById("clock-done-card");
  var ckBanner = document.getElementById("clock-banner");
  var pinDots = document.getElementById("pin-dots");
  var pinError = document.getElementById("pin-error");
  var ckName = document.getElementById("clock-name");
  var ckStatus = document.getElementById("clock-status");
  var ckElapsed = document.getElementById("clock-elapsed");
  var ckActionBtn = document.getElementById("clock-action-btn");

  var ckMembers = null;        // [{person, pin_hash}]
  var ckPinEntry = "";
  var ckPerson = null;         // identified person
  var ckOpenPunch = null;      // latest punch row for ckPerson
  var ckOutCtx = null;         // clock-out session state
  var elapsedTimer = null;

  function lsGet(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try {
      if (val === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { /* storage full/blocked — carry on */ }
  }

  function fmtTime(iso) {
    var d = new Date(iso);
    var h = d.getHours();
    var ampm = h >= 12 ? "PM" : "AM";
    h = h % 12; if (h === 0) h = 12;
    return h + ":" + pad(d.getMinutes()) + " " + ampm;
  }

  function fmtDay(iso) {
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days[new Date(iso).getDay()];
  }

  function fmtDur(hoursFloat) {
    var mins = Math.round(hoursFloat * 60);
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    if (h === 0) return m + " min";
    return h + "h " + pad(m) + "m";
  }

  function dateStrOf(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  async function sha256Hex(text) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ("0" + b.toString(16)).slice(-2);
    }).join("");
  }
  function pinHashFor(person, pin) {
    return sha256Hex("dutton:" + person + ":" + pin);
  }

  /* ---------- offline outbox ---------- */
  function outboxAdd(item) {
    var box = lsGet(LS_OUTBOX) || [];
    box.push(item);
    lsSet(LS_OUTBOX, box);
    renderClockBanner();
  }

  async function flushOutbox() {
    var box = lsGet(LS_OUTBOX) || [];
    if (!box.length) { renderClockBanner(); return; }
    var left = [];
    for (var i = 0; i < box.length; i++) {
      var item = box[i];
      try {
        if (item.type === "punch") {
          var r1 = await db.from("clock_punches").insert(item.row);
          if (r1.error) throw r1.error;
        } else if (item.type === "clockout") {
          if (item.entries && item.entries.length) {
            var r2 = await db.from("crew_logs").insert(item.entries);
            if (r2.error) throw r2.error;
          }
          var r3 = await db.from("clock_punches").insert(item.punch);
          if (r3.error) throw r3.error;
        }
      } catch (e) {
        left.push(item);
      }
    }
    lsSet(LS_OUTBOX, left.length ? left : null);
    renderClockBanner();
  }

  function renderClockBanner() {
    var box = lsGet(LS_OUTBOX) || [];
    if (box.length) {
      ckBanner.innerHTML = "<strong>No signal earlier</strong> — " + box.length +
        " item" + (box.length === 1 ? "" : "s") +
        " saved on this phone, will sync automatically.";
      ckBanner.hidden = false;
    } else {
      ckBanner.hidden = true;
      ckBanner.innerHTML = "";
    }
  }

  /* ---------- members & identity ---------- */
  async function loadMembers() {
    if (ckMembers) return ckMembers;
    var res = await db.from("crew_members").select("person,pin_hash").order("person");
    if (res.error) throw res.error;
    ckMembers = res.data || [];
    return ckMembers;
  }

  async function memberByPin(pin) {
    var members = await loadMembers();
    for (var i = 0; i < members.length; i++) {
      if (!members[i].pin_hash) continue;
      var h = await pinHashFor(members[i].person, pin);
      if (h === members[i].pin_hash) return members[i].person;
    }
    return null;
  }

  async function verifyPin(person, pin) {
    var members = await loadMembers();
    for (var i = 0; i < members.length; i++) {
      if (members[i].person !== person) continue;
      if (!members[i].pin_hash) return false;
      return (await pinHashFor(person, pin)) === members[i].pin_hash;
    }
    return false;
  }

  function showClockCard(which) {
    var cards = {
      pin: ckPinCard, setup: ckSetupCard, main: ckMainCard,
      out: ckOutCard, done: ckDoneCard
    };
    Object.keys(cards).forEach(function (k) { cards[k].hidden = k !== which; });
    if (which !== "main" && elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  }

  function renderPinDots() {
    var dots = pinDots.querySelectorAll(".pin-dot");
    dots.forEach(function (d, i) {
      d.classList.toggle("filled", i < ckPinEntry.length);
    });
  }

  function pinFail(msg) {
    pinError.textContent = msg;
    pinError.hidden = false;
    ckPinEntry = "";
    renderPinDots();
  }

  document.getElementById("pin-pad").addEventListener("click", async function (e) {
    var btn = e.target.closest(".pin-key");
    if (!btn) return;
    var key = btn.getAttribute("data-key");
    pinError.hidden = true;
    if (key === "clear") { ckPinEntry = ""; renderPinDots(); return; }
    if (key === "back") { ckPinEntry = ckPinEntry.slice(0, -1); renderPinDots(); return; }
    if (ckPinEntry.length >= 4) return;
    ckPinEntry += key;
    renderPinDots();
    if (ckPinEntry.length === 4) {
      var entered = ckPinEntry;
      try {
        var person = await memberByPin(entered);
        if (!person) {
          pinFail("That PIN doesn't match anyone. Try again — or set your PIN below if it's your first time.");
          return;
        }
        ckPinEntry = "";
        renderPinDots();
        await identify(person);
      } catch (err) {
        pinFail("Couldn't check your PIN — check your signal and try again.");
      }
    }
  });

  async function latestPunch(person) {
    var res = await db.from("clock_punches")
      .select("id,person,kind,punched_at,manual")
      .eq("person", person)
      .order("punched_at", { ascending: false })
      .limit(1);
    if (res.error) throw res.error;
    return (res.data && res.data[0]) || null;
  }

  async function identify(person) {
    ckPerson = person;
    personInput.value = person; // prefill the Log Hours form too
    ckOpenPunch = null;
    try {
      ckOpenPunch = await latestPunch(person);
    } catch (e) {
      var local = lsGet(LS_SHIFT);
      if (local && local.person === person) {
        ckOpenPunch = { kind: "in", punched_at: local.since, person: person };
      }
    }
    renderMainCard();
    showClockCard("main");
  }

  function isClockedIn() {
    return !!(ckOpenPunch && ckOpenPunch.kind === "in");
  }

  function renderMainCard() {
    ckName.textContent = "Hey, " + firstName(ckPerson);
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    if (isClockedIn()) {
      if (dateStrOf(new Date(ckOpenPunch.punched_at)) !== dateStrOf(new Date())) {
        // Open shift from a previous day — flag it before it turns
        // into a marathon "shift" at clock-out (Alex, 2026-11-13).
        ckStatus.innerHTML = "Clocked in since <strong>" + fmtTime(ckOpenPunch.punched_at) +
          " " + fmtDay(ckOpenPunch.punched_at) + "</strong> — no clock-out that day. " +
          "Tap Clock Out to fix that day first.";
      } else {
        ckStatus.innerHTML = "Clocked in since <strong>" + fmtTime(ckOpenPunch.punched_at) + "</strong>";
      }
      ckActionBtn.textContent = "Clock Out";
      ckActionBtn.classList.add("is-out");
      var tick = function () {
        var hrs = (Date.now() - new Date(ckOpenPunch.punched_at).getTime()) / 3600000;
        ckElapsed.textContent = fmtDur(hrs) + " on the clock";
      };
      tick();
      elapsedTimer = setInterval(tick, 30000);
    } else {
      ckStatus.textContent = "You're not clocked in.";
      ckElapsed.textContent = "";
      ckActionBtn.textContent = "Clock In";
      ckActionBtn.classList.remove("is-out");
    }
  }

  document.getElementById("clock-switch").addEventListener("click", function () {
    ckPerson = null;
    ckOpenPunch = null;
    ckPinEntry = "";
    renderPinDots();
    showClockCard("pin");
  });

  function getGeo() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) { resolve(null); return; }
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; resolve(null); }
      }, 3000);
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        function () {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(null);
        },
        { timeout: 3000, maximumAge: 60000 }
      );
    });
  }

  ckActionBtn.addEventListener("click", async function () {
    if (!ckPerson) return;
    if (!isClockedIn()) {
      ckActionBtn.disabled = true;
      try {
        var geo = await getGeo();
        var row = {
          person: ckPerson, kind: "in",
          punched_at: new Date().toISOString(),
          manual: false,
          lat: geo ? geo.lat : null, lng: geo ? geo.lng : null
        };
        var saved = true;
        try {
          var res = await db.from("clock_punches").insert(row);
          if (res.error) throw res.error;
        } catch (e) {
          outboxAdd({ type: "punch", row: row });
          saved = false;
        }
        lsSet(LS_SHIFT, { person: ckPerson, since: row.punched_at });
        ckOpenPunch = { kind: "in", punched_at: row.punched_at, person: ckPerson };
        document.getElementById("clock-done-title").textContent = "Clocked in";
        document.getElementById("clock-done-sub").textContent =
          firstName(ckPerson) + " — in at " + fmtTime(row.punched_at) +
          (saved ? "." : ". Saved on this phone (no signal) — it will sync on its own.");
        showClockCard("done");
      } finally {
        ckActionBtn.disabled = false;
      }
    } else {
      await startClockOut();
    }
  });

  document.getElementById("clock-done-btn").addEventListener("click", function () {
    if (ckPerson && isClockedIn()) { renderMainCard(); showClockCard("main"); }
    else { ckPinEntry = ""; renderPinDots(); showClockCard("pin"); }
  });

  /* ---------- clock out: account for the shift ---------- */
  function coAddRow(kind, prefill) {
    var wrap = document.createElement("div");
    wrap.className = "co-entry";
    wrap.setAttribute("data-kind", kind);
    if (kind === "drive") {
      wrap.innerHTML =
        '<div class="co-entry-head"><span class="co-entry-kind">Drive time</span>' +
        '<button type="button" class="thumb-remove co-remove" aria-label="Remove">&times;</button></div>' +
        '<div class="form-row">' +
        '<div class="field"><label class="f-label">From / to</label>' +
        '<input type="text" class="co-loc" maxlength="120" placeholder="e.g. Shop to Phoenix Plaza" autocomplete="off"></div>' +
        '<div class="field"><label class="f-label">Hours</label>' +
        '<input type="number" class="co-hours" inputmode="decimal" step="0.25" min="0" max="24" placeholder="0.0"></div>' +
        "</div>";
    } else {
      wrap.innerHTML =
        '<div class="co-entry-head"><span class="co-entry-kind">Job</span>' +
        '<button type="button" class="thumb-remove co-remove" aria-label="Remove">&times;</button></div>' +
        '<div class="field"><label class="f-label">Job name</label>' +
        '<input type="text" class="co-job" maxlength="120" placeholder="e.g. Cast iron pipe repair" autocomplete="off"></div>' +
        '<div class="field"><label class="f-label">Location</label>' +
        '<input type="text" class="co-loc" maxlength="120" placeholder="e.g. Phoenix Plaza" autocomplete="off"></div>' +
        '<div class="form-row">' +
        '<div class="field"><label class="f-label">Hours</label>' +
        '<input type="number" class="co-hours" inputmode="decimal" step="0.25" min="0" max="24" placeholder="0.0"></div>' +
        '<div class="field"><label class="f-label">Status</label>' +
        '<div class="status-seg co-status-seg">' +
        '<button type="button" class="seg-btn is-active" data-costatus="finished">Finished</button>' +
        '<button type="button" class="seg-btn" data-costatus="ongoing">Ongoing</button>' +
        "</div></div></div>" +
        '<div class="field"><label class="f-label">What did you do?</label>' +
        '<textarea class="co-desc" rows="2" maxlength="2000" placeholder="A sentence or two"></textarea></div>';
    }
    if (prefill) {
      if (prefill.hours) wrap.querySelector(".co-hours").value = prefill.hours;
      if (prefill.loc) wrap.querySelector(".co-loc").value = prefill.loc;
      if (prefill.job && wrap.querySelector(".co-job")) wrap.querySelector(".co-job").value = prefill.job;
      if (prefill.desc && wrap.querySelector(".co-desc")) wrap.querySelector(".co-desc").value = prefill.desc;
    }
    wrap.querySelector(".co-remove").addEventListener("click", function () {
      wrap.remove();
      coRecalc();
    });
    wrap.querySelectorAll(".co-status-seg .seg-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        wrap.querySelectorAll(".co-status-seg .seg-btn").forEach(function (x) {
          x.classList.remove("is-active");
        });
        b.classList.add("is-active");
      });
    });
    wrap.querySelector(".co-hours").addEventListener("input", coRecalc);
    document.getElementById("co-entries").appendChild(wrap);
    return wrap;
  }

  function coRenderShiftLine() {
    if (!ckOutCtx) return;
    var inAt = ckOutCtx.inAt, outAt = ckOutCtx.outAt;
    var inLabel = fmtTime(inAt.toISOString());
    var outLabel = fmtTime(outAt.toISOString());
    if (ckOutCtx.stale) {
      inLabel += " " + fmtDay(inAt.toISOString());
      outLabel += " " + fmtDay(outAt.toISOString());
    }
    document.getElementById("co-shift").innerHTML =
      "In at <strong>" + inLabel + "</strong> &middot; out at <strong>" +
      outLabel + "</strong> &middot; " + fmtDur(ckOutCtx.elapsed) + " total";
  }

  function coOutTimeChanged() {
    if (!ckOutCtx || !ckOutCtx.stale) return;
    var v = document.getElementById("co-out-time").value;
    if (!v) return;
    var p = v.split(":");
    var outAt = new Date(ckOutCtx.inAt);
    outAt.setHours(parseInt(p[0], 10), parseInt(p[1], 10), 0, 0);
    var coErr = document.getElementById("co-error");
    if (outAt.getTime() <= ckOutCtx.inAt.getTime()) {
      coErr.textContent = "Clock-out has to be after the " +
        fmtTime(ckOutCtx.inAt.toISOString()) + " clock-in.";
      coErr.hidden = false;
      return;
    }
    coErr.hidden = true;
    ckOutCtx.outAt = outAt;
    ckOutCtx.elapsed = (outAt.getTime() - ckOutCtx.inAt.getTime()) / 3600000;
    coRenderShiftLine();
    coRecalc();
  }

  async function startClockOut() {
    var inAt = new Date(ckOpenPunch.punched_at);
    var now = new Date();
    // A shift left open from a previous day: don't run the clock to
    // now (a 25+ hour "shift"). Default the out-time to 4:00 PM on the
    // day the shift started and let the tech correct it (Alex, 2026-11-13).
    var stale = dateStrOf(inAt) !== dateStrOf(now);
    var outAt = now;
    if (stale) {
      outAt = new Date(inAt);
      outAt.setHours(16, 0, 0, 0);
      if (outAt.getTime() <= inAt.getTime()) {
        outAt = new Date(inAt.getTime() + 3600000);
      }
    }
    var elapsed = (outAt.getTime() - inAt.getTime()) / 3600000;
    ckOutCtx = {
      person: ckPerson, inAt: inAt, outAt: outAt, elapsed: elapsed,
      workDate: dateStrOf(inAt), existingHours: 0, existingCount: 0,
      stale: stale
    };
    document.getElementById("co-name").textContent = firstName(ckPerson);
    var staleBox = document.getElementById("co-stale");
    if (staleBox) {
      staleBox.hidden = !stale;
      if (stale) {
        document.getElementById("co-out-time").value =
          pad(outAt.getHours()) + ":" + pad(outAt.getMinutes());
      }
    }
    coRenderShiftLine();
    document.getElementById("co-entries").innerHTML = "";
    document.getElementById("co-lunch").checked = false;
    document.getElementById("co-dictate-text").value = "";
    document.getElementById("co-parse-msg").hidden = true;
    var coErr = document.getElementById("co-error");
    coErr.hidden = true;
    coErr.textContent = "";
    coAddRow("job");
    // Jobs already logged today (Log Hours tab) count toward the shift.
    try {
      var res = await db.from("crew_logs")
        .select("hours")
        .eq("person", ckPerson)
        .eq("date", ckOutCtx.workDate);
      if (!res.error && res.data) {
        ckOutCtx.existingCount = res.data.length;
        ckOutCtx.existingHours = res.data.reduce(function (s, r) {
          return s + Number(r.hours || 0);
        }, 0);
      }
    } catch (e) { /* offline — tally just uses what's entered here */ }
    var exEl = document.getElementById("co-existing");
    if (ckOutCtx.existingHours > 0) {
      exEl.textContent = "You already logged " + fmtHours(ckOutCtx.existingHours) +
        (ckOutCtx.stale ? " for that day" : " today") +
        " in Log Hours — that counts. Account for the rest below.";
      exEl.hidden = false;
    } else {
      exEl.hidden = true;
    }
    showClockCard("out");
    coRecalc();
  }

  function coAllocated() {
    var sum = ckOutCtx ? ckOutCtx.existingHours : 0;
    document.querySelectorAll("#co-entries .co-entry").forEach(function (row) {
      var h = parseFloat(row.querySelector(".co-hours").value);
      if (!isNaN(h) && h > 0) sum += h;
    });
    if (document.getElementById("co-lunch").checked) sum += 0.5;
    return sum;
  }

  function coEntryCount() {
    var n = ckOutCtx ? (ckOutCtx.existingCount || 0) : 0;
    document.querySelectorAll("#co-entries .co-entry").forEach(function (row) {
      var h = parseFloat(row.querySelector(".co-hours").value);
      if (!isNaN(h) && h > 0) n += 1;
    });
    return n;
  }

  function coRecalc() {
    if (!ckOutCtx) return;
    var allocated = coAllocated();
    var remaining = ckOutCtx.elapsed - allocated;
    var tally = document.getElementById("co-tally");
    var finish = document.getElementById("co-finish");
    if (coEntryCount() === 0) {
      // At least one entry is required to clock out (Alex, 2026-11-11).
      tally.textContent = "Log at least one job entry to clock out";
      tally.classList.remove("ok");
      finish.disabled = true;
    } else if (allocated < ckOutCtx.elapsed * 0.3 - 0.01) {
      // At least 30% of the shift must be accounted for (Alex, 2026-11-13) —
      // one token entry against a full day no longer gets you out.
      tally.textContent = "Only " + fmtDur(allocated) + " of " + fmtDur(ckOutCtx.elapsed) +
        " logged — log at least " + fmtDur(ckOutCtx.elapsed * 0.3) +
        " (30% of the shift) to clock out";
      tally.classList.remove("ok");
      finish.disabled = true;
    } else if (Math.abs(remaining) <= 0.25) {
      tally.innerHTML = "&#10003; Day accounted for — " + fmtDur(allocated) + " of " + fmtDur(ckOutCtx.elapsed);
      tally.classList.add("ok");
      finish.disabled = false;
    } else if (remaining > 0) {
      // Unaccounted time no longer blocks clock-out (Alex, 2026-11-10) —
      // the gap just shows in the tally; payroll sees the punch either way.
      tally.textContent = fmtDur(remaining) + " unaccounted — that's fine, you can clock out";
      tally.classList.remove("ok");
      finish.disabled = false;
    } else {
      tally.textContent = fmtDur(-remaining) + " over the shift — trim the hours";
      tally.classList.remove("ok");
      finish.disabled = true;
    }
  }

  document.getElementById("co-add-job").addEventListener("click", function () { coAddRow("job"); });
  document.getElementById("co-add-drive").addEventListener("click", function () { coAddRow("drive"); });
  document.getElementById("co-parse-btn").addEventListener("click", coApplyDictation);
  coSetupMic();
  document.getElementById("co-lunch").addEventListener("change", coRecalc);
  document.getElementById("co-out-time").addEventListener("change", coOutTimeChanged);
  document.getElementById("co-cancel").addEventListener("click", function () {
    ckOutCtx = null;
    renderMainCard();
    showClockCard("main");
  });

  document.getElementById("co-finish").addEventListener("click", async function () {
    if (!ckOutCtx) return;
    var finishBtn = document.getElementById("co-finish");
    var coErr = document.getElementById("co-error");
    coErr.hidden = true;

    var entries = [];
    var bad = null;
    document.querySelectorAll("#co-entries .co-entry").forEach(function (row) {
      var h = parseFloat(row.querySelector(".co-hours").value);
      if (isNaN(h) || h <= 0) return; // empty row — ignored
      if (row.getAttribute("data-kind") === "drive") {
        entries.push({
          person: ckOutCtx.person, date: ckOutCtx.workDate,
          job_name: "Drive time",
          location: row.querySelector(".co-loc").value.trim() || null,
          description: "Drive time",
          hours: h, status: "finished", photo_urls: []
        });
      } else {
        var job = row.querySelector(".co-job").value.trim();
        var desc = row.querySelector(".co-desc").value.trim();
        if (!job || !desc) { bad = "Each job needs a name and a line about what you did."; return; }
        var seg = row.querySelector(".co-status-seg .seg-btn.is-active");
        entries.push({
          person: ckOutCtx.person, date: ckOutCtx.workDate,
          job_name: job,
          location: row.querySelector(".co-loc").value.trim() || null,
          description: desc,
          hours: h,
          status: seg ? seg.getAttribute("data-costatus") : "finished",
          photo_urls: []
        });
      }
    });
    if (bad) {
      coErr.textContent = bad;
      coErr.hidden = false;
      return;
    }
    if (entries.length === 0 && !(ckOutCtx.existingCount > 0)) {
      coErr.textContent = "Log at least one job entry to clock out.";
      coErr.hidden = false;
      return;
    }
    if (coAllocated() < ckOutCtx.elapsed * 0.3 - 0.01) {
      coErr.textContent = "Log at least 30% of the shift (" +
        fmtDur(ckOutCtx.elapsed * 0.3) + ") before clocking out.";
      coErr.hidden = false;
      return;
    }

    finishBtn.disabled = true;
    finishBtn.textContent = "Clocking out…";
    var outRow = {
      person: ckOutCtx.person, kind: "out",
      punched_at: ckOutCtx.outAt.toISOString(),
      // A fixed previous-day shift is a corrected punch (Alex, 2026-11-13).
      manual: !!ckOutCtx.stale, lat: null, lng: null
    };
    var saved = true;
    try {
      var geo = await getGeo();
      if (geo) { outRow.lat = geo.lat; outRow.lng = geo.lng; }
      if (entries.length) {
        var r = await db.from("crew_logs").insert(entries);
        if (r.error) throw r.error;
      }
      var rp = await db.from("clock_punches").insert(outRow);
      if (rp.error) throw rp.error;
    } catch (e) {
      outboxAdd({ type: "clockout", punch: outRow, entries: entries });
      saved = false;
    }
    lsSet(LS_SHIFT, null);
    ckOpenPunch = { kind: "out", punched_at: outRow.punched_at, person: ckOutCtx.person };
    document.getElementById("clock-done-title").textContent = "Clocked out";
    document.getElementById("clock-done-sub").textContent = ckOutCtx.stale
      ? firstName(ckOutCtx.person) + " — " + fmtDay(ckOutCtx.inAt.toISOString()) +
        "'s shift is fixed and closed. " +
        (saved ? "You can clock in for today now."
               : "No signal — saved on this phone, will sync on its own.")
      : firstName(ckOutCtx.person) + " — " + fmtDur(ckOutCtx.elapsed) + " today. " +
        (saved ? "Hours are in." : "No signal — saved on this phone, will sync on its own.");
    ckOutCtx = null;
    finishBtn.textContent = "Finish clock out";
    showClockCard("done");
  });

  /* === DAY TALK PARSER (pure functions — no DOM, unit-testable) === */

  function dayTalkNormalize(text) {
    var ones = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
    var tens = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
    var t = " " + String(text || "").toLowerCase() + " ";
    // "an hour and a half" / "a hour and a half"
    t = t.replace(/\b(?:an|a)\s+hour\s+and\s+a\s+half\b/g, " 1.5 hours ");
    // "two and a half hours", "1 and a half hours"
    t = t.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+(?:\.\d+)?)\s+and\s+a\s+half\s+hours?\b/g, function (m, n) {
      var v = ones[n] !== undefined ? ones[n] : parseFloat(n);
      return " " + (v + 0.5) + " hours ";
    });
    t = t.replace(/\bhour and a half\b/g, " 1.5 hours ");
    t = t.replace(/\bhalf\s+(?:an\s+)?hour\b/g, " 0.5 hours ");
    t = t.replace(/\bquarter\s+(?:of\s+an\s+)?hour\b/g, " 0.25 hours ");
    t = t.replace(/\ba\s+couple\s+(?:of\s+)?hours?\b/g, " 2 hours ");
    t = t.replace(/\ban\s+hour\b/g, " 1 hours ");
    t = t.replace(/\ban\s+minute\b/g, " 1 minutes ");
    // compound tens: "forty five minutes" -> "45 minutes"
    t = t.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(one|two|three|four|five|six|seven|eight|nine)\b/g, function (m, a, b) {
      return " " + (tens[a] + ones[b]) + " ";
    });
    // single number words in front of a time unit
    t = t.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b(?=\s*(?:hours?|hrs?|minutes?|mins?)\b)/g, function (m) {
      return ones[m] !== undefined ? String(ones[m]) : String(tens[m]);
    });
    return t;
  }

  function dayTalkSplit(norm) {
    var marked = norm.replace(/\bthen\b/g, "\u0001").replace(/\band\s+(?=(?:spent|did|drove|driving|drive|worked|went|took)\b)/g, "\u0001");
    var clauses = [], cur = "";
    function isDigit(ch) { return ch >= "0" && ch <= "9"; }
    for (var i = 0; i < marked.length; i++) {
      var ch = marked.charAt(i);
      var isSep = ch === ";" || ch === "\n" || ch === "," || ch === "\u0001" ||
        (ch === "." && !(isDigit(marked.charAt(i - 1)) && isDigit(marked.charAt(i + 1))));
      if (isSep) { clauses.push(cur); cur = ""; }
      else cur += ch;
    }
    clauses.push(cur);
    return clauses.map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function dayTalkDuration(clause) {
    var total = 0, found = false;
    var rest = clause.replace(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/g, function (m, n) {
      total += parseFloat(n); found = true; return " ";
    });
    rest = rest.replace(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/g, function (m, n) {
      total += parseFloat(n) / 60; found = true; return " ";
    });
    if (!found) return null;
    return { hours: Math.round(total * 4) / 4, rest: rest };
  }

  function dayTalkClean(s) {
    return String(s || "")
      .replace(/\b(spent|spend|did|was|were|worked|working|went|got|had|i|we|and|then|there|today)\b/gi, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
      .trim();
  }

  function dayTalkSentence(s) {
    var out = dayTalkClean(s);
    if (!out) return "";
    return out.charAt(0).toUpperCase() + out.slice(1);
  }

  var DAYTALK_VERBS = { doing: 1, working: 1, fixing: 1, replacing: 1, installing: 1, repairing: 1, cleaning: 1, running: 1, using: 1, snaking: 1, jetting: 1, digging: 1, swapping: 1, pulling: 1, unclogging: 1, checking: 1, testing: 1, on: 1, for: 1 };

  // Split "phoenix plaza fixing the leak" -> { location: "phoenix plaza", work: "fixing the leak" }
  function dayTalkSplitLocWork(text) {
    var tokens = String(text || "").trim().split(/\s+/).filter(Boolean);
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i].replace(/[^a-z0-9]/g, "");
      if (DAYTALK_VERBS[tok]) {
        var workTokens = (tok === "on" || tok === "for") ? tokens.slice(i + 1) : tokens.slice(i);
        return { location: tokens.slice(0, i).join(" "), work: workTokens.join(" ") };
      }
    }
    return { location: tokens.join(" "), work: "" };
  }

  // Returns { jobs: [{hours, location, jobName, description}], drives: [{hours, location}], lunch: bool }
  function dayTalkParse(text) {
    var clauses = dayTalkSplit(dayTalkNormalize(text));
    var out = { jobs: [], drives: [], lunch: false };

    clauses.forEach(function (raw) {
      var clause = raw;
      var hadLunchMention = false;
      if (/\blunch\b/.test(clause)) {
        hadLunchMention = true;
        if (!/\b(no|skipped|skip|without)\b[^.]*\blunch\b/.test(clause) && !/\bdidn'?t\b[^.]*\blunch\b/.test(clause)) {
          out.lunch = true;
        }
        clause = clause.replace(/\b(took|take|taking|had|have|my|a|the|short)?\s*lunch\s*(break)?\b/g, " ").trim();
        if (!clause) return;
      }
      var dur = dayTalkDuration(clause);
      if (!dur) {
        // Lunch-only leftovers ("no", "skipped") are not job detail — drop them.
        if (hadLunchMention && dayTalkClean(clause).split(" ").filter(Boolean).length <= 2) return;
        // No time mentioned — tack the detail onto the previous job's description.
        var frag = dayTalkSentence(clause);
        if (frag && out.jobs.length) {
          var prev = out.jobs[out.jobs.length - 1];
          prev.description = (prev.description + ". " + frag).slice(0, 300);
        }
        return;
      }
      var rest = dur.rest;
      if (/\b(driv\w*|drove|commut\w*|travel\w*)\b/.test(rest)) {
        var locOut = "";
        var m = rest.match(/\bfrom\s+(.+?)\s+to\s+(.+)$/);
        if (m) locOut = dayTalkSentence(m[1].trim()) + " to " + m[2].trim();
        else {
          var cleanedDrive = dayTalkClean(rest.replace(/\b(driv\w*|drove|commut\w*|travel\w*|back|time)\b/g, " "));
          locOut = dayTalkSentence(cleanedDrive.replace(/^to\s+/, ""));
        }
        out.drives.push({ hours: dur.hours, location: locOut.slice(0, 120) });
        return;
      }
      // job clause: pull out the location after "at" (or scan the whole clause)
      var location = "", workText = "";
      var atIdx = rest.search(/\bat\b\s+/);
      var scanText = atIdx >= 0 ? rest.slice(atIdx).replace(/^\s*at\s+/, "") : rest;
      var split = dayTalkSplitLocWork(scanText);
      if (atIdx >= 0) location = dayTalkSentence(split.location);
      workText = split.work;
      var desc = dayTalkSentence(rest);
      var jobName = "";
      if (workText && dayTalkClean(workText)) {
        jobName = dayTalkSentence(workText);
        var words = jobName.split(" ");
        if (words.length > 8) jobName = words.slice(0, 8).join(" ");
      } else if (atIdx < 0 && split.location && dayTalkClean(split.location)) {
        jobName = dayTalkSentence(split.location).split(" ").slice(0, 8).join(" ");
      } else if (location) {
        jobName = "Work at " + location;
      } else {
        jobName = desc.split(" ").slice(0, 8).join(" ");
      }
      if (!desc) desc = jobName;
      if (!jobName && !desc && !location) return; // stray duration with no content
      out.jobs.push({
        hours: dur.hours,
        location: location.slice(0, 120),
        jobName: jobName.slice(0, 120),
        description: desc.slice(0, 300)
      });
    });
    return out;
  }

  /* === END DAY TALK PARSER === */

  /* In-app mic for the talk-about-your-day box (Web Speech API).
     The button only appears when the browser supports it (Safari on
     iPhone, Chrome on Android). Where it doesn't, the box still works
     with the keyboard's own dictation mic. Speech goes into the same
     textarea the parser reads, so Sort it works the same either way. */
  function coSetupMic() {
    var btn = document.getElementById("co-mic-btn");
    var ta = document.getElementById("co-dictate-text");
    var msg = document.getElementById("co-parse-msg");
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !btn || !ta) return; // unsupported: button stays hidden
    btn.hidden = false;

    var rec = null;
    var listening = false;
    var baseText = "";
    var sessionFinal = "";

    function setBtn() {
      btn.innerHTML = listening ? "&#128308; Listening&hellip; tap to stop" : "&#127908; Tap to talk";
      btn.classList.toggle("co-mic-live", listening);
    }
    function showMsg(t) { if (msg) { msg.textContent = t; msg.hidden = false; } }

    function start() {
      rec = new SR();
      rec.lang = "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      baseText = ta.value.replace(/\s+$/, "");
      sessionFinal = "";
      rec.onresult = function (ev) {
        var interim = "";
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var r = ev.results[i];
          if (r.isFinal) sessionFinal += r[0].transcript;
          else interim += r[0].transcript;
        }
        var head = baseText ? baseText + " " : "";
        ta.value = (head + sessionFinal + interim).slice(0, 2000);
      };
      rec.onerror = function (ev) {
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
          listening = false;
          setBtn();
          showMsg("Mic is blocked for this site. Allow microphone access in your browser settings, or tap the box and use the mic on your keyboard instead.");
        }
        // "no-speech" / "aborted": let onend handle state.
      };
      rec.onend = function () {
        if (listening) {
          // Some browsers stop after a pause; keep going until tapped off.
          try { rec.start(); return; } catch (e) { /* fall through */ }
        }
        setBtn();
      };
      try {
        rec.start();
        listening = true;
        setBtn();
        showMsg("Listening — talk about your day, then tap the mic again to stop and hit Sort it.");
      } catch (e) {
        showMsg("Couldn't start the mic. Tap the box and use the mic on your keyboard instead.");
      }
    }

    btn.addEventListener("click", function () {
      if (listening) {
        listening = false;
        setBtn();
        if (rec) { try { rec.stop(); } catch (e) { /* already stopped */ } }
      } else {
        start();
      }
    });
  }

  function coApplyDictation() {
    var ta = document.getElementById("co-dictate-text");
    var msg = document.getElementById("co-parse-msg");
    function showMsg(t) { msg.textContent = t; msg.hidden = false; }
    var parsed = dayTalkParse(ta.value);
    var count = parsed.jobs.length + parsed.drives.length;
    if (!count && !parsed.lunch) {
      showMsg("Couldn't pick any hours out of that. Try: \u201c2 hours at the Plaza fixing a leak. 45 minutes driving. Took lunch.\u201d");
      return;
    }
    // If every row is still blank, replace them; otherwise append.
    var rows = Array.prototype.slice.call(document.querySelectorAll("#co-entries .co-entry"));
    var allEmpty = rows.every(function (r) {
      var h = r.querySelector(".co-hours").value;
      var j = r.querySelector(".co-job");
      var d = r.querySelector(".co-desc");
      var l = r.querySelector(".co-loc");
      return !h && !(j && j.value.trim()) && !(d && d.value.trim()) && !(l && l.value.trim());
    });
    if (allEmpty) rows.forEach(function (r) { r.remove(); });
    parsed.jobs.forEach(function (j) {
      coAddRow("job", { hours: j.hours, loc: j.location, job: j.jobName, desc: j.description });
    });
    parsed.drives.forEach(function (d) {
      coAddRow("drive", { hours: d.hours, loc: d.location });
    });
    if (parsed.lunch) document.getElementById("co-lunch").checked = true;
    coRecalc();
    var parts = [];
    if (parsed.jobs.length) parts.push(parsed.jobs.length + (parsed.jobs.length === 1 ? " job" : " jobs"));
    if (parsed.drives.length) parts.push("drive time");
    if (parsed.lunch) parts.push("lunch");
    showMsg("Sorted: " + parts.join(", ") + ". Check the list over \u2014 fix anything it heard wrong, then Finish.");
  }

  /* ---------- set PIN (first time) ---------- */
  function fillMemberSelects() {
    loadMembers().then(function (members) {
      var opts = members.map(function (m) {
        return '<option value="' + esc(m.person) + '">' + esc(m.person) + "</option>";
      }).join("");
      document.getElementById("setup-person").innerHTML = opts;
      document.getElementById("p_person").innerHTML = opts;
      document.getElementById("h_person").innerHTML = opts;
      document.getElementById("hours-person").innerHTML = opts;
    }).catch(function () { /* offline — selects stay empty */ });
  }

  document.getElementById("pin-setup-link").addEventListener("click", function () {
    fillMemberSelects();
    var err = document.getElementById("setup-error");
    err.hidden = true;
    showClockCard("setup");
  });
  document.getElementById("setup-cancel").addEventListener("click", function () {
    showClockCard("pin");
  });
  document.getElementById("setup-save").addEventListener("click", async function () {
    var err = document.getElementById("setup-error");
    var person = document.getElementById("setup-person").value;
    var p1 = document.getElementById("setup-pin").value.trim();
    var p2 = document.getElementById("setup-pin2").value.trim();
    function fail(msg) { err.textContent = msg; err.hidden = false; }
    if (!person) { fail("Pick your name."); return; }
    if (!/^\d{4}$/.test(p1)) { fail("PIN must be 4 digits."); return; }
    if (p1 !== p2) { fail("The two PINs don't match."); return; }
    try {
      var members = await loadMembers();
      for (var i = 0; i < members.length; i++) {
        if (members[i].person !== person && members[i].pin_hash) {
          if ((await pinHashFor(members[i].person, p1)) === members[i].pin_hash) {
            fail("That PIN is taken — pick a different one.");
            return;
          }
        }
      }
      var h = await pinHashFor(person, p1);
      var res = await db.from("crew_members").update({ pin_hash: h }).eq("person", person);
      if (res.error) throw res.error;
      ckMembers = null;
      document.getElementById("setup-pin").value = "";
      document.getElementById("setup-pin2").value = "";
      await identify(person);
    } catch (e) {
      fail("Couldn't save — check your signal and try again.");
    }
  });

  /* ---------- fix a punch (manual) ---------- */
  var punchBackdrop = document.getElementById("punch-backdrop");
  var punchKind = "in";

  function openPunchSheet() {
    fillMemberSelects();
    document.getElementById("punch-error").hidden = true;
    document.getElementById("punch-ok").hidden = true;
    document.getElementById("punch-today").innerHTML = "";
    var now = new Date();
    document.getElementById("p_when").value =
      dateStrOf(now) + "T" + pad(now.getHours()) + ":" + pad(now.getMinutes());
    punchBackdrop.hidden = false;
  }
  function closePunchSheet() { punchBackdrop.hidden = true; }

  document.getElementById("pin-manual-link").addEventListener("click", openPunchSheet);
  document.getElementById("clock-manual-link2").addEventListener("click", openPunchSheet);
  document.getElementById("punch-close").addEventListener("click", closePunchSheet);
  punchBackdrop.addEventListener("click", function (e) {
    if (e.target === punchBackdrop) closePunchSheet();
  });
  document.querySelectorAll("[data-pkind]").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("[data-pkind]").forEach(function (x) {
        x.classList.remove("is-active");
        x.setAttribute("aria-pressed", "false");
      });
      b.classList.add("is-active");
      b.setAttribute("aria-pressed", "true");
      punchKind = b.getAttribute("data-pkind");
    });
  });

  async function loadTodayPunches() {
    var person = document.getElementById("p_person").value;
    var pin = document.getElementById("p_pin").value.trim();
    var box = document.getElementById("punch-today");
    if (!person || pin.length !== 4) { box.innerHTML = ""; return; }
    var okPin = false;
    try { okPin = await verifyPin(person, pin); } catch (e) { /* offline */ }
    if (!okPin) { box.innerHTML = ""; return; }
    var start = new Date(); start.setHours(0, 0, 0, 0);
    var res = await db.from("clock_punches")
      .select("id,kind,punched_at,manual")
      .eq("person", person)
      .gte("punched_at", start.toISOString())
      .order("punched_at", { ascending: true });
    if (res.error || !res.data || !res.data.length) {
      box.innerHTML = '<p class="sub">No punches yet today.</p>';
      return;
    }
    box.innerHTML = '<p class="f-label">Today\'s punches — fix a time</p>' + res.data.map(function (p) {
      var d = new Date(p.punched_at);
      var val = dateStrOf(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
      return '<div class="punch-row">' +
        '<span class="punch-kind">' + (p.kind === "in" ? "In" : "Out") + (p.manual ? " (manual)" : "") + "</span>" +
        '<input type="datetime-local" class="punch-time" data-pid="' + p.id + '" value="' + val + '">' +
        '<button type="button" class="btn-outline btn-small punch-fix" data-pid="' + p.id + '">Fix</button>' +
        "</div>";
    }).join("");
    box.querySelectorAll(".punch-fix").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var id = btn.getAttribute("data-pid");
        var input = box.querySelector('.punch-time[data-pid="' + id + '"]');
        var err = document.getElementById("punch-error");
        var okEl = document.getElementById("punch-ok");
        if (!input.value) return;
        var upd = await db.from("clock_punches")
          .update({ punched_at: new Date(input.value).toISOString(), manual: true })
          .eq("id", Number(id));
        if (upd.error) {
          err.textContent = "Couldn't fix that punch — try again.";
          err.hidden = false;
          return;
        }
        err.hidden = true;
        okEl.textContent = "Punch fixed.";
        okEl.hidden = false;
        if (ckPerson === person) {
          ckOpenPunch = await latestPunch(person);
          var shift = lsGet(LS_SHIFT);
          if (shift && ckOpenPunch && ckOpenPunch.kind === "in") {
            lsSet(LS_SHIFT, { person: person, since: ckOpenPunch.punched_at });
          }
          if (!ckMainCard.hidden) renderMainCard();
        }
      });
    });
  }
  document.getElementById("p_person").addEventListener("change", loadTodayPunches);
  document.getElementById("p_pin").addEventListener("input", loadTodayPunches);

  document.getElementById("punch-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var err = document.getElementById("punch-error");
    var okEl = document.getElementById("punch-ok");
    err.hidden = true;
    okEl.hidden = true;
    var person = document.getElementById("p_person").value;
    var pin = document.getElementById("p_pin").value.trim();
    var when = document.getElementById("p_when").value;
    function fail(msg) { err.textContent = msg; err.hidden = false; }
    if (!person) { fail("Pick your name."); return; }
    if (!/^\d{4}$/.test(pin)) { fail("Enter your 4-digit PIN."); return; }
    if (!when) { fail("Pick the date and time."); return; }
    var okPin = false;
    try { okPin = await verifyPin(person, pin); } catch (e2) { /* handled below */ }
    if (!okPin) { fail("That PIN doesn't match " + firstName(person) + "."); return; }
    var row = {
      person: person, kind: punchKind,
      punched_at: new Date(when).toISOString(),
      manual: true, lat: null, lng: null,
      note: document.getElementById("p_note").value.trim() || null
    };
    var res = await db.from("clock_punches").insert(row);
    if (res.error) { fail("Couldn't save — check your signal and try again."); return; }
    okEl.textContent = "Punch added (" + (punchKind === "in" ? "clock in" : "clock out") +
      ", " + fmtTime(row.punched_at) + ").";
    okEl.hidden = false;
    document.getElementById("p_note").value = "";
    if (ckPerson === person) {
      try {
        ckOpenPunch = await latestPunch(person);
        if (!ckMainCard.hidden) renderMainCard();
      } catch (e3) { /* keep old state */ }
    }
    loadTodayPunches();
  });

  /* ---------- hours tab: weekly clock punches + fix any day ---------- */
  var hoursList = document.getElementById("hours-list");
  var hoursTitle = document.getElementById("hours-title");
  var hoursWeekStart = null; // Date, local Sunday 00:00 of the shown week
  var hoursPerson = null;    // set only after that person's PIN verifies
  var DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function sundayOf(d) {
    var s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    s.setDate(s.getDate() - s.getDay());
    return s;
  }

  async function loadHoursWeek() {
    var gate = document.getElementById("hours-gate");
    var main = document.getElementById("hours-main");
    if (!hoursPerson) {
      // Locked: nobody sees any hours until they unlock with their own PIN.
      fillMemberSelects();
      gate.hidden = false;
      main.hidden = true;
      return;
    }
    gate.hidden = true;
    main.hidden = false;
    if (!hoursWeekStart) hoursWeekStart = sundayOf(new Date());
    var start = new Date(hoursWeekStart);
    var end = new Date(hoursWeekStart); end.setDate(end.getDate() + 7);
    var lastDay = new Date(hoursWeekStart); lastDay.setDate(lastDay.getDate() + 6);
    hoursTitle.textContent =
      MONTHS_SHORT[start.getMonth()] + " " + start.getDate() + " \u2013 " +
      MONTHS_SHORT[lastDay.getMonth()] + " " + lastDay.getDate() + ", " + lastDay.getFullYear();
    hoursList.innerHTML = '<div class="card"><p class="sub">Loading hours\u2026</p></div>';

    var members = [];
    try { members = await loadMembers(); } catch (e) { /* offline */ }
    var res = await db.from("clock_punches")
      .select("id,person,kind,punched_at,manual")
      .eq("person", hoursPerson)
      .gte("punched_at", start.toISOString())
      .lt("punched_at", end.toISOString())
      .order("person", { ascending: true })
      .order("punched_at", { ascending: true });
    if (res.error) {
      hoursList.innerHTML = '<div class="card"><p class="sub">Couldn\u2019t load hours \u2014 check your signal and reopen this tab.</p></div>';
      return;
    }

    // Group punches per person, pair in\u2192out in time order, bucket by the
    // clock-in's local date (an orphan out lands on its own date).
    var byPerson = {};
    (res.data || []).forEach(function (p) {
      (byPerson[p.person] = byPerson[p.person] || []).push(p);
    });
    var names = members.map(function (m) { return m.person; });
    Object.keys(byPerson).forEach(function (n) { if (names.indexOf(n) === -1) names.push(n); });
    names = names.filter(function (n) { return n === hoursPerson; });

    var todayStr = dateStrOf(new Date());
    var html = "";
    names.forEach(function (person) {
      var segsByDay = {}; // dateStr -> [{in, out}]
      var open = null;
      var lastClosed = null;
      (byPerson[person] || []).forEach(function (p) {
        if (p.kind === "in") {
          if (open) pushSeg(segsByDay, open, null);
          open = p;
        } else if (open) {
          pushSeg(segsByDay, open, p); lastClosed = p; open = null;
        } else if (lastClosed && lastClosed.punched_at === p.punched_at) {
          // duplicate out-punch at the same time as the last one — ignore it
        } else {
          pushSeg(segsByDay, null, p);
        }
      });
      if (open) pushSeg(segsByDay, open, null);

      var weekSecs = 0;
      var rows = "";
      for (var i = 0; i < 7; i++) {
        var d = new Date(hoursWeekStart); d.setDate(d.getDate() + i);
        var ds = dateStrOf(d);
        var segs = segsByDay[ds] || [];
        var daySecs = 0;
        var segHtml = segs.map(function (s) {
          if (s.in && s.out) {
            daySecs += (new Date(s.out.punched_at) - new Date(s.in.punched_at)) / 1000;
            return fmtTime(s.in.punched_at) + " \u2192 " + fmtTime(s.out.punched_at) +
              (s.in.manual || s.out.manual ? ' <span class="hours-manual">(manual)</span>' : "");
          }
          if (s.in) {
            return fmtTime(s.in.punched_at) + " \u2192 \u2014" +
              (ds === todayStr ? ' <span class="hours-open">still in</span>' : ' <span class="hours-open">no clock-out</span>');
          }
          return "\u2014 \u2192 " + fmtTime(s.out.punched_at) + ' <span class="hours-open">no clock-in</span>';
        }).join("<br>");
        weekSecs += daySecs;
        rows += '<div class="hours-row">' +
          '<span class="hours-day">' + DAYS_SHORT[d.getDay()] + " " + MONTHS_SHORT[d.getMonth()] + " " + d.getDate() + "</span>" +
          '<span class="hours-times">' + (segHtml || "\u2014") + "</span>" +
          '<span class="hours-total">' + (daySecs ? fmtDur(daySecs / 3600) : "") + "</span>" +
          '<button type="button" class="btn-outline btn-small hours-fix" data-person="' + esc(person) + '" data-date="' + ds + '">Fix</button>' +
          "</div>";
      }
      html += '<div class="card hours-card">' +
        '<div class="day-panel-head"><h3><span class="person-chip ' + personClass(person) + '">' + esc(person) + '</span></h3>' +
        '<span class="hours-week-total">Week: ' + fmtDur(weekSecs / 3600) + "</span></div>" +
        rows + "</div>";
    });
    hoursList.innerHTML = html || '<div class="card"><p class="sub">No crew members yet.</p></div>';
    hoursList.querySelectorAll(".hours-fix").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openHoursSheet(btn.getAttribute("data-person"), btn.getAttribute("data-date"));
      });
    });

    function pushSeg(map, inP, outP) {
      var key = dateStrOf(new Date((inP || outP).punched_at));
      (map[key] = map[key] || []).push({ in: inP, out: outP });
    }
  }
  document.getElementById("prev-week").addEventListener("click", function () {
    hoursWeekStart.setDate(hoursWeekStart.getDate() - 7); loadHoursWeek();
  });
  document.getElementById("next-week").addEventListener("click", function () {
    hoursWeekStart.setDate(hoursWeekStart.getDate() + 7); loadHoursWeek();
  });

  /* ----- hours gate: unlock with your own PIN, see only your hours ----- */
  document.getElementById("hours-gate-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var err = document.getElementById("hours-gate-error");
    var person = document.getElementById("hours-person").value;
    var pin = document.getElementById("hours-pin").value.trim();
    function fail(msg) { err.textContent = msg; err.hidden = false; }
    err.hidden = true;
    if (!person) { fail("Pick your name."); return; }
    if (!/^\d{4}$/.test(pin)) { fail("Enter your 4-digit PIN."); return; }
    var okPin = false;
    try { okPin = await verifyPin(person, pin); } catch (e2) { /* offline — fail below */ }
    if (!okPin) {
      fail("That PIN doesn\u2019t match " + firstName(person) +
        ". If you haven\u2019t set a PIN yet, set one on the Clock tab first.");
      return;
    }
    hoursPerson = person;
    document.getElementById("hours-pin").value = "";
    loadHoursWeek();
  });
  document.getElementById("hours-lock").addEventListener("click", function () {
    hoursPerson = null;
    document.getElementById("hours-pin").value = "";
    loadHoursWeek();
  });

  /* ----- the sheet itself: opened by the "My clock hours" button ----- */
  var hoursViewBackdrop = document.getElementById("hoursview-backdrop");
  function openHoursView() {
    hoursViewBackdrop.hidden = false;
    loadHoursWeek();
  }
  function closeHoursView() {
    hoursViewBackdrop.hidden = true;
    // Re-lock on close so the next person at this phone starts at the PIN gate.
    hoursPerson = null;
    document.getElementById("hours-pin").value = "";
  }
  document.getElementById("my-hours-btn").addEventListener("click", openHoursView);
  document.getElementById("hoursview-close").addEventListener("click", closeHoursView);
  hoursViewBackdrop.addEventListener("click", function (e) {
    if (e.target === hoursViewBackdrop) closeHoursView();
  });

  /* ----- fix-hours sheet: edit one person's punches for one day ----- */
  var hoursBackdrop = document.getElementById("hours-backdrop");
  var hoursCtx = { person: "", dateStr: "" };
  var hoursKind = "in";

  function openHoursSheet(person, dateStr) {
    fillMemberSelects();
    hoursCtx = { person: person, dateStr: dateStr };
    document.getElementById("hours-sheet-title").textContent =
      "Fix hours \u2014 " + firstName(person) + ", " + longDate(dateStr);
    var sel = document.getElementById("h_person");
    sel.value = person;
    document.getElementById("h_pin").value = "";
    document.getElementById("hours-error").hidden = true;
    document.getElementById("hours-ok").hidden = true;
    document.getElementById("hours-day-list").innerHTML =
      '<p class="sub">Enter your PIN to see and fix that day\u2019s punches.</p>';
    document.getElementById("h_when").value = dateStr + "T07:00";
    document.getElementById("h_note").value = "";
    hoursBackdrop.hidden = false;
  }
  function closeHoursSheet() { hoursBackdrop.hidden = true; }
  document.getElementById("hours-close").addEventListener("click", closeHoursSheet);
  hoursBackdrop.addEventListener("click", function (e) {
    if (e.target === hoursBackdrop) closeHoursSheet();
  });
  document.querySelectorAll("[data-hkind]").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("[data-hkind]").forEach(function (x) {
        x.classList.remove("is-active");
        x.setAttribute("aria-pressed", "false");
      });
      b.classList.add("is-active");
      b.setAttribute("aria-pressed", "true");
      hoursKind = b.getAttribute("data-hkind");
    });
  });

  async function loadHoursDayList() {
    var person = document.getElementById("h_person").value;
    var pin = document.getElementById("h_pin").value.trim();
    var box = document.getElementById("hours-day-list");
    hoursCtx.person = person;
    if (!person || pin.length !== 4) {
      box.innerHTML = '<p class="sub">Enter your PIN to see and fix that day\u2019s punches.</p>';
      return;
    }
    var okPin = false;
    try { okPin = await verifyPin(person, pin); } catch (e) { /* offline */ }
    if (!okPin) {
      box.innerHTML = '<p class="sub">That PIN doesn\u2019t match ' + esc(firstName(person)) + ".</p>";
      return;
    }
    var parts = hoursCtx.dateStr.split("-");
    var start = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var end = new Date(start); end.setDate(end.getDate() + 1);
    var res = await db.from("clock_punches")
      .select("id,kind,punched_at,manual")
      .eq("person", person)
      .gte("punched_at", start.toISOString())
      .lt("punched_at", end.toISOString())
      .order("punched_at", { ascending: true });
    if (res.error || !res.data || !res.data.length) {
      box.innerHTML = '<p class="sub">No punches this day \u2014 add the missed ones below.</p>';
      return;
    }
    box.innerHTML = '<p class="f-label">That day\u2019s punches \u2014 fix a time</p>' + res.data.map(function (p) {
      var d = new Date(p.punched_at);
      var val = dateStrOf(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
      return '<div class="punch-row">' +
        '<span class="punch-kind">' + (p.kind === "in" ? "In" : "Out") + (p.manual ? " (manual)" : "") + "</span>" +
        '<input type="datetime-local" class="punch-time" data-hpid="' + p.id + '" value="' + val + '">' +
        '<button type="button" class="btn-outline btn-small hours-punch-fix" data-hpid="' + p.id + '">Fix</button>' +
        "</div>";
    }).join("");
    box.querySelectorAll(".hours-punch-fix").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var id = btn.getAttribute("data-hpid");
        var input = box.querySelector('.punch-time[data-hpid="' + id + '"]');
        var err = document.getElementById("hours-error");
        var okEl = document.getElementById("hours-ok");
        if (!input.value) return;
        var upd = await db.from("clock_punches")
          .update({ punched_at: new Date(input.value).toISOString(), manual: true })
          .eq("id", Number(id));
        if (upd.error) {
          err.textContent = "Couldn\u2019t fix that punch \u2014 try again.";
          err.hidden = false;
          return;
        }
        err.hidden = true;
        okEl.textContent = "Punch fixed.";
        okEl.hidden = false;
        loadHoursDayList();
        loadHoursWeek();
      });
    });
  }
  document.getElementById("h_person").addEventListener("change", loadHoursDayList);
  document.getElementById("h_pin").addEventListener("input", loadHoursDayList);

  document.getElementById("hours-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var err = document.getElementById("hours-error");
    var okEl = document.getElementById("hours-ok");
    err.hidden = true;
    okEl.hidden = true;
    var person = document.getElementById("h_person").value;
    var pin = document.getElementById("h_pin").value.trim();
    var when = document.getElementById("h_when").value;
    function fail(msg) { err.textContent = msg; err.hidden = false; }
    if (!person) { fail("Pick your name."); return; }
    if (!/^\d{4}$/.test(pin)) { fail("Enter your 4-digit PIN."); return; }
    if (!when) { fail("Pick the date and time."); return; }
    var okPin = false;
    try { okPin = await verifyPin(person, pin); } catch (e2) { /* handled below */ }
    if (!okPin) { fail("That PIN doesn\u2019t match " + firstName(person) + "."); return; }
    var row = {
      person: person, kind: hoursKind,
      punched_at: new Date(when).toISOString(),
      manual: true, lat: null, lng: null,
      note: document.getElementById("h_note").value.trim() || null
    };
    var res = await db.from("clock_punches").insert(row);
    if (res.error) { fail("Couldn\u2019t save \u2014 check your signal and try again."); return; }
    okEl.textContent = "Punch added (" + (hoursKind === "in" ? "clock in" : "clock out") +
      ", " + fmtTime(row.punched_at) + ").";
    okEl.hidden = false;
    document.getElementById("h_note").value = "";
    loadHoursDayList();
    loadHoursWeek();
  });

  /* ---------- clock boot ---------- */
  (function bootClock() {
    renderClockBanner();
    showClockCard("pin");
    flushOutbox();
    window.addEventListener("online", flushOutbox);
    // If this phone was left clocked in, say so right away.
    var local = lsGet(LS_SHIFT);
    if (local && local.person) {
      ckBanner.innerHTML = "<strong>" + esc(firstName(local.person)) +
        "</strong> is clocked in on this phone since " + fmtTime(local.since) +
        " — enter your PIN to clock out.";
      ckBanner.hidden = false;
    }
  })();
})();
