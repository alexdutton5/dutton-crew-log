/* ============================================================
   Dutton Plumbing — Daily Job Log
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
  var customerInput = document.getElementById("customer");
  var descriptionInput = document.getElementById("description");
  var hoursInput = document.getElementById("hours");

  var calGrid = document.getElementById("cal-grid");
  var calTitle = document.getElementById("cal-title");
  var prevBtn = document.getElementById("prev-month");
  var nextBtn = document.getElementById("next-month");
  var exportBtn = document.getElementById("export-btn");
  var dayPanel = document.getElementById("day-panel");
  var statHours = document.getElementById("stat-hours");
  var statJobs = document.getElementById("stat-jobs");

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
  var WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function firstName(person) {
    return String(person).split(" ")[0];
  }

  function personClass(person) {
    var f = firstName(person).toLowerCase();
    if (f === "kyle") return "kyle";
    if (f === "caleb") return "caleb";
    return "";
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
    return (Number.isInteger(n) ? n.toString() : n.toString()) + "h";
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
    if (!isLog && !calLoaded) {
      loadMonth();
    }
    window.scrollTo(0, 0);
  }
  tabLog.addEventListener("click", function () { showTab("log"); });
  tabCal.addEventListener("click", function () { showTab("cal"); });

  /* ---------- default date = today ---------- */
  dateInput.value = todayStr();

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
    var values = {};

    var personEl = form.querySelector('input[name="person"]:checked');
    if (!personEl) {
      errors.person = "Pick a name.";
    } else {
      values.person = personEl.value;
    }

    values.date = dateInput.value.trim();
    if (!values.date) errors.date = "Pick the date you worked.";

    values.customer = customerInput.value.trim();
    if (!values.customer) errors.customer = "Enter the customer or site.";

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
    submitBtn.innerHTML = "Sending&hellip;";

    try {
      var res = await db.from("crew_logs").insert({
        person: result.values.person,
        date: result.values.date,
        customer: result.values.customer,
        description: result.values.description,
        hours: result.values.hours
      });
      if (res.error) throw res.error;
      // Refresh the calendar cache if it's showing this entry's month.
      if (calLoaded) {
        var parts = result.values.date.split("-");
        if (Number(parts[0]) === calYear && Number(parts[1]) - 1 === calMonth) {
          loadMonth();
        }
      }
      showSuccess(result.values);
    } catch (err) {
      formError.textContent =
        "Couldn't save — check your signal and tap + Log Job again. Your entry is still here.";
      formError.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = "&#43; Log Job";
    }
  });

  function showSuccess(v) {
    document.getElementById("sum-name").textContent = v.person;
    document.getElementById("sum-date").textContent = v.date;
    document.getElementById("sum-customer").textContent = v.customer;
    document.getElementById("sum-hours").textContent =
      v.hours + (Number(v.hours) === 1 ? " hour" : " hours");
    formView.hidden = true;
    successView.hidden = false;
    window.scrollTo(0, 0);
  }

  anotherBtn.addEventListener("click", function () {
    customerInput.value = "";
    descriptionInput.value = "";
    hoursInput.value = "";
    clearErrors();
    formError.textContent = "";
    formError.hidden = true;
    successView.hidden = true;
    formView.hidden = false;
    window.scrollTo(0, 0);
    customerInput.focus();
  });

  /* ---------- calendar state ---------- */
  var now = new Date();
  var calYear = now.getFullYear();
  var calMonth = now.getMonth(); // 0-based
  var selectedDate = null;
  var monthEntries = []; // entries for the viewed month
  var byDate = {};       // date string -> [entries]

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
    var nm = calMonth + 1;
    var ny = calYear;
    if (nm > 11) { nm = 0; ny++; }
    var end = ny + "-" + pad(nm + 1) + "-01";

    calTitle.textContent = MONTHS[calMonth] + " " + calYear;
    calGrid.innerHTML = '<p class="empty-day">Loading&hellip;</p>';
    dayPanel.innerHTML = "";

    try {
      var res = await db
        .from("crew_logs")
        .select("id,person,date,customer,description,hours")
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
    monthEntries.forEach(function (e) {
      (byDate[e.date] = byDate[e.date] || []).push(e);
      totalHours += Number(e.hours) || 0;
    });

    statHours.textContent = Math.round(totalHours * 100) / 100;
    statJobs.textContent = monthEntries.length;

    renderGrid();
    // Auto-select today if viewing the current month.
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
      "</div><div class='cal-days'>";

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
        longDate(ds) + (list.length ? ", " + list.length + " jobs" : "") + '">' +
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
    var total = list.reduce(function (a, e) { return a + (Number(e.hours) || 0); }, 0);
    total = Math.round(total * 100) / 100;

    var html = '<div class="day-panel">' +
      '<div class="day-panel-head"><h3>' + esc(longDate(dateStr)) + "</h3>" +
      '<button type="button" class="copy-btn" id="copy-day">Copy for invoice</button></div>' +
      '<p class="day-totals">' + list.length + (list.length === 1 ? " job" : " jobs") +
      " &middot; " + total + " hrs total</p>";

    list.forEach(function (e) {
      var pc = personClass(e.person);
      html += '<button type="button" class="job-card person-' + pc + '" data-id="' + e.id + '">' +
        '<div class="job-top"><span class="job-title">' + esc(e.customer) + "</span>" +
        '<span class="job-hours">' + fmtHours(e.hours) + "</span></div>" +
        '<div class="job-meta"><span class="name-tag ' + pc + '">' + esc(firstName(e.person)) + "</span>" +
        '<span class="job-date">' + esc(e.date) + "</span></div>" +
        '<p class="job-desc">' + esc(e.description) + "</p>" +
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
        return "• " + firstName(e.person) + " — " + e.customer + " — " +
          e.description + " (" + e.hours + "h)";
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
    var rows = [["Date", "Person", "Customer", "Work Performed", "Hours"]];
    monthEntries.forEach(function (e) {
      rows.push([e.date, e.person, e.customer, e.description, e.hours]);
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
    sheetBody.innerHTML =
      '<h3 class="sheet-title">' + esc(e.customer) + "</h3>" +
      '<div class="sheet-row"><span class="hours-big">' + fmtHours(e.hours) + '</span>' +
      '<span class="name-tag ' + pc + '">' + esc(e.person) + "</span></div>" +
      '<div class="sheet-row" style="color:var(--muted);font-size:14px;font-weight:600">' + esc(longDate(e.date)) + "</div>" +
      '<div class="notes-box"><div class="notes-label">Work performed</div><p>' +
      esc(e.description) + "</p></div>";
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
