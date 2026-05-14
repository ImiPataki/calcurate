import { useEffect, useMemo, useState } from "react";
import { Calculator, Copy, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

import { api } from "./api";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./components/ui/accordion";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Checkbox, CheckboxField } from "./components/ui/checkbox";
import { Input } from "./components/ui/input";
import { Field } from "./components/ui/label";
import { NativeSelect } from "./components/ui/select";
import { SwitchField } from "./components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";

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
    <section className="space-y-4 p-5 md:p-8">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardDescription>Advanced calculation period</CardDescription>
            <CardTitle className="mt-1">{activeRateList?.name || "No rating list loaded"}</CardTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeRateList && <Badge variant="outline">{activeRateList.start_date} to {activeRateList.end_date}</Badge>}
              {activeRateList && <Badge variant={activeRateList.status === "active" ? "success" : "warning"}>{activeRateList.status}</Badge>}
              {result && <Badge variant="secondary">Saving {money(result.total_saving)}</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={preview}>
              <Calculator className="h-4 w-4" />
              Calculate
            </Button>
            <Button variant="outline" onClick={save}>
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button variant="outline" onClick={() => setForm(adjustSbrrYears(emptyAdvancedForm(), rateYears.length))}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scenario setup</CardTitle>
          <CardDescription>Shared metadata and rating-list context.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Field label="Scenario name">
            <Input value={form.name} onChange={(event) => update("name", event.target.value)} />
          </Field>
          <Field label="Rating list">
            <NativeSelect
              value={form.rate_list_code}
              onChange={(event) => {
                const yearCount = rateLists.find((item) => item.code === event.target.value)?.years?.length || 0;
                setForm(adjustSbrrYears({ ...form, rate_list_code: event.target.value }, yearCount));
              }}
            >
              {rateLists.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name} ({item.status})
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Location">
            <NativeSelect value={form.location} onChange={(event) => update("location", event.target.value)}>
              {locations.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Calculation number">
            <Input type="number" min="1" value={form.calculation_number} onChange={(event) => update("calculation_number", event.target.value)} />
          </Field>
          <SwitchField label="Hypothetical" checked={form.hypothetical} onCheckedChange={(checked) => update("hypothetical", checked)} />
          <SwitchField label="Allow dates in any order" checked={form.allow_dates_any_order} onCheckedChange={(checked) => update("allow_dates_any_order", checked)} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
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
            <Button variant="outline" size="sm" onClick={copyOriginal}>
              <Copy className="h-3.5 w-3.5" />
              Copy original
            </Button>
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
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Scenario side inputs</CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <NumberInput label="Prior-list RV" value={side.prior_rv} onChange={(value) => onSide(sideName, "prior_rv", value)} />
          <NumberInput label="RV at list start" value={side.start_rv} onChange={(value) => onSide(sideName, "start_rv", value)} />
          <NumberInput label="% payable" value={side.payable_percent} step="0.01" onChange={(value) => onSide(sideName, "payable_percent", value)} />
          <NumberInput label="Base liability override" value={side.base_liability_override} onChange={(value) => onSide(sideName, "base_liability_override", value)} />
          <CheckboxField label="Vacant at list start" checked={side.vacant} onCheckedChange={(value) => onSide(sideName, "vacant", value)} />
          <CheckboxField label="Charity" checked={side.charity} onCheckedChange={(value) => onSide(sideName, "charity", value)} />
          <CheckboxField label="RHL multiplier/relief" checked={side.is_rhl} onCheckedChange={(value) => onSide(sideName, "is_rhl", value)} />
          <CheckboxField label="Retail relief" checked={side.retail_relief} onCheckedChange={(value) => onSide(sideName, "retail_relief", value)} />
        </div>

        <Accordion type="multiple" defaultValue={["dates"]}>
          <AccordionItem value="dates">
            <AccordionTrigger>Date changes</AccordionTrigger>
            <AccordionContent>
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
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="reliefs">
            <AccordionTrigger>SBRR, SSBR and certificates</AccordionTrigger>
            <AccordionContent className="space-y-4">
              <div className="grid gap-2 md:grid-cols-3">
                {rateYears.map((year, index) => (
                  <CheckboxField
                    key={year.label}
                    label={`SBRR ${year.label}`}
                    checked={Boolean(side.sbrr_by_year[index])}
                    onCheckedChange={(value) => onSbrr(sideName, index, value)}
                  />
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <CheckboxField label="SSBR current" checked={side.ssbr_current} onCheckedChange={(value) => onSide(sideName, "ssbr_current", value)} />
                <CheckboxField label="SSBR previous" checked={side.ssbr_previous} onCheckedChange={(value) => onSide(sideName, "ssbr_previous", value)} />
                <NumberInput label="SSBR prior liability" value={side.ssbr_prior_liability} onChange={(value) => onSide(sideName, "ssbr_prior_liability", value)} />
                <Field label="Certificate type">
                  <NativeSelect value={side.certificate.certificate_type} onChange={(event) => onNested(sideName, "certificate", "certificate_type", event.target.value)}>
                    <option value="reg18_dos">Reg 18 / DOS</option>
                    <option value="reg16_mcc">Reg 16 / MCC</option>
                  </NativeSelect>
                </Field>
                <NumberInput label="Start certificate value" value={side.certificate.start_value} onChange={(value) => onNested(sideName, "certificate", "start_value", value)} />
                <Field label="Start certificate date">
                  <Input type="date" value={side.certificate.start_date} onChange={(event) => onNested(sideName, "certificate", "start_date", event.target.value)} />
                </Field>
                <NumberInput label="Prior certificate value" value={side.certificate.prior_value} onChange={(value) => onNested(sideName, "certificate", "prior_value", value)} />
                <Field label="Prior certificate date">
                  <Input type="date" value={side.certificate.prior_date} onChange={(event) => onNested(sideName, "certificate", "prior_date", event.target.value)} />
                </Field>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="improvements">
            <AccordionTrigger>Improvement relief</AccordionTrigger>
            <AccordionContent>
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
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function NumberInput({ label, value, onChange, step = "1" }) {
  return (
    <Field label={label}>
      <Input type="number" min="0" step={step} value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function RowsTable({ rows, columns, onChange, onRemove, onAdd }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(([, label]) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {columns.map(([field, label, type]) => (
                  <TableCell key={field}>
                    {type === "checkbox" ? (
                      <Checkbox checked={Boolean(row[field])} onCheckedChange={(checked) => onChange(index, field, Boolean(checked))} aria-label={label} />
                    ) : (
                      <Input className="h-8 min-w-28" type={type} value={row[field] || ""} onChange={(event) => onChange(index, field, event.target.value)} aria-label={label} />
                    )}
                  </TableCell>
                ))}
                <TableCell>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => onRemove(index)} title="Delete row">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button variant="outline" size="sm" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" />
        Add row
      </Button>
    </div>
  );
}

function ValidationSummary({ result }) {
  if (!result?.issues?.length) return null;
  const errors = result.issues.filter((item) => item.severity === "error");
  const warnings = result.issues.filter((item) => item.severity === "warning");
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Validation</CardTitle>
          <CardDescription>Resolve blocking errors before relying on the result.</CardDescription>
        </div>
        <Badge variant={errors.length ? "destructive" : "warning"}>
          {errors.length ? `${errors.length} errors` : `${warnings.length} warnings`}
        </Badge>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 text-sm">
          {result.issues.map((item, index) => (
            <li key={`${item.field}-${index}`} className={item.severity === "error" ? "text-destructive" : "text-[#6e5500]"}>
              <span className="font-medium">{item.field}</span> {item.message}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AdvancedResults({ result }) {
  if (!result || result.comparison.length === 0) {
    return (
      <Card className="grid min-h-64 place-items-center text-muted-foreground">
        <div className="grid justify-items-center gap-2">
          <Calculator className="h-9 w-9" />
          <CardTitle className="text-sm">No advanced calculation yet</CardTitle>
        </div>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Original" value={money(result.total_original)} />
        <MetricCard label="Revised" value={money(result.total_revised)} />
        <MetricCard label="Saving" value={money(result.total_saving)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Annual comparison</CardTitle>
          <CardDescription>Original liability, revised liability, and saving by rate year.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rate year</TableHead>
                  <TableHead>Original</TableHead>
                  <TableHead>Original basis</TableHead>
                  <TableHead>Revised</TableHead>
                  <TableHead>Revised basis</TableHead>
                  <TableHead>Saving</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.comparison.map((row) => (
                  <TableRow key={row.year_label}>
                    <TableCell className="font-medium">{row.year_label}</TableCell>
                    <TableCell>{money(row.original_total)}</TableCell>
                    <TableCell>{row.original_phased ? "Phased" : "True"}</TableCell>
                    <TableCell>{money(row.revised_total)}</TableCell>
                    <TableCell>{row.revised_phased ? "Phased" : "True"}</TableCell>
                    <TableCell className={Number(row.saving) < 0 ? "text-destructive" : "font-medium text-primary"}>{money(row.saving)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function SavedAdvancedScenarios({ scenarios, onLoad, onDelete }) {
  if (!scenarios.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved advanced scenarios</CardTitle>
        <CardDescription>Reload previous original-vs-revised calculations.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>List</TableHead>
                <TableHead>Saving</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenarios.map((scenario) => (
                <TableRow key={scenario.id}>
                  <TableCell className="font-medium">{scenario.name}</TableCell>
                  <TableCell>{scenario.request_json.rate_list_code}</TableCell>
                  <TableCell>{money(scenario.result_json.total_saving)}</TableCell>
                  <TableCell>{new Date(scenario.updated_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => onLoad(scenario)}>
                        <Calculator className="h-3.5 w-3.5" />
                        Load
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => onDelete(scenario.id)} title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="mt-1 text-sm font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
