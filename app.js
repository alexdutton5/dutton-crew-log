/* ============================================================
   Dutton Plumbing — Crew Log field entry app
   One submission per job → INSERT into Supabase `crew_logs`.
   The anon key can INSERT and SELECT (Row Level Security);
   the View tab lists entries newest-first. Writes/reads that
   need full access use the service_role key server-side only.
   ============================================================ */
(function () {
  "use strict";

  var tabsNav = document.getElementById("tabs");
  var tabLog = document.getElementById("tab-log");
  var tabView = document.getElementById("tab-view");
  var listView = document.getElementById("list-view");
  var entriesEl = document.getElementById("entries");
  var refreshBtn = document.getElementById("refresh-btn");

  var formView = document.getElementById("form-view");
  var successView = document.getElementById("success-view");
  var setupView = document.getElementById("setup-view");
  var form = document.getElementById("crew-form");
  var submitBtn = document.getElementById("submit-btn");
  var formError = document.getElementById("form-error");
  var anotherBtn = document.getElementById("another-btn");

  var dateInput = document.getElementById("date");
  var customerInput = document.getElementById("customer");
  var descriptionInput = document.getElementById("description");
  var hoursInput = document.getElementById("hours");

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
    // config.js still has placeholders (or the Supabase CDN failed):
    // show the setup notice instead of a dead form.
    formView.hidden = true;
    if (tabsNav) tabsNav.hidden = true;
    setupView.hidden = false;
    return;
  }
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  /* ---------- default date = today (device-local) ---------- */
  (function setToday() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    dateInput.value = d.getFullYear() + "-" + mm + "-" + dd;
  })();

  /* ---------- validation ---------- */
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

  function hideFormError() {
    formError.textContent = "";
    formError.hidden = true;
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  function validate() {
    var errors = {};
    var values = {};

    var personEl = form.querySelector('input[name="person"]:checked');
    if (!personEl) {
      errors.person = "Tap your name.";
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

  /* ---------- submit ---------- */
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearErrors();
    hideFormError();

    var result = validate();
    var names = Object.keys(result.errors);
    if (names.length > 0) {
      names.forEach(function (n) {
        setInvalid(n, result.errors[n]);
      });
      var firstBad = form.querySelector(".field.invalid input, .field.invalid textarea");
      if (firstBad) firstBad.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending\u2026";

    try {
      var res = await db.from("crew_logs").insert({
        person: result.values.person,
        date: result.values.date,
        customer: result.values.customer,
        description: result.values.description,
        hours: result.values.hours
        // submitted_at defaults to now() in the database
      });
      if (res.error) throw res.error;
      showSuccess(result.values);
    } catch (err) {
      // Network down, RLS misconfigured, anything else: keep the
      // entry on screen and let them retry — nothing is lost.
      showFormError(
        "Couldn't save — check your signal and tap LOG THIS JOB again. Your entry is still here."
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Log this job";
    }
  });

  /* ---------- success view ---------- */
  function showSuccess(v) {
    document.getElementById("sum-name").textContent = v.person;
    document.getElementById("sum-date").textContent = v.date;
    document.getElementById("sum-customer").textContent = v.customer;
    document.getElementById("sum-hours").textContent = v.hours + (v.hours === 1 ? " hour" : " hours");
    formView.hidden = true;
    successView.hidden = false;
    window.scrollTo(0, 0);
  }

  /* ---------- log another: keep name + date, clear the rest ---------- */
  anotherBtn.addEventListener("click", function () {
    customerInput.value = "";
    descriptionInput.value = "";
    hoursInput.value = "";
    clearErrors();
    hideFormError();
    successView.hidden = true;
    formView.hidden = false;
    window.scrollTo(0, 0);
    customerInput.focus();
  });

  /* ---------- tabs ---------- */
  function showTab(which) {
    var isLog = which === "log";
    tabLog.classList.toggle("is-active", isLog);
    tabView.classList.toggle("is-active", !isLog);
    tabLog.setAttribute("aria-selected", isLog ? "true" : "false");
    tabView.setAttribute("aria-selected", isLog ? "false" : "true");
    formView.hidden = !isLog;
    successView.hidden = true;
    listView.hidden = isLog;
    if (!isLog) loadEntries();
    window.scrollTo(0, 0);
  }
  tabLog.addEventListener("click", function () { showTab("log"); });
  tabView.addEventListener("click", function () { showTab("view"); });

  /* ---------- view logs ---------- */
  var currentFilter = "all";
  var cachedEntries = [];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderEntries() {
    var list = cachedEntries.filter(function (e) {
      return currentFilter === "all" || e.person === currentFilter;
    });
    if (!list.length) {
      entriesEl.innerHTML = '<p class="empty">No entries yet.</p>';
      return;
    }
    entriesEl.innerHTML = list.map(function (e) {
      var hrs = Number(e.hours);
      return (
        '<article class="entry">' +
          '<div class="entry-head"><span class="entry-person">' + esc(e.person) + '</span>' +
          '<span class="entry-date">' + esc(e.date) + '</span></div>' +
          '<div class="entry-customer">' + esc(e.customer) + '</div>' +
          '<p class="entry-desc">' + esc(e.description) + '</p>' +
          '<div class="entry-hours">' + esc(e.hours) + (hrs === 1 ? " hour" : " hours") + '</div>' +
        '</article>'
      );
    }).join("");
  }

  async function loadEntries() {
    entriesEl.innerHTML = '<p class="empty">Loading&hellip;</p>';
    try {
      var res = await db
        .from("crew_logs")
        .select("id,person,date,customer,description,hours")
        .order("date", { ascending: false })
        .order("submitted_at", { ascending: false })
        .limit(300);
      if (res.error) throw res.error;
      cachedEntries = res.data || [];
      renderEntries();
    } catch (err) {
      entriesEl.innerHTML =
        '<p class="empty">Couldn&rsquo;t load entries &mdash; check your signal and tap Refresh.</p>';
    }
  }

  document.querySelectorAll(".chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      document.querySelectorAll(".chip").forEach(function (c) {
        c.classList.remove("is-active");
      });
      chip.classList.add("is-active");
      currentFilter = chip.getAttribute("data-filter");
      renderEntries();
    });
  });
  refreshBtn.addEventListener("click", loadEntries);
})();
