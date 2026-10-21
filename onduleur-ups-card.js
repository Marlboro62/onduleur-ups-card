/*
 * Carte Onduleur UPS — état d'un onduleur (UPS) pour Home Assistant : batterie, autonomie,
 * charge, tensions, seuils de bascule et prises pilotables.
 * Conçue pour l'intégration Network UPS Tools (NUT), donc pour toutes les marques qu'elle gère
 * (Eaton, APC, CyberPower, Riello, Legrand, Salicru…) ; les capteurs peuvent aussi être choisis à la main.
 * Même style que la Carte Enedis Linky New, mais indépendante.
 *
 *   type: custom:onduleur-ups-card
 *   device: <id de l'appareil NUT>   (facultatif : le premier onduleur NUT est pris par défaut)
 */

(() => {
const CARD_VERSION = "0.1.0";

/* ------------------------------------------------------------- affichage */

const fmt = (n, digits = 1) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Classe de thème de la carte :
 *  v2   : style MyElectricalData, toujours bleu nuit ;
 *  auto : style MyElectricalData, bleu nuit si Home Assistant est en mode sombre, clair sinon ;
 *  ha   : couleurs du thème Home Assistant (clair ou sombre). */
const themeClass = (theme, hass) => {
  const light = hass?.themes?.darkMode === false;
  if (theme === "ha") return `th-ha${light ? " light" : ""}`;
  if (theme === "auto") return `th-v2${light ? " light" : ""}`;
  return "th-v2";
};

/* ------------------------------------------------------------ carte onduleur */

const UPS_DEFAULTS = {
  title: "",
  device: "",
  show_details: true,
  theme: "v2",
};

/** Capteurs reconnus. keys : clés NUT (translation_key), suffixes : fin d'entity_id en anglais et en français. */
const UPS_FIELDS = [
  { id: "status_raw", keys: ["ups_status"], suf: ["status_data", "ups_status", "code_d_etat", "status_code"] },
  { id: "status", keys: ["ups_status_display"], suf: ["status", "etat"] },
  { id: "battery_charge", keys: ["battery_charge"], suf: ["battery_charge", "charge_de_la_batterie"] },
  { id: "battery_low", keys: ["battery_charge_low"], suf: ["battery_charge_low", "low_battery_setpoint", "consigne_de_batterie_faible"] },
  { id: "runtime", keys: ["battery_runtime"], suf: ["battery_runtime", "autonomie_de_la_batterie"] },
  { id: "load", keys: ["ups_load"], suf: ["load", "ups_load", "charge"] },
  { id: "realpower", keys: ["ups_realpower"], suf: ["current_real_power", "real_power", "ups_realpower", "puissance_reelle"] },
  { id: "realpower_nominal", keys: ["ups_realpower_nominal"], suf: ["nominal_real_power", "puissance_reelle_nominale"] },
  { id: "power_nominal", keys: ["ups_power_nominal"], suf: ["nominal_power", "puissance_nominale"] },
  { id: "power", keys: ["ups_power"], suf: ["current_apparent_power", "puissance_apparente"] },
  { id: "input_voltage", keys: ["input_voltage"], suf: ["input_voltage", "tension_d_entree"] },
  { id: "input_frequency", keys: ["input_frequency"], suf: ["input_line_frequency", "input_frequency", "frequence_d_entree", "frequence_de_ligne_d_entree"] },
  { id: "output_voltage", keys: ["output_voltage"], suf: ["output_voltage", "tension_de_sortie"] },
  { id: "output_voltage_nominal", keys: ["output_voltage_nominal"], suf: ["nominal_output_voltage", "tension_de_sortie_nominale"] },
  { id: "output_frequency", keys: ["output_frequency"], suf: ["output_frequency", "frequence_de_sortie"] },
  { id: "output_frequency_nominal", keys: ["output_frequency_nominal"], suf: ["nominal_output_frequency", "frequence_de_sortie_nominale"] },
  { id: "battery_voltage", keys: ["battery_voltage"], suf: ["battery_voltage", "tension_de_la_batterie"] },
  { id: "temperature", keys: ["ups_temperature", "battery_temperature"], suf: ["ups_temperature", "battery_temperature", "temperature_de_l_onduleur", "temperature_de_la_batterie", "temperature"] },
  { id: "transfer_low", keys: ["input_transfer_low"], suf: ["low_voltage_transfer", "transfert_de_tension_basse"] },
  { id: "transfer_high", keys: ["input_transfer_high"], suf: ["high_voltage_transfer", "transfert_de_tension_haute"] },
  { id: "chemistry", keys: ["battery_chemistry"], suf: ["battery_chemistry", "chimie_de_la_batterie"] },
  { id: "type", keys: ["ups_type"], suf: ["ups_type", "type_d_onduleur"] },
  { id: "beeper", keys: ["ups_beeper_status"], suf: ["beeper_status", "etat_du_signal_sonore"] },
  { id: "delay_shutdown", keys: ["ups_delay_shutdown"], suf: ["ups_shutdown_delay", "delai_d_arret_de_l_onduleur"] },
  { id: "delay_start", keys: ["ups_delay_start"], suf: ["load_restart_delay", "delai_de_redemarrage_de_la_charge"] },
];

/** Codes d'état NUT (ups.status), du plus grave au plus anodin. */
const UPS_CODES = {
  FSD: { label: "Arrêt forcé", lvl: "alert" },
  OVER: { label: "Surcharge", lvl: "alert" },
  LB: { label: "Batterie faible", lvl: "alert" },
  OB: { label: "Sur batterie", lvl: "alert" },
  RB: { label: "Batterie à remplacer", lvl: "warn" },
  ALARM: { label: "Alarme", lvl: "warn" },
  OFF: { label: "Sortie coupée", lvl: "warn" },
  BYPASS: { label: "Bypass", lvl: "warn" },
  CAL: { label: "Calibration", lvl: "info" },
  TRIM: { label: "Abaissement de tension", lvl: "info" },
  BOOST: { label: "Rehaussement de tension", lvl: "info" },
  DISCHRG: { label: "Décharge", lvl: "info" },
  CHRG: { label: "En charge", lvl: "info" },
  HB: { label: "Batterie haute", lvl: "info" },
  OL: { label: "Secteur", lvl: "ok" },
};

/** Texte d'état sans code (intégrations autres que NUT, ou ups.status.display seul). */
const UPS_TEXT = [
  [/on ?batt|sur batt|onbatt/i, "OB"],
  [/low ?batt|batterie faible/i, "LB"],
  [/overload|surcharge/i, "OVER"],
  [/replace|remplac/i, "RB"],
  [/bypass/i, "BYPASS"],
  [/charging|en charge/i, "CHRG"],
  [/online|on ?line|secteur|en ligne/i, "OL"],
];

const slug = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** Durée en secondes → « 33 min 39 s », « 1 h 05 min ». */
const duration = (sec) => {
  if (sec === null || !Number.isFinite(sec) || sec < 0) return "—";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m) return `${m} min${r ? ` ${String(r).padStart(2, "0")} s` : ""}`;
  return `${r} s`;
};

class OnduleurUpsCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("onduleur-ups-card-editor");
  }

  static getStubConfig(hass) {
    const dev = OnduleurUpsCard._firstDevice(hass);
    return dev ? { device: dev } : {};
  }

  /** Premier appareil qui porte des entités de l'intégration NUT. */
  static _firstDevice(hass) {
    const e = Object.values(hass?.entities || {}).find((x) => x.platform === "nut" && x.device_id);
    return e?.device_id || "";
  }

  setConfig(config) {
    this._config = { ...UPS_DEFAULTS, ...(config || {}) };
    this._map = null;
    this._sig = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    if (!this._clicks) this.shadowRoot.addEventListener("click", (this._clicks = (ev) => {
      const sw = ev.target.closest?.("[data-toggle]");
      if (sw) {
        ev.stopPropagation();
        this._hass?.callService("switch", "toggle", { entity_id: sw.dataset.toggle });
        return;
      }
      const el = ev.target.closest?.("[data-entity]");
      if (!el) return;
      const e = new Event("hass-more-info", { bubbles: true, composed: true });
      e.detail = { entityId: el.dataset.entity };
      this.dispatchEvent(e);
    }));
    this._render();
  }

  set hass(hass) {
    if (this._hass?.entities !== hass.entities) this._map = null;
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 6;
  }

  _deviceId() {
    return this._config.device || OnduleurUpsCard._firstDevice(this._hass);
  }

  /** Associe chaque champ à une entité de l'appareil (clé NUT, puis nom d'entité), sauf si fourni dans entities:. */
  _resolve() {
    if (this._map) return this._map;
    const hass = this._hass;
    const devId = this._deviceId();
    const dev = hass.devices?.[devId];
    const ents = Object.values(hass.entities || {}).filter((e) => devId && e.device_id === devId);
    const prefix = slug(dev?.name_by_user || dev?.name);
    const map = {};
    const used = new Set();
    const rest = (id) => {
      const obj = id.split(".")[1] || "";
      return prefix && obj.startsWith(prefix + "_") ? obj.slice(prefix.length + 1) : obj;
    };
    const sensors = ents.filter((e) => e.entity_id.startsWith("sensor."));
    // 1. clé de traduction NUT ; 2. nom exact après le préfixe de l'appareil ; 3. fin du nom (suffixes longs d'abord)
    for (const f of UPS_FIELDS) {
      const e = sensors.find((x) => !used.has(x.entity_id) && f.keys.includes(x.translation_key));
      if (e) { map[f.id] = e.entity_id; used.add(e.entity_id); }
    }
    for (const f of UPS_FIELDS) {
      if (map[f.id]) continue;
      const e = sensors.find((x) => !used.has(x.entity_id) && f.suf.includes(rest(x.entity_id)));
      if (e) { map[f.id] = e.entity_id; used.add(e.entity_id); }
    }
    const bySuffix = UPS_FIELDS.flatMap((f) => f.suf.map((s) => ({ f, s }))).sort((a, b) => b.s.length - a.s.length);
    for (const { f, s } of bySuffix) {
      if (map[f.id]) continue;
      const e = sensors.find((x) => !used.has(x.entity_id) && x.entity_id.endsWith("_" + s));
      if (e) { map[f.id] = e.entity_id; used.add(e.entity_id); }
    }
    Object.assign(map, this._config.entities || {});
    map._outlets = ents
      .filter((e) => /outlet|prise/i.test(e.entity_id) && (e.entity_id.startsWith("switch.") || e.entity_id.startsWith("sensor.")))
      .map((e) => e.entity_id);
    map._dev = dev;
    this._map = map;
    return map;
  }

  _st(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }

  _num(id) {
    const st = this._st(id);
    if (!st || st.state === "" || st.state === "unknown" || st.state === "unavailable") return null;
    const n = Number(st.state);
    return Number.isFinite(n) ? n : null;
  }

  /** Autonomie en secondes, quelle que soit l'unité du capteur. */
  _runtime(id) {
    const n = this._num(id);
    if (n === null) return null;
    const u = String(this._st(id)?.attributes?.unit_of_measurement || "s").toLowerCase();
    return u.startsWith("h") ? n * 3600 : u.startsWith("min") ? n * 60 : u === "ms" ? n / 1000 : n;
  }

  _status(m) {
    const raw = String(this._st(m.status_raw)?.state || "").toUpperCase();
    let codes = raw.split(/\s+/).filter((c) => UPS_CODES[c]);
    const text = this._st(m.status)?.state;
    if (!codes.length && text) {
      const hit = UPS_TEXT.find(([re]) => re.test(text));
      if (hit) codes = [hit[1]];
    }
    const order = Object.keys(UPS_CODES);
    codes.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const lvl = codes.length ? UPS_CODES[codes[0]].lvl : "none";
    return { codes, lvl, text, raw };
  }

  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const c = this._config;
    const m = this._resolve();
    const ids = Object.entries(m).filter(([k]) => !k.startsWith("_")).map(([, v]) => v).concat(m._outlets);
    const sig = `${c.theme}|${this._hass.themes?.darkMode}|` + ids.map((id) => this._st(id)?.state ?? "-").join("|");
    if (sig === this._sig) return;
    this._sig = sig;

    const dev = m._dev;
    const title = c.title || dev?.name_by_user || dev?.name || "Onduleur";
    const sub = [dev?.model, dev?.manufacturer && dev.manufacturer !== dev?.model ? dev.manufacturer : null, dev?.sw_version ? `micrologiciel ${dev.sw_version}` : null]
      .filter(Boolean)
      .map(esc)
      .join(" · ");
    const header = (pill) => `<header>
        <div class="brand">
          <svg viewBox="0 0 32 32" aria-hidden="true"><rect class="box" x="7" y="3.5" width="18" height="25" rx="3"/><path class="bolt" d="M17.5 8 12 17h4l-1.5 7 6-9.5h-4.2z"/></svg>
          <div><div class="title">${esc(title)}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>
        </div>
        ${pill}
      </header>`;
    const card = (cls, body) => {
      this.shadowRoot.innerHTML = `${STYLE}${UPS_STYLE}<ha-card class="${themeClass(c.theme, this._hass)} ${cls}">${body}</ha-card>`;
    };

    if (!m.battery_charge && !m.status_raw && !m.status && !m.load) {
      card("", header("") + `<div class="empty">Aucun onduleur trouvé<span>${this._deviceId() ? "Cet appareil n'a pas de capteurs d'onduleur reconnus : choisissez-les dans entities: (voir le README)." : "Choisissez l'appareil de l'onduleur (intégration Network UPS Tools) dans l'éditeur de la carte."}</span></div>`);
      return;
    }

    const st = this._status(m);
    const onBatt = st.codes.includes("OB");
    const pill = st.codes.length || st.text
      ? `<div class="pill ups-${st.lvl}" data-entity="${esc(m.status_raw || m.status)}"><span class="dot"></span><span class="pill-v">${st.codes.length ? st.codes.filter((x) => x !== "OL" || st.codes.length === 1).slice(0, 2).map((x) => UPS_CODES[x].label).join(" · ") : esc(st.text)}</span></div>`
      : "";

    // Batterie
    const charge = this._num(m.battery_charge);
    const low = this._num(m.battery_low);
    const runtime = this._runtime(m.runtime);
    const battCls = charge === null ? "" : st.codes.includes("LB") || (low !== null && charge <= low) ? "b-alert" : charge < 50 ? "b-warn" : "b-ok";
    const batt = charge !== null || runtime !== null
      ? `<div class="gauge-card" data-entity="${esc(m.battery_charge || m.runtime)}">
          <div class="g-l">Batterie${st.codes.includes("CHRG") ? " · en charge" : ""}</div>
          <div class="g-v">${charge !== null ? `${fmt(charge, 0)}<span>%</span>` : "—"}</div>
          <div class="g-bar ${battCls}"><i style="width:${Math.max(0, Math.min(100, charge ?? 0))}%"></i>${low !== null ? `<b class="mark" style="left:${low}%" title="Seuil batterie faible : ${fmt(low, 0)} %"></b>` : ""}</div>
          <div class="g-n">${runtime !== null ? `<span class="g-k">Autonomie <b>${duration(runtime)}</b></span>` : ""}${low !== null ? `<span>seuil ${fmt(low, 0)} %</span>` : ""}</div>
        </div>`
      : "";

    // Charge (load) et puissance
    const load = this._num(m.load);
    const realW = this._num(m.realpower);
    const nomW = this._num(m.realpower_nominal);
    const nomVA = this._num(m.power_nominal);
    const watts = realW ?? (load !== null && nomW !== null ? (load / 100) * nomW : null);
    const loadCls = load === null ? "" : st.codes.includes("OVER") || load >= 90 ? "b-alert" : load >= 70 ? "b-warn" : "b-ok";
    const loadBox = load !== null || watts !== null
      ? `<div class="gauge-card" data-entity="${esc(m.load || m.realpower)}">
          <div class="g-l">Charge</div>
          <div class="g-v">${load !== null ? `${fmt(load, 0)}<span>%</span>` : "—"}</div>
          <div class="g-bar ${loadCls}"><i style="width:${Math.max(0, Math.min(100, load ?? 0))}%"></i></div>
          <div class="g-n">${watts !== null ? `<span class="g-k"><b>${realW === null ? "≈ " : ""}${fmt(watts, 0)} W</b></span>` : ""}${nomVA !== null || nomW !== null ? `<span>sur ${[nomVA !== null ? `${fmt(nomVA, 0)} VA` : null, nomW !== null ? `${fmt(nomW, 0)} W` : null].filter(Boolean).join(" / ")}</span>` : ""}</div>
        </div>`
      : "";

    // Mesures électriques
    const unit = (id, d) => esc(this._st(id)?.attributes?.unit_of_measurement || d);
    const tile = (id, label, d, digits, nominalId) => {
      const v = this._num(id);
      if (v === null) return "";
      const nom = this._num(nominalId);
      return `<div class="tile" data-entity="${esc(id)}"><div class="tile-l">${label}</div><div class="tile-v">${fmt(v, digits)}<span>${unit(id, d)}</span></div>${nom !== null ? `<div class="tile-n">nominal ${fmt(nom, digits)} ${unit(nominalId, d)}</div>` : ""}</div>`;
    };
    const tiles = [
      tile(m.input_voltage, "Entrée", "V", 0),
      tile(m.output_voltage, "Sortie", "V", 0, m.output_voltage_nominal),
      tile(m.output_frequency, "Fréquence", "Hz", 1, m.output_frequency_nominal) || tile(m.input_frequency, "Fréquence", "Hz", 1),
      tile(m.battery_voltage, "Tension batterie", "V", 1),
      tile(m.temperature, "Température", "°C", 1),
    ].filter(Boolean);
    if (!this._num(m.output_frequency) && !this._num(m.input_frequency) && this._num(m.output_frequency_nominal) !== null) {
      tiles.push(`<div class="tile" data-entity="${esc(m.output_frequency_nominal)}"><div class="tile-l">Fréquence nominale</div><div class="tile-v">${fmt(this._num(m.output_frequency_nominal), 0)}<span>${unit(m.output_frequency_nominal, "Hz")}</span></div></div>`);
    }

    // Plage de tension acceptée avant bascule sur batterie
    const tl = this._num(m.transfer_low);
    const th = this._num(m.transfer_high);
    let range = "";
    if (tl !== null && th !== null && th > tl) {
      const v = this._num(m.input_voltage) ?? (onBatt ? null : this._num(m.output_voltage));
      const lo = tl - (th - tl) * 0.25;
      const hi = th + (th - tl) * 0.25;
      const pos = (x) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));
      range = `<div class="range" data-entity="${esc(m.transfer_low)}">
          <div class="chart-h"><span>Plage secteur acceptée</span><span>${v !== null ? `${this._num(m.input_voltage) !== null ? "entrée" : "sortie"} ${fmt(v, 0)} V` : ""}</span></div>
          <div class="r-bar"><i style="left:${pos(tl)}%;right:${100 - pos(th)}%"></i>${v !== null ? `<b style="left:${pos(v)}%"></b>` : ""}</div>
          <div class="r-l"><span style="left:${pos(tl)}%">${fmt(tl, 0)} V</span><span style="left:${pos(th)}%">${fmt(th, 0)} V</span></div>
          <div class="r-n">En dessous de ${fmt(tl, 0)} V ou au-dessus de ${fmt(th, 0)} V, l'onduleur passe sur batterie.</div>
        </div>`;
    }

    // Informations
    const txt = (id) => {
      const s = this._st(id)?.state;
      return s && s !== "unknown" && s !== "unavailable" ? s : null;
    };
    const beeper = txt(m.beeper);
    const beepFr = beeper ? ({ enabled: "activé", disabled: "désactivé", muted: "coupé" }[beeper.toLowerCase()] || beeper) : null;
    const ds = this._runtime(m.delay_shutdown);
    const dr = this._runtime(m.delay_start);
    const chips = [
      txt(m.chemistry) && [m.chemistry, "Batterie", ({ pbac: "plomb-acide", "pb-ac": "plomb-acide", liion: "lithium-ion", "li-ion": "lithium-ion" }[txt(m.chemistry).toLowerCase()] || txt(m.chemistry))],
      txt(m.type) && [m.type, "Type", txt(m.type)],
      beepFr && [m.beeper, "Bip", beepFr],
      ds !== null && ds >= 0 && [m.delay_shutdown, "Arrêt après", duration(ds)],
      dr !== null && dr >= 0 && [m.delay_start, "Redémarrage", duration(dr)],
    ].filter(Boolean);
    const info = c.show_details !== false && chips.length
      ? `<div class="chips">${chips.map(([id, l, v]) => `<span class="chip" data-entity="${esc(id)}"><span>${l}</span> ${esc(v)}</span>`).join("")}</div>`
      : "";

    // Prises pilotables (PowerShare, groupes de prises)
    const outlets = m._outlets
      .map((id) => {
        const s = this._st(id);
        if (!s) return "";
        const name = esc(s.attributes?.friendly_name?.replace(new RegExp(`^${(dev?.name_by_user || dev?.name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "") || id);
        if (id.startsWith("switch.")) {
          const on = s.state === "on";
          return `<div class="outlet" data-entity="${esc(id)}"><ha-icon icon="mdi:power-socket-fr"></ha-icon><span>${name}</span><button class="sw${on ? " on" : ""}" data-toggle="${esc(id)}" aria-label="${on ? "Couper" : "Allumer"} ${name}"><i></i></button></div>`;
        }
        if (s.state === name || s.state === "unknown" || s.state === "unavailable") return "";
        return `<div class="outlet" data-entity="${esc(id)}"><ha-icon icon="mdi:power-socket-fr"></ha-icon><span>${name}</span><b>${esc(s.state)}</b></div>`;
      })
      .filter(Boolean)
      .join("");

    const alert = onBatt
      ? `<div class="ups-alert"><ha-icon icon="mdi:battery-alert-variant-outline"></ha-icon><div><b>Coupure secteur : l'onduleur est sur batterie.</b>${runtime !== null ? ` Autonomie restante ${duration(runtime)}.` : ""}</div></div>`
      : st.codes.includes("RB")
        ? `<div class="ups-alert warn"><ha-icon icon="mdi:battery-sync-outline"></ha-icon><div><b>La batterie doit être remplacée.</b></div></div>`
        : st.codes.includes("OVER")
          ? `<div class="ups-alert"><ha-icon icon="mdi:alert-outline"></ha-icon><div><b>Surcharge : réduisez les appareils branchés.</b></div></div>`
          : "";

    card(onBatt ? "on-batt" : "", `${header(pill)}${alert}
      <div class="gauges">${batt}${loadBox}</div>
      ${tiles.length ? `<div class="tiles ups-tiles">${tiles.join("")}</div>` : ""}
      ${c.show_details !== false ? range : ""}
      ${outlets ? `<div class="outlets"><div class="chart-h"><span>Prises</span></div>${outlets}</div>` : ""}
      ${info}`);
  }
}

const UPS_STYLE = `<style>
ha-card { display: block; padding-bottom: 14px; }
ha-card.on-batt { border-color: var(--t-red); }
.brand .box { fill: none; stroke: var(--med-green); stroke-width: 2.4; }
.sub { max-width: 260px; }
.pill.ups-ok .dot { background: var(--med-down); }
.pill.ups-info .dot { background: var(--med-blue); }
.pill.ups-warn { border-color: #f0a33a; } .pill.ups-warn .dot { background: #f0a33a; }
.pill.ups-alert { border-color: var(--t-red); } .pill.ups-alert .dot { background: var(--t-red); animation: blink 1.2s infinite; }
@keyframes blink { 50% { opacity: .25; } }
.ups-alert { display: flex; gap: 10px; align-items: center; margin: 4px 12px 0; padding: 10px 12px; border-radius: 12px;
  background: color-mix(in srgb, var(--t-red) 16%, transparent); border: 1px solid var(--t-red); font-size: .84rem; }
.ups-alert.warn { background: color-mix(in srgb, #f0a33a 14%, transparent); border-color: #f0a33a; }
.ups-alert ha-icon { color: var(--t-red); flex: none; } .ups-alert.warn ha-icon { color: #f0a33a; }
.gauges { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; margin: 10px 12px 0; }
.gauge-card { padding: 14px; border-radius: 14px; background: var(--med-surface); border: 1px solid var(--med-line); cursor: pointer; }
.g-l { font-size: .8rem; color: var(--med-muted); }
.g-v { font-size: 2.1rem; font-weight: 700; line-height: 1.15; }
.g-v span { font-size: .95rem; font-weight: 500; color: var(--med-muted); margin-left: 3px; }
.g-bar { position: relative; height: 8px; border-radius: 6px; background: var(--med-line); margin: 8px 0 6px; }
.g-bar i { display: block; height: 100%; border-radius: 6px; background: var(--med-muted); }
.g-bar.b-ok i { background: linear-gradient(90deg, var(--med-blue), var(--med-green)); }
.g-bar.b-warn i { background: #f0a33a; }
.g-bar.b-alert i { background: var(--t-red); }
.g-bar .mark { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; background: var(--med-text); opacity: .55; border-radius: 1px; }
.g-n { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: .78rem; color: var(--med-muted); }
.g-n b { color: var(--med-text); font-weight: 600; }
.g-n .g-k { color: var(--med-muted); }
.ups-tiles { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)) !important; }
.ups-tiles .tile { cursor: pointer; }
.ups-tiles .tile-v { font-size: 1.2rem; }
.range { margin: 14px 12px 0; cursor: pointer; }
.r-bar { position: relative; height: 8px; border-radius: 6px; background: color-mix(in srgb, var(--t-red) 35%, var(--med-line)); margin: 0 4px; }
.r-bar i { position: absolute; top: 0; bottom: 0; background: color-mix(in srgb, var(--med-down) 55%, var(--med-line)); }
.r-bar b { position: absolute; top: -4px; width: 4px; height: 16px; margin-left: -2px; border-radius: 2px; background: var(--med-text); }
.r-l { position: relative; height: 16px; margin: 3px 4px 0; font-size: .72rem; color: var(--med-muted); }
.r-l span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
.r-n { font-size: .74rem; color: var(--med-muted); margin: 2px 4px 0; }
.outlets { margin: 12px 12px 0; }
.outlet { display: flex; align-items: center; gap: 10px; padding: 7px 4px; border-radius: 10px; cursor: pointer; font-size: .86rem; }
.outlet:hover { background: var(--med-surface); }
.outlet ha-icon { --mdc-icon-size: 20px; color: var(--med-muted); }
.outlet span { flex: 1; }
.outlet b { font-weight: 600; }
.sw { all: unset; cursor: pointer; width: 38px; height: 22px; border-radius: 11px; background: var(--med-line); position: relative; flex: none; }
.sw i { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--med-muted); transition: left .15s; }
.sw.on { background: color-mix(in srgb, var(--med-green) 45%, transparent); } .sw.on i { left: 19px; background: var(--med-green); }
.sw:focus-visible { outline: 2px solid var(--med-blue); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 12px 0; }
.chip { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--med-line); font-size: .74rem; cursor: pointer; }
.chip span { color: var(--med-muted); }
</style>`;

/* ------------------------------------------------------------------ style */

const STYLE = `<style>
:host {
  --med-bg: #1a2434; --med-surface: #212d40; --med-line: #2f3d55;
  --med-text: #e7edf5; --med-muted: #8fa0b8;
  --med-green: #96d21f; --med-blue: #1d93e3;
  --med-hc: #4a7bd8; --med-hp: #d27333;
  --t-blue: #3f7ff0; --t-white: #e9eef4; --t-red: #ee4a4a;
  --med-up: #f08a4b; --med-down: #5fcf8a;
}
ha-card { background: var(--med-bg); color: var(--med-text); border: 1px solid var(--med-line);
  border-radius: 18px; overflow: hidden; font-variant-numeric: tabular-nums; container-type: inline-size; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px 8px; flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: 10px; }
.brand svg { width: 34px; height: 34px; fill: none; }
.brand .house { stroke: var(--med-green); stroke-width: 2.4; stroke-linejoin: round; stroke-linecap: round; }
.brand .bolt { fill: var(--med-blue); }
.title { font-size: 1.15rem; font-weight: 700; letter-spacing: .2px; }
.sub { font-size: .78rem; color: var(--med-muted); }
.tempo { display: flex; gap: 8px; }
.pill { display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px;
  background: var(--med-surface); border: 1px solid var(--med-line); font-size: .78rem; }
.pill-l { color: var(--med-muted); }
.pill-v { font-weight: 600; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; background: var(--med-muted); flex: none; }
.t-blue .dot { background: var(--t-blue); } .t-white .dot { background: var(--t-white); } .t-red .dot { background: var(--t-red); }
.t-none .pill-v { color: var(--med-muted); font-weight: 400; }
.quotas { display: flex; align-items: center; gap: 14px; padding: 0 18px 10px; font-size: .82rem; }
.quota { display: inline-flex; align-items: center; gap: 5px; font-weight: 600; }
.quota small { color: var(--med-muted); font-weight: 400; }
.quota-l { color: var(--med-muted); }

.hero { margin: 4px 12px 0; padding: 16px; border-radius: 14px; background: var(--med-surface);
  border: 1px solid var(--med-line); display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; }
.hero-l { color: var(--med-muted); font-size: .85rem; }
.hero-v { font-size: 2.4rem; font-weight: 700; line-height: 1.1; }
.hero-v span, .tile-v span { font-size: .9rem; font-weight: 500; color: var(--med-muted); margin-left: 4px; }
.hero-r { text-align: right; align-self: center; }
.cost { font-size: 1.6rem; font-weight: 700; color: var(--med-green); }
.cost.none { color: var(--med-muted); }
.cost.est { color: var(--med-text); opacity: .85; }
.hero-p { font-size: .75rem; color: var(--med-muted); margin-top: 6px; }
.cost-l { font-size: .75rem; color: var(--med-muted); max-width: 160px; }
.evo { font-size: .8rem; font-weight: 600; margin-top: 2px; }
.evo.up { color: var(--med-up); } .evo.down { color: var(--med-down); }
.split { grid-column: 1 / -1; margin-top: 6px; }
.split.wait { font-size: .8rem; color: var(--med-muted); border-top: 1px dashed var(--med-line); padding-top: 8px; }
.bar { display: flex; height: 8px; border-radius: 6px; overflow: hidden; background: var(--med-line); }
.bar i { display: block; } .bar .hc { background: var(--med-hc); } .bar .hp { background: var(--med-hp); }
.split-l { display: flex; justify-content: space-between; font-size: .78rem; margin-top: 6px; }
.k-hc { color: #8fb0f0; } .k-hp { color: #eaa070; }

.tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 10px 12px 0; }
@container (min-width: 620px) { .tiles { grid-template-columns: repeat(4, 1fr); } }
@container (min-width: 620px) { .tiles.six { grid-template-columns: repeat(3, 1fr); } }
.tile { padding: 12px; border-radius: 12px; border: 1px solid var(--med-line); }
.tile-l { font-size: .78rem; color: var(--med-muted); }
.tile-v { font-size: 1.35rem; font-weight: 700; margin-top: 2px; }
.tile-n { font-size: .72rem; color: var(--med-muted); margin-top: 4px; }

.chart { margin: 14px 12px 0; }
.chart-h { display: flex; justify-content: space-between; font-size: .82rem; color: var(--med-muted); margin: 0 4px 6px; }
.legend { display: flex; align-items: center; gap: 6px; }
.legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; margin-left: 6px; }
.legend .k-hc { background: var(--med-hc); } .legend .k-hp { background: var(--med-hp); }
.chart svg { width: 100%; height: 130px; display: block; }
.chart rect.hc { fill: var(--med-hc); } .chart rect.hp { fill: var(--med-hp); }
.chart rect.partial { fill: var(--med-muted); opacity: .35; }
.chart g.est { opacity: .45; }
.chart rect.sel { fill: rgba(255,255,255,.06); }
.chart rect.hit { fill: transparent; cursor: pointer; }
.days { display: grid; margin-top: 4px; }
.day { all: unset; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 1px;
  padding: 4px 0; border-radius: 8px; font-size: .68rem; color: var(--med-muted); text-transform: capitalize; }
.day b { color: var(--med-text); font-size: .78rem; }
.day .dot { width: 6px; height: 6px; margin-top: 2px; }
.day.on { background: var(--med-surface); }
.day:focus-visible { outline: 2px solid var(--med-blue); }

.detail { margin: 8px 12px 0; padding: 10px 12px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); }
.detail-h { display: flex; align-items: center; gap: 8px; font-size: .8rem; color: var(--med-muted); }
.tag { padding: 1px 8px; border-radius: 999px; font-size: .72rem; font-weight: 700; color: #0f1724; }
.tag.t-blue { background: var(--t-blue); color: #fff; } .tag.t-white { background: var(--t-white); } .tag.t-red { background: var(--t-red); color: #fff; }
.detail-v { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 4px; font-size: .9rem; }
.sep { width: 1px; height: 12px; background: var(--med-line); }
.detail-p { font-size: .78rem; color: var(--med-muted); margin-top: 4px; }
.warn { color: var(--t-red); font-style: normal; font-weight: 600; }

.power { margin: 10px 12px 0; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--med-line); }
.power.is-over { border-color: var(--t-red); }
.power-t { display: flex; justify-content: space-between; font-size: .85rem; }
.gauge { height: 6px; border-radius: 6px; background: var(--med-line); margin: 8px 0 6px; overflow: hidden; }
.gauge i { display: block; height: 100%; background: linear-gradient(90deg, var(--med-green), var(--med-blue)); }
.is-over .gauge i { background: var(--t-red); }
.power-n { font-size: .75rem; color: var(--med-muted); }

.eco { margin: 10px 12px 0; padding: 8px 12px; border-radius: 12px; border: 1px solid var(--med-line); font-size: .82rem; display: flex; align-items: center; gap: 8px; }
.eco.e-ok .dot { background: var(--med-down); }
.eco.e-warn { border-color: #f0a33a; } .eco.e-warn .dot { background: #f0a33a; }
.eco.e-alert { border-color: var(--t-red); } .eco.e-alert .dot { background: var(--t-red); }
.eco-l { color: var(--med-muted); }
footer { padding: 10px 18px 14px; font-size: .7rem; color: var(--med-muted); }
.empty { padding: 18px; display: flex; flex-direction: column; gap: 6px; font-size: .9rem; }
.empty span { color: var(--med-muted); }
/* Thème Home Assistant : fond, textes et bordures suivent le thème clair ou sombre */
ha-card.th-ha {
  --med-bg: var(--ha-card-background, var(--card-background-color, #fff));
  --med-surface: color-mix(in srgb, var(--primary-text-color, #000) 5%, transparent);
  --med-line: var(--divider-color, rgba(127, 127, 127, .25));
  --med-text: var(--primary-text-color, #1f2937);
  --med-muted: var(--secondary-text-color, #6b7280);
  border-radius: var(--ha-card-border-radius, 12px);
  border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
}
ha-card.th-ha.light { --med-green: #4c8a0b; --med-up: #c2560f; --med-down: #1d8a4b; }
/* Style MyElectricalData en version claire (theme: auto quand Home Assistant est en mode clair) */
ha-card.th-v2.light {
  --med-bg: #ffffff; --med-surface: #f2f5f9; --med-line: #dbe2ec;
  --med-text: #1a2434; --med-muted: #5b6b82;
  --med-green: #4c8a0b; --med-blue: #1673b8; --med-up: #c2560f; --med-down: #1d8a4b;
  box-shadow: 0 1px 3px rgba(26, 36, 52, .08);
}
ha-card.light .k-hc { color: #2f5fb8; }
ha-card.light .k-hp { color: #b35619; }
ha-card.light .t-white .dot, ha-card.light .tag.t-white { box-shadow: inset 0 0 0 1px #aab3c0; }
ha-card.light .chart rect.sel { fill: rgba(0, 0, 0, .05); }
ha-card.light .tag.t-white { color: #1f2937; }
@media (max-width: 420px) { .hero-v { font-size: 2rem; } .tempo { width: 100%; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>`;

/* ----------------------------------------------------------------- éditeur */

const THEME_SELECT = {
  name: "theme",
  selector: {
    select: {
      mode: "dropdown",
      options: [
        { value: "v2", label: "Style MyElectricalData (bleu nuit)" },
        { value: "auto", label: "Style MyElectricalData, clair ou sombre selon Home Assistant" },
        { value: "ha", label: "Thème Home Assistant (clair ou sombre)" },
      ],
    },
  },
};

/** Éditeur visuel : formulaire Home Assistant construit à partir du schéma. */
function makeEditor(schema, labels, defaults) {
  const hasDays = schema.some((s) => s.name === "days");
  return class extends HTMLElement {
    setConfig(config) {
      this._config = { ...config };
      this._draw();
    }

    set hass(hass) {
      this._hass = hass;
      if (this._form) this._form.hass = hass;
      else this._draw();
    }

    _draw() {
      if (!this._hass || !this._config) return;
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.computeLabel = (s) => labels[s.name] || s.name;
        this._form.addEventListener("value-changed", (ev) => {
          const v = { ...ev.detail.value };
          if (hasDays && v.days !== undefined) v.days = Number(v.days);
          this._config = v;
          this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: v }, bubbles: true, composed: true }));
        });
        this.appendChild(this._form);
      }
      this._form.hass = this._hass;
      this._form.schema = schema;
      this._form.data = hasDays
        ? { ...defaults, ...this._config, days: String(this._config.days || defaults.days) }
        : { ...defaults, ...this._config };
    }
  };
}

const UPS_SCHEMA = [
  { name: "device", selector: { device: { integration: "nut" } } },
  { name: "title", selector: { text: {} } },
  { name: "show_details", selector: { boolean: {} } },
  THEME_SELECT,
];
const UPS_LABELS = {
  device: "Onduleur (appareil Network UPS Tools)",
  title: "Titre (nom de l'appareil par défaut)",
  show_details: "Afficher la plage secteur et les informations",
  theme: "Couleurs de la carte",
};
const OnduleurUpsCardEditor = makeEditor(UPS_SCHEMA, UPS_LABELS, UPS_DEFAULTS);

/* ---------------------------------------------------------- enregistrement */

if (typeof customElements !== "undefined") {
  const define = (name, cls) => { if (!customElements.get(name)) customElements.define(name, cls); };
  define("onduleur-ups-card", OnduleurUpsCard);
  define("onduleur-ups-card-editor", OnduleurUpsCardEditor);
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === "onduleur-ups-card")) {
    window.customCards.push({
      type: "onduleur-ups-card",
      name: "Carte Onduleur UPS",
      description: "Batterie, autonomie, charge, tensions et état d'un onduleur (Network UPS Tools : Eaton, APC, CyberPower…).",
      preview: true,
    });
  }
  console.info(`%c ONDULEUR-UPS-CARD %c ${CARD_VERSION} `, "background:#96d21f;color:#1a2434;font-weight:700", "background:#1d93e3;color:#fff");
}
})();
