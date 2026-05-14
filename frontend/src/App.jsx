import { useEffect, useMemo, useState } from "react";
import {
  Calculator,
  CalendarDays,
  Database,
  FileClock,
  Layers,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Trash2,
} from "lucide-react";

import { api } from "./api";

const emptyForm = {
  name: "Transcript example",
  rate_list_code: "england_2023",
  location: "england",
  previous_rv: "15000",
  current_rv: "30000",
  liability_start_date: "2023-04-01",
  liability_end_date: "2024-03-31",
  is_rhl: false,
  include_placeholders: true,
};

const locations = [
  ["england", "England"],
  ["greater_london", "Greater London"],
  ["city_london", "City of London"],
];

const countries = [
  ["England", "England"],
  ["Scotland", "Scotland"],
  ["Wales", "Wales"],
];

const statuses = [
  ["active", "Active"],
  ["draft", "Draft"],
  ["archived", "Archived"],
];

const strategies = [
  ["england_2023", "England 2023"],
  ["england_2026_draft", "England 2026 draft"],
];

const locationGroups = [
  ["england", "England outside London"],
  ["london", "London"],
];

const categories = [
  ["small", "Small"],
  ["medium", "Medium"],
  ["large", "Large"],
];

const supplementScopes = [
  ["any", "Any location"],
  ["england", "England outside London"],
  ["london", "Greater London or City"],
  ["greater_london", "Greater London"],
  ["city_london", "City of London"],
];

const multiplierCodes = [
  ["small_business", "Small business"],
  ["standard", "Standard"],
  ["small_rhl", "Small RHL"],
  ["standard_rhl", "Standard RHL"],
  ["high_value", "High value"],
  ["new_multiplier", "New/custom"],
];

const supplementCodes = [
  ["standard_supplement", "Standard supplement"],
  ["crossrail", "Crossrail"],
  ["city_premium_small", "City premium small"],
  ["city_premium_standard", "City premium standard"],
  ["transitional_supplement", "Transitional supplement"],
  ["new_supplement", "New/custom"],
];

const adminPanels = [
  ["list", "List Setup"],
  ["year", "Year Rates"],
  ["transition", "Transition"],
  ["supplements", "Supplements"],
];

function money(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(number);
}

function decimal(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function requestFromForm(form) {
  return {
    rate_list_code: form.rate_list_code,
    location: form.location,
    previous_rv: form.previous_rv,
    current_rv: form.current_rv,
    liability_start_date: form.liability_start_date || null,
    liability_end_date: form.liability_end_date || null,
    is_rhl: form.is_rhl,
    include_placeholders: form.include_placeholders,
  };
}

function parseIso(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const next = parseIso(value);
  next.setUTCDate(next.getUTCDate() + days);
  return iso(next);
}

function addYearsMinusOneDay(value, years) {
  const start = parseIso(value);
  const end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + years);
  end.setUTCDate(end.getUTCDate() - 1);
  return iso(end);
}

function fiscalLabel(startDate) {
  const year = parseIso(startDate).getUTCFullYear();
  return `${year}/${String(year + 1).slice(2)}`;
}

function stripIds(value) {
  if (Array.isArray(value)) return value.map(stripIds);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "id")
      .map(([key, item]) => [key, stripIds(item)]),
  );
}

function defaultTransitionBands() {
  return [
    { location_group: "england", category: "small", min_rv: "0", max_rv: "20000", min_inclusive: true, max_inclusive: true },
    { location_group: "england", category: "medium", min_rv: "20000", max_rv: "100000", min_inclusive: false, max_inclusive: true },
    { location_group: "england", category: "large", min_rv: "100000", max_rv: null, min_inclusive: false, max_inclusive: true },
    { location_group: "london", category: "small", min_rv: "0", max_rv: "28000", min_inclusive: true, max_inclusive: true },
    { location_group: "london", category: "medium", min_rv: "28000", max_rv: "100000", min_inclusive: false, max_inclusive: true },
    { location_group: "london", category: "large", min_rv: "100000", max_rv: null, min_inclusive: false, max_inclusive: true },
  ];
}

function defaultRateYear(startDate, template, order) {
  const base = template ? stripIds(template) : {};
  return {
    label: fiscalLabel(startDate),
    start_date: startDate,
    end_date: addYearsMinusOneDay(startDate, 1),
    display_order: order,
    inflation_factor: base.inflation_factor || "1",
    source_url: base.source_url || "",
    source_note: base.source_note || "",
    multiplier_tiers:
      base.multiplier_tiers || [
        {
          code: "small_business",
          name: "Small business multiplier",
          min_rv: "0",
          max_rv: "51000",
          min_inclusive: true,
          max_inclusive: false,
          rhl_only: false,
          rate: "0.000",
        },
        {
          code: "standard",
          name: "Standard multiplier",
          min_rv: "51000",
          max_rv: null,
          min_inclusive: true,
          max_inclusive: true,
          rhl_only: false,
          rate: "0.000",
        },
      ],
    transition_caps:
      base.transition_caps || [
        { category: "small", cap_percent: "0", inflation_factor: "1", appropriate_fraction: "1" },
        { category: "medium", cap_percent: "0", inflation_factor: "1", appropriate_fraction: "1" },
        { category: "large", cap_percent: "0", inflation_factor: "1", appropriate_fraction: "1" },
      ],
    supplements: base.supplements || [],
  };
}

function App() {
  const [tab, setTab] = useState("calculator");
  const [config, setConfig] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedRateList, setSelectedRateList] = useState(0);
  const [selectedYear, setSelectedYear] = useState(0);
  const [adminPanel, setAdminPanel] = useState("list");

  async function load() {
    const [nextConfig, nextScenarios] = await Promise.all([api.config(), api.scenarios()]);
    setConfig(nextConfig);
    setScenarios(nextScenarios);
    if (nextConfig.rate_lists?.[0] && !form.rate_list_code) {
      setForm((current) => ({ ...current, rate_list_code: nextConfig.rate_lists[0].code }));
    }
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  const activeRateList = config?.rate_lists?.[selectedRateList] || null;
  const activeYear = activeRateList?.years?.[selectedYear] || null;

  async function calculate() {
    setError("");
    setNotice("");
    try {
      const payload = await api.preview(requestFromForm(form));
      setResult(payload);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveScenario() {
    setError("");
    setNotice("");
    try {
      const saved = await api.saveScenario({ name: form.name || "Untitled scenario", request: requestFromForm(form) });
      setScenarios((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setResult(saved.result_json);
      setNotice("Scenario saved");
    } catch (err) {
      setError(err.message);
    }
  }

  function loadScenario(scenario) {
    setForm({ ...emptyForm, name: scenario.name, ...scenario.request_json });
    setResult(scenario.result_json);
    setTab("calculator");
  }

  async function removeScenario(id) {
    setError("");
    await api.deleteScenario(id);
    setScenarios((current) => current.filter((item) => item.id !== id));
  }

  function updateConfig(nextConfig) {
    setConfig(nextConfig);
  }

  function updateRateList(field, value) {
    const next = structuredClone(config);
    next.rate_lists[selectedRateList][field] = value;
    updateConfig(next);
  }

  function updateBand(index, field, value) {
    const next = structuredClone(config);
    next.rate_lists[selectedRateList].transition_bands[index][field] = value;
    updateConfig(next);
  }

  function updateYear(field, value) {
    const next = structuredClone(config);
    next.rate_lists[selectedRateList].years[selectedYear][field] = value;
    updateConfig(next);
  }

  function updateYearRow(collection, index, field, value) {
    const next = structuredClone(config);
    next.rate_lists[selectedRateList].years[selectedYear][collection][index][field] = value;
    updateConfig(next);
  }

  function addRateList() {
    const next = structuredClone(config);
    const latest = [...next.rate_lists].sort((a, b) => a.end_date.localeCompare(b.end_date)).at(-1);
    const startDate = latest ? addDays(latest.end_date, 1) : "2026-04-01";
    const startYear = parseIso(startDate).getUTCFullYear();
    const template = activeRateList || latest;
    const list = {
      code: `england_${startYear}_draft`,
      name: `England ${startYear} Rating List Draft`,
      country: "England",
      status: "draft",
      calculation_strategy: "england_2026_draft",
      start_date: startDate,
      end_date: addYearsMinusOneDay(startDate, 3),
      source_url: "",
      source_note: "Draft rating-list period. Verify formulas and rates before making active.",
      verified_on: null,
      transition_bands: template?.transition_bands ? stripIds(template.transition_bands) : defaultTransitionBands(),
      years: [defaultRateYear(startDate, template?.years?.[0], 1)],
    };
    next.rate_lists.push(list);
    setSelectedRateList(next.rate_lists.length - 1);
    setSelectedYear(0);
    setAdminPanel("list");
    updateConfig(next);
  }

  function addRateYear() {
    const next = structuredClone(config);
    const years = next.rate_lists[selectedRateList].years;
    const last = [...years].sort((a, b) => a.end_date.localeCompare(b.end_date)).at(-1);
    const startDate = last ? addDays(last.end_date, 1) : next.rate_lists[selectedRateList].start_date;
    const template = activeYear || last;
    const year = defaultRateYear(startDate, template, years.length + 1);
    years.push(year);
    if (year.end_date > next.rate_lists[selectedRateList].end_date) {
      next.rate_lists[selectedRateList].end_date = year.end_date;
    }
    setSelectedYear(years.length - 1);
    setAdminPanel("year");
    updateConfig(next);
  }

  function addBand() {
    const next = structuredClone(config);
    next.rate_lists[selectedRateList].transition_bands.push({
      location_group: "england",
      category: "medium",
      min_rv: "0",
      max_rv: null,
      min_inclusive: true,
      max_inclusive: true,
    });
    updateConfig(next);
  }

  function removeBand(index) {
    const next = structuredClone(config);
    next.rate_lists[selectedRateList].transition_bands.splice(index, 1);
    updateConfig(next);
  }

  function addYearRow(collection, template) {
    const next = structuredClone(config);
    next.rate_lists[selectedRateList].years[selectedYear][collection].push(template);
    updateConfig(next);
  }

  function removeYearRow(collection, index) {
    const next = structuredClone(config);
    next.rate_lists[selectedRateList].years[selectedYear][collection].splice(index, 1);
    updateConfig(next);
  }

  async function saveConfig() {
    setError("");
    setNotice("");
    try {
      const saved = await api.saveConfig(config);
      setConfig(saved);
      setNotice("Configuration saved");
    } catch (err) {
      setError(err.message);
    }
  }

  async function resetConfig() {
    setError("");
    setNotice("");
    try {
      const saved = await api.resetSeed();
      setConfig(saved);
      setSelectedRateList(0);
      setSelectedYear(0);
      setAdminPanel("list");
      setNotice("Seed configuration restored");
    } catch (err) {
      setError(err.message);
    }
  }

  const rateListOptions = useMemo(() => config?.rate_lists || [], [config]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Calculator size={24} />
          <span>CalcuRate</span>
        </div>
        <button className={tab === "calculator" ? "nav active" : "nav"} onClick={() => setTab("calculator")}>
          <Calculator size={18} />
          Calculator
        </button>
        <button className={tab === "scenarios" ? "nav active" : "nav"} onClick={() => setTab("scenarios")}>
          <FileClock size={18} />
          Scenarios
        </button>
        <button className={tab === "admin" ? "nav active" : "nav"} onClick={() => setTab("admin")}>
          <Settings size={18} />
          Admin
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{tab === "calculator" ? "Calculator" : tab === "scenarios" ? "Scenarios" : "Admin"}</h1>
            <p>{result ? `${result.rate_list_name} - ${money(result.total)}` : "England business rates"}</p>
          </div>
          <div className="status-pill">
            <Database size={16} />
            SQLite
          </div>
        </header>

        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert notice">{notice}</div>}

        {tab === "calculator" && (
          <div className="workspace two-column">
            <section className="tool-panel">
              <div className="panel-heading">
                <h2>Inputs</h2>
                <button className="icon-button" onClick={() => setForm(emptyForm)} title="Reset inputs">
                  <RotateCcw size={18} />
                </button>
              </div>
              <div className="form-grid">
                <label>
                  Scenario name
                  <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </label>
                <label>
                  Rating list
                  <select
                    value={form.rate_list_code}
                    onChange={(event) => setForm({ ...form, rate_list_code: event.target.value })}
                  >
                    {rateListOptions.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name} ({item.status})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Location
                  <select value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })}>
                    {locations.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  RV at previous list end
                  <input
                    type="number"
                    min="0"
                    value={form.previous_rv}
                    onChange={(event) => setForm({ ...form, previous_rv: event.target.value })}
                  />
                </label>
                <label>
                  RV at revaluation
                  <input
                    type="number"
                    min="0"
                    value={form.current_rv}
                    onChange={(event) => setForm({ ...form, current_rv: event.target.value })}
                  />
                </label>
                <label>
                  Liability start
                  <input
                    type="date"
                    value={form.liability_start_date || ""}
                    onChange={(event) => setForm({ ...form, liability_start_date: event.target.value })}
                  />
                </label>
                <label>
                  Liability end
                  <input
                    type="date"
                    value={form.liability_end_date || ""}
                    onChange={(event) => setForm({ ...form, liability_end_date: event.target.value })}
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.include_placeholders}
                    onChange={(event) => setForm({ ...form, include_placeholders: event.target.checked })}
                  />
                  Relief placeholders
                </label>
              </div>
              <div className="button-row">
                <button className="primary" onClick={calculate}>
                  <Calculator size={18} />
                  Calculate
                </button>
                <button onClick={saveScenario}>
                  <Save size={18} />
                  Save
                </button>
              </div>
            </section>

            <Results result={result} />
          </div>
        )}

        {tab === "scenarios" && (
          <section className="workspace">
            <div className="table-panel">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>List</th>
                    <th>Location</th>
                    <th>Total</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((scenario) => (
                    <tr key={scenario.id}>
                      <td>{scenario.name}</td>
                      <td>{scenario.request_json.rate_list_code}</td>
                      <td>{scenario.request_json.location}</td>
                      <td>{money(scenario.result_json.total)}</td>
                      <td>{new Date(scenario.updated_at).toLocaleString()}</td>
                      <td className="actions">
                        <button onClick={() => loadScenario(scenario)}>
                          <Calculator size={16} />
                          Load
                        </button>
                        <button className="danger" onClick={() => removeScenario(scenario.id)}>
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "admin" && config && activeRateList && (
          <section className="workspace admin-workspace">
            <div className="admin-hero">
              <div>
                <span className="eyebrow">Current admin period</span>
                <h2>{activeRateList.name}</h2>
                <div className="period-meta">
                  <span>{activeRateList.start_date} to {activeRateList.end_date}</span>
                  <span className={`badge ${activeRateList.status}`}>{activeRateList.status}</span>
                  <span>{activeRateList.calculation_strategy}</span>
                </div>
              </div>
              <div className="button-row compact">
                <button className="primary" onClick={saveConfig}>
                  <Save size={16} />
                  Save config
                </button>
                <button onClick={resetConfig}>
                  <RotateCcw size={16} />
                  Reset seed
                </button>
              </div>
            </div>

            <div className="period-control-grid">
              <section className="period-card">
                <div className="period-card-icon">
                  <Layers size={18} />
                </div>
                <label>
                  Rating list period
                  <select
                    value={selectedRateList}
                    onChange={(event) => {
                      setSelectedRateList(Number(event.target.value));
                      setSelectedYear(0);
                    }}
                  >
                    {config.rate_lists.map((item, index) => (
                      <option key={item.code} value={index}>
                        {item.name} - {item.start_date} to {item.end_date}
                      </option>
                    ))}
                  </select>
                </label>
                <button onClick={addRateList}>
                  <Plus size={16} />
                  New rating list
                </button>
                <p>Use this for a new revaluation cycle.</p>
              </section>

              <section className="period-card">
                <div className="period-card-icon">
                  <CalendarDays size={18} />
                </div>
                <label>
                  Rate year
                  <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
                    {activeRateList.years.map((year, index) => (
                      <option key={`${year.label}-${index}`} value={index}>
                        {year.label} - {year.start_date} to {year.end_date}
                      </option>
                    ))}
                  </select>
                </label>
                <button onClick={addRateYear}>
                  <Plus size={16} />
                  New rate year
                </button>
                <p>Use this for the next April to March charging year.</p>
              </section>
            </div>

            <div className="admin-tabs" role="tablist" aria-label="Admin sections">
              {adminPanels.map(([value, label]) => (
                <button
                  key={value}
                  className={adminPanel === value ? "admin-tab active" : "admin-tab"}
                  onClick={() => setAdminPanel(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            {adminPanel === "list" && (
              <section className="tool-panel admin-panel">
                <div className="section-title">
                  <div>
                    <h2>Rating List Setup</h2>
                    <p>{activeRateList.start_date} to {activeRateList.end_date}</p>
                  </div>
                </div>
                <div className="form-grid admin-form-grid">
                  <Editable label="Code" value={activeRateList.code} onChange={(value) => updateRateList("code", value)} />
                  <Editable label="Name" value={activeRateList.name} onChange={(value) => updateRateList("name", value)} />
                  <SelectInput label="Country" value={activeRateList.country} options={countries} onChange={(value) => updateRateList("country", value)} />
                  <SelectInput label="Status" value={activeRateList.status} options={statuses} onChange={(value) => updateRateList("status", value)} />
                  <SelectInput
                    label="Strategy"
                    value={activeRateList.calculation_strategy}
                    options={strategies}
                    onChange={(value) => updateRateList("calculation_strategy", value)}
                  />
                  <Editable label="Start" type="date" value={activeRateList.start_date} onChange={(value) => updateRateList("start_date", value)} />
                  <Editable label="End" type="date" value={activeRateList.end_date} onChange={(value) => updateRateList("end_date", value)} />
                  <Editable
                    label="Verified"
                    type="date"
                    value={activeRateList.verified_on || ""}
                    onChange={(value) => updateRateList("verified_on", value || null)}
                  />
                </div>
                <label className="wide-label">
                  Source note
                  <textarea value={activeRateList.source_note || ""} onChange={(event) => updateRateList("source_note", event.target.value)} />
                </label>
              </section>
            )}

            {adminPanel === "year" && activeYear && (
              <section className="tool-panel admin-panel">
                <div className="section-title">
                  <div>
                    <h2>Year Rates</h2>
                    <p>{activeYear.label} - {activeYear.start_date} to {activeYear.end_date}</p>
                  </div>
                </div>
                <div className="form-grid admin-form-grid">
                  <Editable label="Label" value={activeYear.label} onChange={(value) => updateYear("label", value)} />
                  <Editable label="Start" type="date" value={activeYear.start_date} onChange={(value) => updateYear("start_date", value)} />
                  <Editable label="End" type="date" value={activeYear.end_date} onChange={(value) => updateYear("end_date", value)} />
                  <Editable
                    label="Inflation factor"
                    type="number"
                    value={decimal(activeYear.inflation_factor)}
                    onChange={(value) => updateYear("inflation_factor", value)}
                  />
                </div>
                <AdminCollection
                  title="Multipliers"
                  rows={activeYear.multiplier_tiers}
                  columns={[
                    { field: "code", label: "Code", type: "select", options: multiplierCodes },
                    { field: "name", label: "Name" },
                    { field: "min_rv", label: "Min RV", type: "number" },
                    { field: "max_rv", label: "Max RV", type: "number", allowEmpty: true },
                    { field: "min_inclusive", label: "Min incl.", type: "boolean" },
                    { field: "max_inclusive", label: "Max incl.", type: "boolean" },
                    { field: "rhl_only", label: "RHL only", type: "boolean" },
                    { field: "rate", label: "Rate", type: "number", step: "0.001" },
                  ]}
                  onChange={(index, field, value) => updateYearRow("multiplier_tiers", index, field, value)}
                  onRemove={(index) => removeYearRow("multiplier_tiers", index)}
                  onAdd={() =>
                    addYearRow("multiplier_tiers", {
                      code: "new_multiplier",
                      name: "New multiplier",
                      min_rv: "0",
                      max_rv: null,
                      min_inclusive: true,
                      max_inclusive: true,
                      rhl_only: false,
                      rate: "0.000",
                    })
                  }
                />
              </section>
            )}

            {adminPanel === "transition" && activeYear && (
              <section className="tool-panel admin-panel">
                <div className="section-title">
                  <div>
                    <h2>Transition Rules</h2>
                    <p>Bands are list-wide. Caps are year-specific.</p>
                  </div>
                </div>
                <AdminCollection
                  title="Bands"
                  rows={activeRateList.transition_bands}
                  columns={[
                    { field: "location_group", label: "Location", type: "select", options: locationGroups },
                    { field: "category", label: "Category", type: "select", options: categories },
                    { field: "min_rv", label: "Min RV", type: "number" },
                    { field: "max_rv", label: "Max RV", type: "number", allowEmpty: true },
                    { field: "min_inclusive", label: "Min incl.", type: "boolean" },
                    { field: "max_inclusive", label: "Max incl.", type: "boolean" },
                  ]}
                  onChange={updateBand}
                  onRemove={removeBand}
                  onAdd={addBand}
                />
                <AdminCollection
                  title="Annual Caps"
                  rows={activeYear.transition_caps}
                  columns={[
                    { field: "category", label: "Category", type: "select", options: categories },
                    { field: "cap_percent", label: "Cap %", type: "number" },
                    { field: "inflation_factor", label: "Inflation", type: "number", step: "0.001" },
                    { field: "appropriate_fraction", label: "AF", type: "number", step: "0.001" },
                  ]}
                  onChange={(index, field, value) => updateYearRow("transition_caps", index, field, value)}
                  onRemove={(index) => removeYearRow("transition_caps", index)}
                  onAdd={() =>
                    addYearRow("transition_caps", {
                      category: "medium",
                      cap_percent: "0",
                      inflation_factor: "1",
                      appropriate_fraction: "1",
                    })
                  }
                />
              </section>
            )}

            {adminPanel === "supplements" && activeYear && (
              <section className="tool-panel admin-panel">
                <div className="section-title">
                  <div>
                    <h2>Supplements</h2>
                    <p>{activeYear.label}</p>
                  </div>
                </div>
                <AdminCollection
                  title="Supplement Rules"
                  rows={activeYear.supplements}
                  columns={[
                    { field: "code", label: "Code", type: "select", options: supplementCodes },
                    { field: "name", label: "Name" },
                    { field: "location_scope", label: "Location", type: "select", options: supplementScopes },
                    { field: "min_rv", label: "Min RV", type: "number", allowEmpty: true },
                    { field: "max_rv", label: "Max RV", type: "number", allowEmpty: true },
                    { field: "min_inclusive", label: "Min incl.", type: "boolean" },
                    { field: "max_inclusive", label: "Max incl.", type: "boolean" },
                    { field: "rate", label: "Rate", type: "number", step: "0.001" },
                    { field: "active", label: "Active", type: "boolean" },
                  ]}
                  onChange={(index, field, value) => updateYearRow("supplements", index, field, value)}
                  onRemove={(index) => removeYearRow("supplements", index)}
                  onAdd={() =>
                    addYearRow("supplements", {
                      code: "new_supplement",
                      name: "New supplement",
                      location_scope: "any",
                      min_rv: null,
                      max_rv: null,
                      min_inclusive: true,
                      max_inclusive: true,
                      rate: "0.000",
                      active: true,
                    })
                  }
                />
              </section>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function Editable({ label, value, onChange, type = "text" }) {
  return (
    <label>
      {label}
      <input type={type} value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectInput({ label, value, options, onChange }) {
  return (
    <label>
      {label}
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function TableControl({ column, value, onChange }) {
  if (column.type === "select") {
    return (
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        {column.allowEmpty && <option value="">None</option>}
        {column.options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    );
  }

  if (column.type === "boolean") {
    return (
      <input
        className="table-checkbox"
        type="checkbox"
        checked={Boolean(value)}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }

  return (
    <input
      type={column.type || "text"}
      step={column.step || "1"}
      value={decimal(value)}
      onChange={(event) => onChange(event.target.value || null)}
    />
  );
}

function EditableTable({ rows, columns, onChange, onRemove }) {
  return (
    <div className="table-panel embedded">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.field}>{column.label}</th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.code || row.category || row.location_group}-${index}`}>
              {columns.map((column) => (
                <td key={column.field}>
                  <TableControl
                    column={column}
                    value={row[column.field]}
                    onChange={(value) => onChange(index, column.field, value)}
                  />
                </td>
              ))}
              <td>
                <button className="icon-button danger" onClick={() => onRemove(index)} title="Delete row">
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminCollection({ title, rows, columns, onChange, onRemove, onAdd }) {
  return (
    <div className="admin-section">
      <div className="panel-heading small-heading">
        <h3>{title}</h3>
        <button onClick={onAdd}>
          <Plus size={16} />
          Add row
        </button>
      </div>
      <EditableTable rows={rows} columns={columns} onChange={onChange} onRemove={onRemove} />
    </div>
  );
}

function Results({ result }) {
  if (!result) {
    return (
      <section className="tool-panel empty-state">
        <Calculator size={40} />
        <h2>No calculation yet</h2>
      </section>
    );
  }

  return (
    <section className="results-stack">
      <div className="summary-strip">
        <div>
          <span>Total</span>
          <strong>{money(result.total)}</strong>
        </div>
        <div>
          <span>Strategy</span>
          <strong>{result.calculation_strategy}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{result.status}</strong>
        </div>
      </div>
      {result.annual.map((year) => (
        <div className="table-panel" key={year.year_label}>
          <div className="year-summary">
            <h2>{year.year_label}</h2>
            <div>
              <span>{year.transition_category}</span>
              <strong>{money(year.total)}</strong>
            </div>
          </div>
          <div className="metrics">
            <Metric label="BL" value={money(year.base_liability)} />
            <Metric label="NCA" value={money(year.notional_chargeable_amount)} />
            <Metric label="TL" value={money(year.transitional_limit)} />
            <Metric label="Days" value={`${year.days_charged}/${year.days_in_year}`} />
          </div>
          <table>
            <thead>
              <tr>
                <th>Line</th>
                <th>RV</th>
                <th>Multiplier</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {year.lines.map((line) => (
                <tr key={line.code}>
                  <td>{line.label}</td>
                  <td>{line.rateable_value ? money(line.rateable_value) : ""}</td>
                  <td>{line.multiplier || ""}</td>
                  <td className={Number(line.amount) < 0 ? "negative" : ""}>{money(line.amount)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>Total</td>
                <td></td>
                <td></td>
                <td>{money(year.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default App;
