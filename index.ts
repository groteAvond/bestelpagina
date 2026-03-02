// Versie 1.3.1
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// ====== ENV ======
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WP_SHARED_SECRET = Deno.env.get("WP_SHARED_SECRET") ?? "";
const SENDER_API_KEY = Deno.env.get("SENDER_API_KEY") ?? "";
// Vroege sanity-checks (voorkomt vage runtime-fouten)
if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
// Eén Supabase client voor server-side gebruik
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: {
    persistSession: false
  },
  global: {
    headers: {
      "X-Client-Info": "edge-bevestig-bestelling"
    }
  }
});
// ====== UTC naar Nederlandse wintertijd (UTC+1) ======
function getNLISO() {
  const now = new Date();
  // forceer UTC+1
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const winterMs = utcMs + 1 * 60 * 60 * 1000;
  const d = new Date(winterMs);
  return (
    d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0") + "T" +
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0") + ":" +
    String(d.getSeconds()).padStart(2, "0") +
    "+01:00"
  );
}
// ====== Helpers ======
const ALLOWED_ORIGINS = [
  "https://www.io-vivat.nl",
  "https://bibliotheek.io-vivat.nl",
];
function cors(req) {
  const origin = req.headers.get("Origin");
  const allow =
    !origin || ALLOWED_ORIGINS.includes(origin)
      ? origin ?? "*"
      : null;
  return {
    ...(allow ? { "Access-Control-Allow-Origin": allow } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-requested-with, content-type, x-ga-secret, accept",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}
function respond(req, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: cors(req),
  });
}
async function safeJson(req) {
  try {
    return await req.json();
  } catch  {
    return null;
  }
}
// ====== Validatie ======
function validateWPInput(input) {
  const errors = [];
  const allowedDays = [
    "moment1",
    "moment2",
    "moment3",
  ];
  const voornaam = String(input.voornaam ?? "").trim();
  const achternaam = String(input.achternaam ?? "").trim();
  const voorkeurDag1 = String(input.dagkeuze1 ?? "").trim();
  const voorkeurDag2 = String(input.dagkeuze2 ?? "").trim();
  const email = String(input.email ?? "").trim();
  const vraagAantalRaw = input.vraagAantal;
  let vraagAantal: number | null = null;
  const nameRegex = /^[\p{L}]+(?:[ '\-][\p{L}]+)*$/u;
  // leerlingnummers normaliseren naar array
  let leerlingnummers = [];
  if (Array.isArray(input.leerlingnummers)) {
    leerlingnummers = input.leerlingnummers.map((v)=>String(v ?? "").trim()).filter((v)=>v !== "");
  }
  if (voornaam === "") errors.push("Vul een voornaam in.");
    else if (voornaam !== "" && !nameRegex.test(voornaam)) errors.push("Een voornaam bestaat alleen uit letters, met eventueel spaties, apostrof of koppelteken.");
    else if (voornaam.length > 50) errors.push("Een voornaam bestaat uit maximaal 50 tekens.");
  if (achternaam === "") errors.push("Vul een achternaam in.");
    else if (achternaam !== "" && !nameRegex.test(achternaam)) errors.push("Een achternaam bestaat alleen uit letters, met eventueel spaties, apostrof of koppelteken.");
    else if (achternaam.length > 80) errors.push("Een achternaam bestaat uit maximaal 80 tekens.");
  if (email === "" || !/^\S+@\S+\.\S+$/.test(email)) errors.push("Vul een geldig e-mailadres in.");
    else if (email.length > 254) errors.push("Een e-mailadres bestaat uit maximaal 254 tekens.");
  if (voorkeurDag1 === "" || !allowedDays.includes(voorkeurDag1)) errors.push("Kies een eerste voorkeursdag, kies uit donderdag-avond, vrijdag-middag of vrijdag-avond.");
  if (voorkeurDag2 === "" || !allowedDays.includes(voorkeurDag2)) errors.push("Kies een tweede voorkeursdag, kies uit donderdag-avond, vrijdag-middag of vrijdag-avond.");
    else if (voorkeurDag1 && voorkeurDag2 && voorkeurDag1 === voorkeurDag2) errors.push("De eerste en tweede voorkeursdag kunnen niet gelijk zijn.");
  const uniqueSet = new Set(leerlingnummers);
  if (uniqueSet.size !== leerlingnummers.length) errors.push("Elk leerlingnummer mag slechts één keer worden opgegeven.");
  if (leerlingnummers.length > 30) errors.push("U kunt maximaal 30 leerlingnummers opgeven.");
  for (const ln of leerlingnummers){
    if (!/^\d+$/.test(ln)) errors.push("Een leerlingnummer is een cijfer.");
    if (!/^11[0-9]{4}$/.test(ln)) errors.push("Alle leerlingnummers moeten beginnen met '11' gevolgd door 4 cijfers.");
    if (ln.length !== 6) errors.push("Een leerlingnummer bestaat altijd uit 6 cijfers.");
    if (/^0+$/.test(ln)) errors.push("Een leerlingnummer is een positief getal zijn.");
  }

  if (vraagAantalRaw === "" || vraagAantalRaw === null || vraagAantalRaw === undefined) errors.push("Vul een totaal aantal kaarten in.");
    else {
      vraagAantal = Number(vraagAantalRaw);
      if (!Number.isInteger(vraagAantal)) errors.push("Het totaal aantal kaarten is een geheel getal.");
      else if (vraagAantal <= 0) errors.push("Het totaal aantal kaarten is minimaal 1.");
      else if (vraagAantal > 30) errors.push("U kunt maximaal 30 kaarten bestellen.");
    }

  return {
    valid: errors.length === 0,
    errors,
    clean: {
      voornaam,
      achternaam,
      voorkeurDag1,
      voorkeurDag2,
      email,
      leerlingnummers,
      vraagAantal,
    }
  };
}
// Controle of hoofdboeker erelid is
const ereleden = new Set(
  [
    "bri@gsr.nl",
    "gdendulk@ziggo.nl",
    "h.de.lange@kpnmail.nl",
  ].map((e) => e.toLowerCase().replace(/\s+/g, ""))
);
function isErelidControle(email: string) {
  const normalized = String(email ?? "").trim().toLowerCase().replace(/\s+/g, "");
  return ereleden.has(normalized);
}
// Controle of hoofdboeker meespeelt
async function speeltMeeControle(email: string) {
  const match = /^l(11\d{4})@gsr\.nl$/i.exec(String(email ?? "").trim());
  if (!match) return false;
  const ln = match[1];
  const { data, error } = await supabase
    .from("spelendeLeerlingen")
    .select("leerlingnummer")
    .eq("leerlingnummer", ln)
    .limit(1);
  if (error) {
    console.error("spelendeLeden opzoeken mislukt.", error);
    throw new Error("Spelende leden opzoeken mislukt.");
  }
  return (data?.length ?? 0) > 0;
}
// Controle of hoofdboeker docent is
function isDocentControle(email: string) {
  return /^[a-z]{3}@gsr\.nl$/i.test(email.trim());
}
// Controle pwsMens (werk je hieraan voor je pws, zet dan je achternaam erbij voor betere plekken)
const pwsMens = new Set(
  [
    "Suurmond",
    "Den Hoed",
    "Pierik",
    "Moerkerken",
  ].map((e) => e.toLowerCase().replace(/\s+/g, ""))
);
function isPwsMensControle(achternaam: string) {
  const normalized = String(achternaam ?? "").trim().toLowerCase().replace(/\s+/g, "");
  return pwsMens.has(normalized);
}
// Dagen naar hoofdletter omzetten in database
const dagTitles: Record<string, string> = {
  moment1: 'Donderdag 9 april - avond',
  moment2: 'Vrijdag 10 april - middag',
  moment3: 'Vrijdag 10 april - avond',
};
// Controle welke en hoeveel leerlingen lid zijn van Io Vivat
const ioVivatEmailRegex = /^l(11\d{4})@gsr\.nl$/i;
async function fetchIoVivatMembers(leerlingnummers: string[]) {
  if (leerlingnummers.length === 0) return { found: [] };
  const { data, error } = await supabase
    .from("ledenIoVivat")
    .select("Leerlingnummer")
    .in("Leerlingnummer", leerlingnummers);
  if (error) {
    console.error("ledenIoVivat opzoeken mislukt.", error);
    throw new Error("Io Vivat opzoeken mislukt.");
  }
  const foundSet = new Set((data ?? []).map((r) => String(r.Leerlingnummer)));
  return { found: Array.from(foundSet) };
}
// Leden Io Vivat verzamelen
function collectIoVivatCandidates(email: string, leerlingnummers: string[]) {
  const set = new Set<string>();
  const match = ioVivatEmailRegex.exec(String(email ?? "").trim());
  if (match) set.add(match[1]);
  for (const ln of leerlingnummers ?? []) set.add(ln);
  return Array.from(set);
}
// Totaal prijs voor klant berekenen
function prijsBerekening(vraagAantal: number, ioVivat: number): number {
  const betaaldeKaarten = Math.max(0, vraagAantal - ioVivat);
  return betaaldeKaarten * 15;
}
// Helper om te detecteren of body een WP-payload lijkt
function looksLikeWP(body) {
  return body && typeof body === "object" && ("voornaam" in body || "achternaam" in body || "email" in body || "dagkeuze1" in body || "dagkeuze2" in body || "vraagAantal" in body);
}
// ====== Server ======
serve(async (req)=>{
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: cors(req)
    });
  }
  // Trailing slash tolerant
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  // ====== /wp ======
  async function handleWP(jsonIn) {
    // extra beveiliging
    if (!WP_SHARED_SECRET || req.headers.get("x-ga-secret") !== WP_SHARED_SECRET) {
      return respond(req, 401, {
        error: "Unauthorized"
      });
    }
    const validated = validateWPInput(jsonIn);
    if (!validated.valid) {
      return respond(req, 400, {
        errors: validated.errors
      });
    }
    // waarden naar database opschonen
    const d = validated.clean;
    const isErelid = isErelidControle(d.email);
    const isDocent = isErelid ? null : isDocentControle(d.email);
    const dag1_sd = dagTitles[d.voorkeurDag1] ?? d.voorkeurDag1;
    const dag2_sd = dagTitles[d.voorkeurDag2] ?? d.voorkeurDag2;
    const leerlingen = d.leerlingnummers?.length > 0 ? d.leerlingnummers.join(", ") : null;
    // Controle speeltMee
    let speeltMee = false;
    try {
      speeltMee = (await speeltMeeControle(d.email)) || isPwsMensControle(d.achternaam);
    } catch {
      console.error("Controle spelende leden mislukt.", {
        email: d.email,
        achternaam: d.achternaam,
      });
      return respond(req, 500, { error: "Controle spelende leden mislukt." });
    }
    // Controle leden Io Vivat
    const leden = collectIoVivatCandidates(d.email, d.leerlingnummers);
    let ioVivatCount = 0;
    let ioVivatMembers: string | null = null;
    if (leden.length > 0) {
      try {
        const { found } = await fetchIoVivatMembers(leden);
        ioVivatCount = found.length;
        ioVivatMembers = found.length ? found.join(", ") : null;
      } catch {
        console.error("Controle leden Io Vivat mislukt.", {
          email: d.email,
          leerlingnummers: d.leerlingnummers,
        });
        return respond(req, 500, { error: "Controle leden Io Vivat mislukt." });
      }
    }
    // tweede validatie om waarden naar database op te schonen
    const totaalPrijs = isErelid ? 0 : prijsBerekening(d.vraagAantal, ioVivatCount);
    // database insert
    const { data, error } = await supabase.from("bestellingenGA").insert({
      voornaam: d.voornaam,
      achternaam: d.achternaam,
      isErelid,
      speeltMee,
      isDocent,
      aantalKaarten: d.vraagAantal,
      voorkeurDag1: d.voorkeurDag1,
      voorkeurDag2: d.voorkeurDag2,
      email: d.email,
      leerlingnummers: leerlingen,
      ioVivat: ioVivatCount,
      datumAanmelding: getNLISO(),
      ioVivatMembers,
      totaalPrijs: totaalPrijs,
    }).select().single();
    if (error) {
      console.error("Database-invoeging mislukt:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return respond(req, 500, { error: "Database-invoeging mislukt." });
    }
    // Sender code
    try {
      if (!SENDER_API_KEY) {
        console.error("SENDER_API_KEY ontbreekt");
        return respond(req, 500, {
          error: "missing sender key"
        });
      }
      // 1. subscriber aanmaken of bijwerken + meteen aan groep koppelen
      const createRes = await fetch("https://api.sender.net/v2/subscribers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${SENDER_API_KEY}`,
        },
        body: JSON.stringify({
          email: d.email,
          firstname: d.voornaam,
          lastname: d.achternaam,
          update_enabled: true,
          overwrite: true,
          groups: [
            "aKE7Ml"
          ],
          fields: {
            aantalkaarten: d.vraagAantal,
            voorkeurdag1: dag1_sd,
            voorkeurdag2: dag2_sd,
            leerlingnummers: leerlingen ?? "Geen",
            last_order_id: data.id,
            totaalprijs: totaalPrijs,
          },
        })
      });
      const sub = await createRes.json().catch(()=>({}));
      if (!createRes.ok) {
        console.error("Sender create/update failed", createRes.status, sub);
        return respond(req, 500, {
          error: "sender subscriber creation failed",
          sender_status: createRes.status,
          sender_response: sub,
        });
      }
      return respond(req, 200, {
        ok: true,
        bestelling: data,
        sender_status: createRes.status,
        sender_response: sub,
      });
    } catch (e) {
      console.error("Sender_exception", String(e));
      return respond(req, 500, {
        error: "sender crash"
      });
    }
  }
  // ====== /sender OF /bevestig_bestelling ======
  if (path.endsWith("/wp")) {
    if (req.method !== "POST") return respond(req, 405, {
      error: "Method not allowed"
    });
    const json = await safeJson(req);
    if (!json) return respond(req, 400, {
      error: "Invalid JSON"
    });
    return await handleWP(json);
  }
  if (path.endsWith("/sender") || path.endsWith("/bevestig_bestelling")) {
    if (req.method !== "POST") return respond(req, 405, {
      error: "Method not allowed"
    });
    const json = await safeJson(req);
    if (!json) return respond(req, 400, {
      error: "Invalid JSON"
    });
    // Als het lijkt op WP-payload, behandel het als WP (jouw PHP roept /bevestig_bestelling aan)
    if (looksLikeWP(json)) {
      return await handleWP(json);
    }
    // Anders: bestaande Sender-flow
    const { name, email: email1 } = json;
    if (!name || !email1) return respond(req, 400, {
      error: "Missing 'name' or 'email'"
    });
    if (!SENDER_API_KEY) {
      console.error("Missing SENDER_API_KEY env");
      return respond(req, 500, {
        error: "Sender API key not configured"
      });
    }
    try {
      const senderResponse = await fetch("https://api.sender.net/v2/subscribers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SENDER_API_KEY}`,
        },
        body: JSON.stringify({
          email: email1,
          firstname: name,
          lastname: "",
          update_enabled: true,
          overwrite: true,
          groups: [
            "aKE7Ml"
          ],
        })
      });
      const data1 = await senderResponse.json().catch(()=>({}));
      const status = senderResponse.status;
      if (status >= 200 && status < 300) {
        return respond(req, 200, data1);
      } else {
        console.error("Sender error:", status, data1);
        return respond(req, status, {
          error: "Sender request failed",
          details: data1
        });
      }
    } catch (error) {
      console.error("Fout in bevestig_bestelling (Sender):", error);
      return respond(req, 500, {
        error: "Er is een fout opgetreden bij het verzenden naar Sender."
      });
    }
  }
  // ====== 404 ======
  return respond(req, 404, {
    error: "Not found"
  });
});
