import { useEffect, useMemo, useState } from "react";
import { Calculator, Copy, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

import { api } from "./api";

const locations = [
  ["england", "England"],
  ["greater_london", "Greater London"],
  ["city_london", "City of London"],
];

function baseSide(prior = "15000", current = "30000") {
  return {
    prior_rv: prior,
    start_rv: current,
    payable_percent: "1",
    vacant: false,
    base_liability_override: "",
    charity: false,
    is_rhl: false,
    retail_relief: false,
    ssbr_current: false,
    ssbr_previous: false,
    ssbr_prior_liability: "",
    sbrr_by_year: [],
    certificate: {
      start_value: "",
      start_date: "",
      prior_value: "",
      prior_date: "",
      certificate_type: "reg18_dos",
    },
    improvement_reliefs: [],
    changes: [],
  };
}

function emptyAdvancedForm() {
  return {
    name: "Advanced scenario",
    rate_list_code: "england_2023",
    location: "england",
    calculation_number: "",
    hypothetical: false,
    allow_dates_any_order: false,
    include_placeholders: true,
    original: baseSide("15000", "30000"),
    revised: baseSide("15000", "25000"),
  };
}

function money(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function nullable(value) {
  return value === "" || value === undefined ? null : value;
}

function compactRows(rows) {
  return rows
    .map((row) => ({ ...row }))
    .filter((row) => Object.values(row).some((value) => value !== "" && value !== false && value !== null));
}

function payloadSide(side) {
  return {
    prior_rv: side.prior_rv || "0",
    start_rv: side.start_rv || "0",
    payable_percent: side.payable_percent || "1",
    vacant: side.vacant,
    base_liability_override: nullable(side.base_liability_override),
    charity: side.charity,
    is_rhl: side.is_rhl,
    retail_relief: side.retail_relief,
    ssbr_current: side.ssbr_current,
    ssbr_previous: side.ssbr_previous,
    ssbr_prior_liability: nullable(side.ssbr_prior_liability),
    sbrr_by_year: side.sbrr_by_year,
    certificate: {
      start_value: nullable(side.certificate.start_value),
      start_date: nullable(side.certificate.start_date),
      prior_value: nullable(side.certificate.prior_value),
      prior_date: nullable(side.certificate.prior_date),
      certificate_type: side.certificate.certificate_type,
    },
    improvement_reliefs: compactRows(side.improvement_reliefs).map((row) => ({
      from_date: nullable(row.from_date),
      to_date: nullable(row.to_date),
      certified_value: nullable(row.certified_value),
    })),
    changes: compactRows(side.changes).map((row) => ({
      from_date: nullable(row.from_date),
      rv: nullable(row.rv),
      payable_percent: nullable(row.payable_percent),
      vacant: row.vacant,
      certify: row.certify,
    })),
  };
}

function requestFromForm(form) {
  return {
    rate_list_code: form.rate_list_code,
    location: form.location,
    calculation_number: form.calculation_number ? Number(form.calculation_number) : null,
    hypothetical: form.hypothetical,
    allow_dates_any_order: form.allow_dates_any_order,
    include_placeholders: form.include_placeholders,
    original: payloadSide(form.original),
    revised: payloadSide(form.revised),
  };
}

function hydrateScenario(scenario) {
  const request = scenario.request_json;
  return {
    ...emptyAdvancedForm(),
    name: scenario.name,
    rate_list_code: request.rate_list_code,
    location: request.location,
    calculation_number: request.calculation_number || "",
    hypothetical: request.hypothetical,
    allow_dates_any_order: request.allow_dates_any_order,
    include_placeholders: request.include_placeholders,
    original: hydrateSide(request.original),
    revised: hydrateSide(request.revised),
  };
}

function hydrateSide(side) {
  return {
    ...baseSide(),
    ...side,
    base_liability_override: side.base_liability_override || "",
    ssbr_prior_liability: side.ssbr_prior_liability || "",
    certificate: {
      start_value: side.certificate?.start_value || "",
      start_date: side.certificate?.start_date || "",
      prior_value: side.certificate?.prior_value || "",
      prior_date: side.certificate?.prior_date || "",
      certificate_type: side.certificate?.certificate_type || "reg18_dos",
    },
    improvement_reliefs: side.improvement_reliefs || [],
    changes: side.changes || [],
  };
}

function adjustSbrrYears(form, yearCount) {
  const next = structuredClone(form);
  for (const sideName of ["original", "revised"]) {
    const flags = next[sideName].sbrr_by_year || [];
    next[sideName].sbrr_by_year = Array.from({ length: yearCount }, (_, index) => Boolean(flags[index]));
  }
  return next;
}

export function AdvancedCalculator({ config, onError, onNotice }) {
  const [form, setForm] = useState(emptyAdvancedForm);
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState([]);

  const rateLists = config?.rate_lists || [];
  const activeRateList = useMemo(
    () => rateLists.find((item) => item.code === form.rate_list_code) || rateLists[0],
    [rateLists, form.rate_list_code],
  );
  const rateYears = activeRateList?.years || [];

  useEffect(() => {
    api.advancedScenarios().then(setSaved).catch((err) => onError(err.message));
  }, [onError]);

  useEffect(() => {
    if (activeRateList && form.rate_list_code !== activeRateList.code) {
      setForm((current) => ({ ...current, rate_list_code: activeRateList.code }));
    }
  }, [activeRateList, form.rate_list_code]);

  useEffect(() => {
    setForm((current) => adjustSbrrYears(current, rateYears.length));
  }, [rateYears.length]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateSide(sideName, field, value) {
    setForm((current) => ({ ...current, [sideName]: { ...current[sideName], [field]: value } }));
  }

  function updateNested(sideName, group, field, value) {
    setForm((current) => ({
      ...current,
      [sideName]: {
        ...current[sideName],
        [group]: { ...current[sideName][group], [field]: value },
      },
    }));
  }

  function updateRow(sideName, collection, index, field, value) {
    setForm((current) => {
      const rows = [...current[sideName][collection]];
      rows[index] = { ...rows[index], [field]: value };
      return { ...current, [sideName]: { ...current[sideName], [collection]: rows } };
    });
  }

  function addRow(sideName, collection, row) {
    setForm((current) => ({
      ...current,
      [sideName]: { ...current[sideName], [collection]: [...current[sideName][collection], row] },
    }));
  }

  function removeRow(sideName, collection, index) {
    setForm((current) => {
      const rows = current[sideName][collection].filter((_, rowIndex) => rowIndex !== index);
      return { ...current, [sideName]: { ...current[sideName], [collection]: rows } };
    });
  }

  function updateSbrr(sideName, index, checked) {
    setForm((current) => {
      const flags = [...current[sideName].sbrr_by_year];
      flags[index] = checked;
      return { ...current, [sideName]: { ...current[sideName], sbrr_by_year: flags } };
    });
  }

  async function preview() {
    onError("");
    onNotice("");
    try {
      const payload = await api.previewAdvanced(requestFromForm(form));
      setResult(payload);
    } catch (err) {
      onError(err.message);
    }
  }

  async function save() {
    onError("");
    onNotice("");
    try {
      const scenario = await api.saveAdvancedScenario({ name: form.name || "Untitled advanced scenario", request: requestFromForm(form) });
      setSaved((current) => [scenario, ...current.filter((item) => item.id !== scenario.id)]);
      setResult(scenario.result_json);
      onNotice("Advanced scenario saved");
    } catch (err) {
      onError(err.message);
    }
  }

  async function removeScenario(id) {
    onError("");
    await api.deleteAdvancedScenario(id);
    setSaved((current) => current.filter((item) => item.id !== id));
  }

  function loadScenario(scenario) {
    setForm(adjustSbrrYears(hydrateScenario(scenario), rateYears.length));
    setResult(scenario.result_json);
  }

  function copyOriginal() {
    setForm((current) => ({ ...current, revised: structuredClone(current.original) }));
  }

  return (
    <section className="workspace advanced-workspace">
      <div className="admin-hero">
        <div>
          <span className="eyebrow">Advanced calculation period</span>
          <h2>{activeRateList?.name || "No rating list loaded"}</h2>
          <div className="period-meta">
            {activeRateList && <span>{activeRateList.start_date} to {activeRateList.end_date}</span>}
            {activeRateList && <span className={`badge ${activeRateList.status}`}>{activeRateList.status}</span>}
            {result && <span>Saving {money(result.total_saving)}</span>}
          </div>
        </div>
        <div className="button-row compact">
          <button className="primary" onClick={preview}>
            <Calculator size={16} />
            Calculate
          </button>
          <button onClick={save}>
            <Save size={16} />
            Save
          </button>
          <button onClick={() => setForm(adjustSbrrYears(emptyAdvancedForm(), rateYears.length))}>
            <RotateCcw size={16} />
            Reset
          </button>
        </div>
      </div>

      <section className="tool-panel">
        <div className="form-grid admin-form-grid">
          <label>
            Scenario name
            <input value={form.name} onChange={(event) => update("name", event.target.value)} />
          </label>
          <label>
            Rating list
            <select
              value={form.rate_list_code}
              onChange={(event) => setForm(adjustSbrrYears({ ...form, rate_list_code: event.target.value }, rateLists.find((item) => item.code === event.target.value)?.years?.length || 0))}
            >
              {rateLists.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name} ({item.status})
                </option>
              ))}
            </select>
          </label>
          <label>
            Location
            <select value={form.location} onChange={(event) => update("location", event.target.value)}>
              {locations.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Calculation number
            <input type="number" min="1" value={form.calculation_number} onChange={(event) => update("calculation_number", event.target.value)} />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.hypothetical} onChange={(event) => update("hypothetical", event.target.checked)} />
            Hypothetical
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.allow_dates_any_order} onChange={(event) => update("allow_dates_any_order", event.target.checked)} />
            Allow dates in any order
          </label>
        </div>
      </section>

      <div className="advanced-sides">
        <SidePanel
          title="Original"
          sideName="original"
          side={form.original}
          rateYears={rateYears}
          onSide={updateSide}
          onNested={updateNested}
          onRow={updateRow}
          onAdd={addRow}
          onRemove={removeRow}
          onSbrr={updateSbrr}
        />
        <SidePanel
          title="Revised"
          sideName="revised"
          side={form.revised}
          rateYears={rateYears}
          onSide={updateSide}
          onNested={updateNested}
          onRow={updateRow}
          onAdd={addRow}
          onRemove={removeRow}
          onSbrr={updateSbrr}
          action={
            <button onClick={copyOriginal}>
              <Copy size={16} />
              Copy original
            </button>
          }
        />
      </div>

      <ValidationSummary result={result} />
      <AdvancedResults result={result} />
      <SavedAdvancedScenarios scenarios={saved} onLoad={loadScenario} onDelete={removeScenario} />
    </section>
  );
}

function SidePanel({ title, sideName, side, rateYears, onSide, onNested, onRow, onAdd, onRemove, onSbrr, action }) {
  return (
    <section className="tool-panel advanced-side">
      <div className="panel-heading">
        <h2>{title}</h2>
        {action}
      </div>
      <div className="form-grid">
        <NumberInput label="Prior-list RV" value={side.prior_rv} onChange={(value) => onSide(sideName, "prior_rv", value)} />
        <NumberInput label="RV at list start" value={side.start_rv} onChange={(value) => onSide(sideName, "start_rv", value)} />
        <NumberInput label="% payable" value={side.payable_percent} step="0.01" onChange={(value) => onSide(sideName, "payable_percent", value)} />
        <NumberInput label="Base liability override" value={side.base_liability_override} onChange={(value) => onSide(sideName, "base_liability_override", value)} />
        <CheckInput label="Vacant at list start" checked={side.vacant} onChange={(value) => onSide(sideName, "vacant", value)} />
        <CheckInput label="Charity" checked={side.charity} onChange={(value) => onSide(sideName, "charity", value)} />
        <CheckInput label="RHL multiplier/relief" checked={side.is_rhl} onChange={(value) => onSide(sideName, "is_rhl", value)} />
        <CheckInput label="Retail relief" checked={side.retail_relief} onChange={(value) => onSide(sideName, "retail_relief", value)} />
      </div>

      <details className="advanced-section" open>
        <summary>Date changes</summary>
        <RowsTable
          rows={side.changes}
          columns={[
            ["from_date", "From", "date"],
            ["rv", "RV", "number"],
            ["payable_percent", "% payable", "number"],
            ["vacant", "Vacant", "checkbox"],
            ["certify", "Certify", "checkbox"],
          ]}
          onChange={(index, field, value) => onRow(sideName, "changes", index, field, value)}
          onRemove={(index) => onRemove(sideName, "changes", index)}
          onAdd={() => onAdd(sideName, "changes", { from_date: "", rv: "", payable_percent: "1", vacant: false, certify: false })}
        />
      </details>

      <details className="advanced-section">
        <summary>SBRR, SSBR and certificates</summary>
        <div className="year-flag-grid">
          {rateYears.map((year, index) => (
            <CheckInput
              key={year.label}
              label={`SBRR ${year.label}`}
              checked={Boolean(side.sbrr_by_year[index])}
              onChange={(value) => onSbrr(sideName, index, value)}
            />
          ))}
        </div>
        <div className="form-grid">
          <CheckInput label="SSBR current" checked={side.ssbr_current} onChange={(value) => onSide(sideName, "ssbr_current", value)} />
          <CheckInput label="SSBR previous" checked={side.ssbr_previous} onChange={(value) => onSide(sideName, "ssbr_previous", value)} />
          <NumberInput label="SSBR prior liability" value={side.ssbr_prior_liability} onChange={(value) => onSide(sideName, "ssbr_prior_liability", value)} />
          <label>
            Certificate type
            <select value={side.certificate.certificate_type} onChange={(event) => onNested(sideName, "certificate", "certificate_type", event.target.value)}>
              <option value="reg18_dos">Reg 18 / DOS</option>
              <option value="reg16_mcc">Reg 16 / MCC</option>
            </select>
          </label>
          <NumberInput label="Start certificate value" value={side.certificate.start_value} onChange={(value) => onNested(sideName, "certificate", "start_value", value)} />
          <label>
            Start certificate date
            <input type="date" value={side.certificate.start_date} onChange={(event) => onNested(sideName, "certificate", "start_date", event.target.value)} />
          </label>
          <NumberInput label="Prior certificate value" value={side.certificate.prior_value} onChange={(value) => onNested(sideName, "certificate", "prior_value", value)} />
          <label>
            Prior certificate date
            <input type="date" value={side.certificate.prior_date} onChange={(event) => onNested(sideName, "certificate", "prior_date", event.target.value)} />
          </label>
        </div>
      </details>

      <details className="advanced-section">
        <summary>Improvement relief</summary>
        <RowsTable
          rows={side.improvement_reliefs}
          columns={[
            ["from_date", "From", "date"],
            ["to_date", "To", "date"],
            ["certified_value", "Certified value", "number"],
          ]}
          onChange={(index, field, value) => onRow(sideName, "improvement_reliefs", index, field, value)}
          onRemove={(index) => onRemove(sideName, "improvement_reliefs", index)}
          onAdd={() => onAdd(sideName, "improvement_reliefs", { from_date: "", to_date: "", certified_value: "" })}
        />
      </details>
    </section>
  );
}

function NumberInput({ label, value, onChange, step = "1" }) {
  return (
    <label>
      {label}
      <input type="number" min="0" step={step} value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function CheckInput({ label, checked, onChange }) {
  return (
    <label className="checkbox-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function RowsTable({ rows, columns, onChange, onRemove, onAdd }) {
  return (
    <div className="table-panel embedded advanced-table">
      <table>
        <thead>
          <tr>
            {columns.map(([, label]) => (
              <th key={label}>{label}</th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map(([field, label, type]) => (
                <td key={field}>
                  {type === "checkbox" ? (
                    <input className="table-checkbox" type="checkbox" checked={Boolean(row[field])} onChange={(event) => onChange(index, field, event.target.checked)} aria-label={label} />
                  ) : (
                    <input type={type} value={row[field] || ""} onChange={(event) => onChange(index, field, event.target.value)} aria-label={label} />
                  )}
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
      <button className="add-row-button" onClick={onAdd}>
        <Plus size={16} />
        Add row
      </button>
    </div>
  );
}

function ValidationSummary({ result }) {
  if (!result?.issues?.length) return null;
  const errors = result.issues.filter((item) => item.severity === "error");
  const warnings = result.issues.filter((item) => item.severity === "warning");
  return (
    <section className="tool-panel validation-panel">
      <div className="panel-heading">
        <h2>Validation</h2>
        <span className={errors.length ? "badge draft" : "badge active"}>{errors.length ? `${errors.length} errors` : `${warnings.length} warnings`}</span>
      </div>
      <ul>
        {result.issues.map((item, index) => (
          <li key={`${item.field}-${index}`} className={item.severity}>
            <strong>{item.field}</strong> {item.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AdvancedResults({ result }) {
  if (!result || result.comparison.length === 0) {
    return (
      <section className="tool-panel empty-state">
        <Calculator size={36} />
        <h2>No advanced calculation yet</h2>
      </section>
    );
  }

  return (
    <section className="results-stack">
      <div className="summary-strip">
        <div>
          <span>Original</span>
          <strong>{money(result.total_original)}</strong>
        </div>
        <div>
          <span>Revised</span>
          <strong>{money(result.total_revised)}</strong>
        </div>
        <div>
          <span>Saving</span>
          <strong>{money(result.total_saving)}</strong>
        </div>
      </div>
      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Rate year</th>
              <th>Original</th>
              <th>Original basis</th>
              <th>Revised</th>
              <th>Revised basis</th>
              <th>Saving</th>
            </tr>
          </thead>
          <tbody>
            {result.comparison.map((row) => (
              <tr key={row.year_label}>
                <td>{row.year_label}</td>
                <td>{money(row.original_total)}</td>
                <td>{row.original_phased ? "Phased" : "True"}</td>
                <td>{money(row.revised_total)}</td>
                <td>{row.revised_phased ? "Phased" : "True"}</td>
                <td className={Number(row.saving) < 0 ? "negative" : ""}>{money(row.saving)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SavedAdvancedScenarios({ scenarios, onLoad, onDelete }) {
  if (!scenarios.length) return null;
  return (
    <section className="table-panel">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>List</th>
            <th>Saving</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map((scenario) => (
            <tr key={scenario.id}>
              <td>{scenario.name}</td>
              <td>{scenario.request_json.rate_list_code}</td>
              <td>{money(scenario.result_json.total_saving)}</td>
              <td>{new Date(scenario.updated_at).toLocaleString()}</td>
              <td className="actions">
                <button onClick={() => onLoad(scenario)}>
                  <Calculator size={16} />
                  Load
                </button>
                <button className="danger" onClick={() => onDelete(scenario.id)}>
                  <Trash2 size={16} />
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
