/* ============================================================
   Dutton Plumbing — Daily Job Log (dark)
   Tabs: Log Job (form → INSERT) and Calendar (month heatmap,
   day panels, job detail sheets). Reads use the anon key
   (SELECT allowed via RLS); full-access work stays server-side.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- elements ---------- */
  var tabLog = document.getElementById("tab-log");
  var tabCal = document.getElementById("tab-cal");
  var viewLog = document.getElementById("view-log");
  var viewCal = document.getElementById("view-cal");
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
    var isLog = which === "log";
    tabLog.classList.toggle("is-active", isLog);
    tabCal.classList.toggle("is-active", !isLog);
    tabLog.setAttribute("aria-selected", isLog ? "true" : "false");
    tabCal.setAttribute("aria-selected", isLog ? "false" : "true");
    viewLog.hidden = !isLog;
    viewCal.hidden = isLog;
    if (!isLog && !calLoaded) loadMonth();
    window.scrollTo(0, 0);
  }
  tabLog.addEventListener("click", function () { showTab("log"); });
  tabCal.addEventListener("click", function () { showTab("cal"); });

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
          "Couldn't save — check your signal and tap + Log Job again. Your entry is still here.";
        formError.hidden = false;
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = "&#43; Log Job";
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
        '<p class="empty-day">Couldn&rsquo;t load — check your signal and reopen the Calendar tab.</p>';
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
      photosHtml;
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
    if (e.key === "Escape" && !backdrop.hidden) closeSheet();
  });
})();
