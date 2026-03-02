  window.addEventListener("unhandledrejection", e => {
    console.error("Unhandled promise rejection:", e.reason);
  });

  const veldDefinities = [
    { sel: '#voornaam', orig: 'voornaam' },
    { sel: '#achternaam', orig: 'achternaam' },
    { sel: '#email', orig: 'email' },
    { sel: '#dagkeuze1', orig: 'dagkeuze1' },
    { sel: '#dagkeuze2', orig: 'dagkeuze2' },
    { sel: '#vraagAantal', orig: 'vraagAantal'},
  ];

  // ===== Helpers veldnamen randomiseren =====
  function maakRandomVeldnaam() {
    return "f_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }

  function randomiseerVeldNamen(form) {
    const mapping = {};
    veldDefinities.forEach(({ sel, orig }) => {
      const el = form.querySelector(sel);
      if (!el) return;

      const rnd = maakRandomVeldnaam();
      el.name = rnd;

      if (orig.endsWith("[]")) {
        (mapping[orig] ||= []).push(rnd);
      } else {
        mapping[orig] = rnd;
      }
    });
    return mapping;
  }

  // ===== Dropdown 2 reset =====
  function resetDagkeuze2() {
    const dagkeuze2 = document.getElementById("dagkeuze2");
    if (!dagkeuze2) return;
    dagkeuze2.innerHTML = '<option value="" disabled selected>-- Kies een dag --</option>';
    dagkeuze2.disabled = true;
  }

  // ===== Dropdown 1 + 2 vullen en visuele label-update =====
  function initDagkeuzeListener() {
    const dagStructuur = [
      { value: "moment1", label: "Donderdag 9 april", text: "Avond" },
      { value: "moment2",  label: "Vrijdag 10 april",  text: "Middag" },
      { value: "moment3",   label: "Vrijdag 10 april",  text: "Avond" }
    ];

    const dagkeuze1 = document.getElementById("dagkeuze1");
    const dagkeuze2 = document.getElementById("dagkeuze2");
    if (!dagkeuze1 || !dagkeuze2) return;

    // ===== Dropdown 1: basislabels vastleggen =====
    Array.from(dagkeuze1.options).forEach(opt => {
      if (opt.value) {
        opt.dataset.base = opt.textContent;
      }
    });

    // ===== Dropdown 1: visuele label-update =====
    dagkeuze1.addEventListener("change", () => {
      // reset alle opties
      Array.from(dagkeuze1.options).forEach(opt => {
        if (opt.dataset.base) {
          opt.textContent = opt.dataset.base;
        }
      });

      const option = dagkeuze1.options[dagkeuze1.selectedIndex];
      if (!option || !option.dataset.base) return;

      const datum = option.parentElement.label;
      option.textContent = `${datum} - ${option.dataset.base.toLowerCase()}`;

      // ===== Dropdown 2 opnieuw opbouwen =====
      resetDagkeuze2();
      dagkeuze2.disabled = false;

      const gekozenDag1 = dagkeuze1.value.trim();
      const overige = dagStructuur.filter(item => item.value !== gekozenDag1);

      let huidigeLabel = null;
      let optgroup = null;

      overige.forEach(item => {
        if (item.label !== huidigeLabel) {
          huidigeLabel = item.label;
          optgroup = document.createElement("optgroup");
          optgroup.label = item.label;
          dagkeuze2.appendChild(optgroup);
        }

        const opt = document.createElement("option");
        opt.value = item.value;
        opt.textContent = item.text;
        opt.dataset.base = item.text;
        optgroup.appendChild(opt);
      });
    });

    // ===== Dropdown 2: visuele label-update =====
    dagkeuze2.addEventListener("change", () => {
      Array.from(dagkeuze2.options).forEach(opt => {
        if (opt.dataset.base) {
          opt.textContent = opt.dataset.base;
        }
      });

      const option = dagkeuze2.options[dagkeuze2.selectedIndex];
      if (!option || !option.dataset.base) return;

      const datum = option.parentElement.label;
      option.textContent = `${datum} - ${option.dataset.base.toLowerCase()}`;
    });
  }

  // ===== Dynamische leerlingnummers-velden =====
  function initMedeleerlingenInputs(mapping) { // Dynamisch extra velden creëren voor opgeven leerlingnummers
    mapping["leerlingnummers[]"] ||= [];
    const container = document.getElementById("leerlingnummersContainer");
    if (!container) return;

    // Leeg nieuw veld maken
    function nieuwLeegVeld() {
      const el = document.createElement("input");
      el.type = "text";
      el.inputMode = "numeric";
      el.pattern = "[0-9]*";
      el.id = "leerlingnummer"
      const rnd = maakRandomVeldnaam();
      // let mapping meerdere waarden per orig opslaan:
      (mapping["leerlingnummers[]"] ||= []).push(rnd);
      el.name = rnd;
      el.placeholder = "Leerlingnummer (optioneel)";
      container.appendChild(el);
    };

    // Start altijd met leeg veld als container leeg is
    if (container.children.length === 0) nieuwLeegVeld();

    container.addEventListener("input", function() {
      let inputs = Array.from(container.querySelectorAll('input'));

      // Verwijder lege velden behalve laatste
      for (let i = inputs.length - 2; i >= 0; i--) {
        if (inputs[i].value.trim() === "") inputs[i].remove();
      }

      // Re-query na verwijderen, want NodeList is statisch
      inputs = Array.from(container.querySelectorAll('input'));
      const laatsteInput = inputs[inputs.length - 1];
      if (laatsteInput && laatsteInput.value.trim() !== "") nieuwLeegVeld();

      // Controle voor minimaal 1 veld
      if (inputs.length === 0) nieuwLeegVeld();
    });
  }

  // ====== Toastfunctie ======
  function toonMelding(tekst, type = "info", persistent = false) {
    const container = document.getElementById("meldingContainer");
    if (!container) return console.error("meldingContainer ontbreekt");

    const meld = document.createElement("div");
    meld.className = `melding melding-${type}`;
    meld.textContent = tekst;

    container.appendChild(meld);

    const duurPerType = { // Tijdsduur melding in ms
      succes: 20000,
      fout: 10000,
      info: 10000,
    };

    const duur = duurPerType[type] ?? 10000;

    if (!persistent) {
      setTimeout(() => {
        meld.style.opacity = "0";
        setTimeout(() => meld.remove(), 500);
      }, duur);
    }

    return meld;
  }

  function clearMeldingen() {
    const container = document.getElementById("meldingContainer");
    if (!container) return;
    container.innerHTML = "";
  } 

  function toonVersturenMelding() {
    const container = document.getElementById("meldingContainer");
    if (!container) return;

    const meld = document.createElement("div");
    meld.className = "melding melding-info";

    // Loader HTML
    meld.innerHTML = `
      <div class="loader">
        <div class="loader_filmstrip"></div>
        <p class="loader_text">Versturen…</p>
      </div>
    `;

    container.appendChild(meld);
    return meld;
  }

  function loadTurnstile() {
    if (document.querySelector('script[src*="turnstile/v0/api.js"]')) return;
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.defer = true;
    s.onload = initTurnstile;
    document.head.appendChild(s);
  }

  // ===== Cloudflare Turnstile (expliciet renderen + resetten) =====
  let tsWidgetId = null;

  function initTurnstile() {
    if (!window.turnstile) return;
    if (tsWidgetId !== null) return;

    tsWidgetId = turnstile.render('.cf-turnstile', {
      sitekey: '0x4AAAAAACDgqSazWn2jzxjk',
      callback: function (token) {
        const hidden = document.getElementById('cf_token');
        if (hidden) hidden.value = token || '';
      },
      'expired-callback': function () {
        const hidden = document.getElementById('cf_token');
        if (hidden) hidden.value = '';
      },
      'error-callback': function () {
        const hidden = document.getElementById('cf_token');
        if (hidden) hidden.value = '';
      },
    });
  }

  function resetTurnstile() {
    const hidden = document.getElementById('cf_token');
    if (hidden) hidden.value = '';
    if (window.turnstile && tsWidgetId !== null) {
      turnstile.reset(tsWidgetId);
    }
  }

  // ===== Init + submit =====
  document.addEventListener("DOMContentLoaded", function() {
    const form = document.getElementById("bestelform");
    if (!form) return;

    const mapping = {};
    mapping["leerlingnummers[]"] = [];
    initMedeleerlingenInputs(mapping);

    // init UI
    loadTurnstile();
    resetDagkeuze2();
    initDagkeuzeListener();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearMeldingen();

      // Disable dubbele submits en forceer verse timestamp
      const submitBtn = document.getElementById("formSubmitButton");
      if (submitBtn) submitBtn.disabled = true;

      if (tsWidgetId === null) {
        toonMelding("Verificatie wordt nog geladen.", "fout");
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      const veldMap = randomiseerVeldNamen(form);
      Object.assign(veldMap, mapping);

      // body maken
      const fd = new FormData(form);

      // check of Turnstile token aanwezig is
      const cfHidden = document.getElementById("cf_token");
      if (!cfHidden || !cfHidden.value) {
        toonMelding("Turnstile verificatie ontbreekt of is verlopen. Herlaad de pagina of klik de widget opnieuw.", "fout");
        if (submitBtn) submitBtn.disabled = false;
        resetTurnstile();
        return;
      }

      const versturenMelding = toonVersturenMelding();

      // === RAW random payload bouwen ===
      const rawPayload = {};
      for (const [key, value] of fd.entries()) {
        if (rawPayload[key]) {
          if (!Array.isArray(rawPayload[key])) {
            rawPayload[key] = [rawPayload[key]];
          }
          rawPayload[key].push(value);
        } else {
          rawPayload[key] = value;
        }
      }

      delete rawPayload.cf_token;

      // === mapping + payload samen versturen ===
      const body = {
        cf_token: fd.get("cf_token"),
        _fieldmap: veldMap,     // random → origineel
        _payload: rawPayload,   // uitsluitend random keys
      };

      const cfToken = fd.get("cf_token");
      if (!cfToken) {
        toonMelding("Verificatie mislukt, probeer opnieuw.", "fout");
        if (submitBtn) submitBtn.disabled = false;
        resetTurnstile();
        return;
      }
      body.cf_token = cfToken;

      try {
        const res = await fetch(gabest.resturl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        let json = {};
        try {
          const text = await res.text();
          json = text ? JSON.parse(text) : {};
        } catch {
          json = {};
        }

        if (res.ok) {
          versturenMelding.remove();
          toonMelding("Bestelling gelukt!🎉 U ontvangt vandaag een bevestigingsmail, controleer ook uw spam. Bij deze melding is de bestelling altijd gelukt, ook als u niet (direct) een bevestigingsmail ontvangt.", "succes");
          form.reset();
          resetDagkeuze2();
          document.getElementById("leerlingnummersContainer").innerHTML = "";
          mapping["leerlingnummers[]"] = [];
          initMedeleerlingenInputs(mapping);
        } else {
          versturenMelding.remove();
          if (json && json.errors) {
            json.errors.forEach(msg => toonMelding(msg, "fout"));
          } else if (json && json.error) {
            toonMelding(json.error, "fout");
          } else {

  const debugInfo = {
    status: res.status,
    statusText: res.statusText,
    response: json,
    rawBody: typeof text !== "undefined" ? text : null
  };

  toonMelding(
    "Onbekende fout:\n" + JSON.stringify(debugInfo, null, 2),
    "fout",
    true
  );

  console.error(debugInfo);


            toonMelding("Onbekende fout.", "fout");
          }
        }
      } catch {
        versturenMelding.remove();
        toonMelding("Netwerkfout, controleer je internetverbinding.", "fout");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        resetTurnstile();
      }
    });
  });
