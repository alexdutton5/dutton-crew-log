/* ============================================================
   Dutton Plumbing — Crew Log field entry app
   One submission per job → INSERT into Supabase `crew_logs`.
   The anon key can only INSERT (Row Level Security); reads happen
   server-side with the service_role key, never here.
   ============================================================ */
(function () {
  "use strict";

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
})();
