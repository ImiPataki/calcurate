import { useEffect, useMemo, useState } from "react";
import { Calculator, CalendarDays, Database, FileClock, GitCompareArrows, Layers, Plus, RotateCcw, Save, Settings, Trash2 } from "lucide-react";

import { AdvancedCalculator } from "./AdvancedCalculator";
import { api } from "./api";
import { Alert } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Checkbox, CheckboxField } from "./components/ui/checkbox";
import { Input, Textarea } from "./components/ui/input";
import { Field } from "./components/ui/label";
import { NativeSelect } from "./components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { cn } from "./lib/utils";

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

const countries = [["England", "England"], ["Scotland", "Scotland"], ["Wales", "Wales"]];
const statuses = [["active", "Active"], ["draft", "Draft"], ["archived", "Archived"]];
const strategies = [["england_2023", "England 2023"], ["england_2026", "England 2026"]];
const locationGroups = [["england", "England outside London"], ["london", "London"]];
const categories = [["small", "Small"], ["medium", "Medium"], ["large", "Large"]];

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
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
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
  const rateListOptions = useMemo(() => config?.rate_lists || [], [config]);

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
      calculation_strategy: "england_2026",
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

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b bg-primary text-primary-foreground lg:min-h-screen lg:border-b-0 lg:border-r lg:border-primary/20">
        <div className="flex items-center gap-2 px-4 py-4 text-base font-semibold lg:px-5">
          <Calculator className="h-5 w-5" />
          <span>CalcuRate</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:grid lg:px-3">
          <NavButton active={tab === "calculator"} icon={Calculator} onClick={() => setTab("calculator")}>
            Calculator
          </NavButton>
          <NavButton active={tab === "advanced"} icon={GitCompareArrows} onClick={() => setTab("advanced")}>
            Advanced
          </NavButton>
          <NavButton active={tab === "scenarios"} icon={FileClock} onClick={() => setTab("scenarios")}>
            Scenarios
          </NavButton>
          <NavButton active={tab === "admin"} icon={Settings} onClick={() => setTab("admin")}>
            Admin
          </NavButton>
        </nav>
      </aside>

      <main className="min-w-0">
        <header className="flex items-start justify-between gap-4 border-b bg-card px-5 py-4 md:px-8">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {tab === "calculator" ? "Calculator" : tab === "advanced" ? "Advanced" : tab === "scenarios" ? "Scenarios" : "Admin"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tab === "advanced" ? "Original and revised liability comparison" : result ? `${result.rate_list_name} - ${money(result.total)}` : "England business rates"}
            </p>
          </div>
          <Badge variant="success" className="gap-1.5">
            <Database className="h-3.5 w-3.5" />
            SQLite
          </Badge>
        </header>

        <div className="space-y-3 px-5 pt-4 md:px-8">
          {error && <Alert variant="destructive">{error}</Alert>}
          {notice && <Alert variant="success">{notice}</Alert>}
        </div>

        {tab === "calculator" && (
          <div className="grid gap-4 p-5 md:p-8 lg:grid-cols-[420px_minmax(0,1fr)]">
            <CalculatorInputs
              form={form}
              setForm={setForm}
              rateListOptions={rateListOptions}
              onCalculate={calculate}
              onSave={saveScenario}
            />
            <Results result={result} />
          </div>
        )}

        {tab === "advanced" && config && <AdvancedCalculator config={config} onError={setError} onNotice={setNotice} />}
        {tab === "scenarios" && <ScenarioList scenarios={scenarios} onLoad={loadScenario} onDelete={removeScenario} />}

        {tab === "admin" && config && activeRateList && (
          <AdminPage
            config={config}
            activeRateList={activeRateList}
            activeYear={activeYear}
            selectedRateList={selectedRateList}
            selectedYear={selectedYear}
            adminPanel={adminPanel}
            setSelectedRateList={setSelectedRateList}
            setSelectedYear={setSelectedYear}
            setAdminPanel={setAdminPanel}
            addRateList={addRateList}
            addRateYear={addRateYear}
            saveConfig={saveConfig}
            resetConfig={resetConfig}
            updateRateList={updateRateList}
            updateYear={updateYear}
            updateBand={updateBand}
            addBand={addBand}
            removeBand={removeBand}
            updateYearRow={updateYearRow}
            addYearRow={addYearRow}
            removeYearRow={removeYearRow}
          />
        )}
      </main>
    </div>
  );
}

function NavButton({ active, icon: Icon, children, onClick }) {
  return (
    <Button
      variant="ghost"
      className={cn(
        "h-9 justify-start border-transparent px-3 text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground",
        active && "bg-white text-primary shadow-sm hover:bg-white hover:text-primary",
      )}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      {children}
    </Button>
  );
}

function CalculatorInputs({ form, setForm, rateListOptions, onCalculate, onSave }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Inputs</CardTitle>
          <CardDescription>Core liability calculation</CardDescription>
        </div>
        <Button variant="outline" size="icon" onClick={() => setForm(emptyForm)} title="Reset inputs">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Scenario name">
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Rating list">
            <NativeSelect value={form.rate_list_code} onChange={(event) => setForm({ ...form, rate_list_code: event.target.value })}>
              {rateListOptions.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name} ({item.status})
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Location">
            <NativeSelect value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })}>
              {locations.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="RV at previous list end">
            <Input type="number" min="0" value={form.previous_rv} onChange={(event) => setForm({ ...form, previous_rv: event.target.value })} />
          </Field>
          <Field label="RV at revaluation">
            <Input type="number" min="0" value={form.current_rv} onChange={(event) => setForm({ ...form, current_rv: event.target.value })} />
          </Field>
          <Field label="Liability start">
            <Input type="date" value={form.liability_start_date || ""} onChange={(event) => setForm({ ...form, liability_start_date: event.target.value })} />
          </Field>
          <Field label="Liability end">
            <Input type="date" value={form.liability_end_date || ""} onChange={(event) => setForm({ ...form, liability_end_date: event.target.value })} />
          </Field>
          <CheckboxField
            label="Relief placeholders"
            checked={form.include_placeholders}
            onCheckedChange={(checked) => setForm({ ...form, include_placeholders: checked })}
            className="self-end"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onCalculate}>
            <Calculator className="h-4 w-4" />
            Calculate
          </Button>
          <Button variant="outline" onClick={onSave}>
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ScenarioList({ scenarios, onLoad, onDelete }) {
  return (
    <div className="p-5 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle>Saved scenarios</CardTitle>
          <CardDescription>Load or remove basic calculation scenarios.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>List</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenarios.map((scenario) => (
                <TableRow key={scenario.id}>
                  <TableCell className="font-medium">{scenario.name}</TableCell>
                  <TableCell>{scenario.request_json.rate_list_code}</TableCell>
                  <TableCell>{scenario.request_json.location}</TableCell>
                  <TableCell>{money(scenario.result_json.total)}</TableCell>
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
        </CardContent>
      </Card>
    </div>
  );
}

function AdminPage(props) {
  const {
    config,
    activeRateList,
    activeYear,
    selectedRateList,
    selectedYear,
    adminPanel,
    setSelectedRateList,
    setSelectedYear,
    setAdminPanel,
    addRateList,
    addRateYear,
    saveConfig,
    resetConfig,
    updateRateList,
    updateYear,
    updateBand,
    addBand,
    removeBand,
    updateYearRow,
    addYearRow,
    removeYearRow,
  } = props;

  return (
    <div className="space-y-4 p-5 md:p-8">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardDescription>Current admin period</CardDescription>
            <CardTitle className="mt-1">{activeRateList.name}</CardTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">{activeRateList.start_date} to {activeRateList.end_date}</Badge>
              <StatusBadge status={activeRateList.status} />
              <Badge variant="secondary">{activeRateList.calculation_strategy}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveConfig}>
              <Save className="h-4 w-4" />
              Save config
            </Button>
            <Button variant="outline" onClick={resetConfig}>
              <RotateCcw className="h-4 w-4" />
              Reset seed
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <PeriodPicker
          icon={Layers}
          label="Rating list period"
          description="Use this for a new revaluation cycle."
          value={selectedRateList}
          onChange={(value) => {
            setSelectedRateList(Number(value));
            setSelectedYear(0);
          }}
          options={config.rate_lists.map((item, index) => [index, `${item.name} - ${item.start_date} to ${item.end_date}`])}
          action={addRateList}
          actionLabel="New rating list"
        />
        <PeriodPicker
          icon={CalendarDays}
          label="Rate year"
          description="Use this for the next April to March charging year."
          value={selectedYear}
          onChange={(value) => setSelectedYear(Number(value))}
          options={activeRateList.years.map((year, index) => [index, `${year.label} - ${year.start_date} to ${year.end_date}`])}
          action={addRateYear}
          actionLabel="New rate year"
        />
      </div>

      <Tabs value={adminPanel} onValueChange={setAdminPanel}>
        <TabsList>
          {adminPanels.map(([value, label]) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle>Rating List Setup</CardTitle>
              <CardDescription>{activeRateList.start_date} to {activeRateList.end_date}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <Editable label="Code" value={activeRateList.code} onChange={(value) => updateRateList("code", value)} />
                <Editable label="Name" value={activeRateList.name} onChange={(value) => updateRateList("name", value)} />
                <SelectInput label="Country" value={activeRateList.country} options={countries} onChange={(value) => updateRateList("country", value)} />
                <SelectInput label="Status" value={activeRateList.status} options={statuses} onChange={(value) => updateRateList("status", value)} />
                <SelectInput label="Strategy" value={activeRateList.calculation_strategy} options={strategies} onChange={(value) => updateRateList("calculation_strategy", value)} />
                <Editable label="Start" type="date" value={activeRateList.start_date} onChange={(value) => updateRateList("start_date", value)} />
                <Editable label="End" type="date" value={activeRateList.end_date} onChange={(value) => updateRateList("end_date", value)} />
                <Editable label="Verified" type="date" value={activeRateList.verified_on || ""} onChange={(value) => updateRateList("verified_on", value || null)} />
              </div>
              <Field label="Source note">
                <Textarea value={activeRateList.source_note || ""} onChange={(event) => updateRateList("source_note", event.target.value)} />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="year">
          {activeYear && (
            <Card>
              <CardHeader>
                <CardTitle>Year Rates</CardTitle>
                <CardDescription>{activeYear.label} - {activeYear.start_date} to {activeYear.end_date}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 md:grid-cols-4">
                  <Editable label="Label" value={activeYear.label} onChange={(value) => updateYear("label", value)} />
                  <Editable label="Start" type="date" value={activeYear.start_date} onChange={(value) => updateYear("start_date", value)} />
                  <Editable label="End" type="date" value={activeYear.end_date} onChange={(value) => updateYear("end_date", value)} />
                  <Editable label="Inflation factor" type="number" value={decimal(activeYear.inflation_factor)} onChange={(value) => updateYear("inflation_factor", value)} />
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
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="transition">
          {activeYear && (
            <Card>
              <CardHeader>
                <CardTitle>Transition Rules</CardTitle>
                <CardDescription>Bands are list-wide. Caps are year-specific.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
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
                  onAdd={() => addYearRow("transition_caps", { category: "medium", cap_percent: "0", inflation_factor: "1", appropriate_fraction: "1" })}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="supplements">
          {activeYear && (
            <Card>
              <CardHeader>
                <CardTitle>Supplements</CardTitle>
                <CardDescription>{activeYear.label}</CardDescription>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PeriodPicker({ icon: Icon, label, description, value, onChange, options, action, actionLabel }) {
  return (
    <Card>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center">
        <div className="grid h-10 w-10 place-items-center rounded-md border bg-secondary text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <Field label={label}>
          <NativeSelect value={value} onChange={(event) => onChange(event.target.value)}>
            {options.map(([optionValue, optionLabel]) => (
              <option key={optionValue} value={optionValue}>
                {optionLabel}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Button variant="outline" onClick={action}>
          <Plus className="h-4 w-4" />
          {actionLabel}
        </Button>
        <p className="text-sm text-muted-foreground sm:col-start-2 sm:col-end-4">{description}</p>
      </CardContent>
    </Card>
  );
}

function Editable({ label, value, onChange, type = "text" }) {
  return (
    <Field label={label}>
      <Input type={type} value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function SelectInput({ label, value, options, onChange }) {
  return (
    <Field label={label}>
      <NativeSelect value={value || ""} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

function StatusBadge({ status }) {
  const variant = status === "active" ? "success" : status === "draft" ? "warning" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

function TableControl({ column, value, onChange }) {
  if (column.type === "select") {
    return (
      <NativeSelect className="h-8 min-w-32" value={value || ""} onChange={(event) => onChange(event.target.value)}>
        {column.allowEmpty && <option value="">None</option>}
        {column.options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </NativeSelect>
    );
  }

  if (column.type === "boolean") {
    return <Checkbox checked={Boolean(value)} onCheckedChange={(checked) => onChange(Boolean(checked))} />;
  }

  return (
    <Input
      className="h-8 min-w-24"
      type={column.type || "text"}
      step={column.step || "1"}
      value={decimal(value)}
      onChange={(event) => onChange(event.target.value || null)}
    />
  );
}

function EditableTable({ rows, columns, onChange, onRemove }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.field}>{column.label}</TableHead>
            ))}
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.code || row.category || row.location_group}-${index}`}>
              {columns.map((column) => (
                <TableCell key={column.field}>
                  <TableControl column={column} value={row[column.field]} onChange={(value) => onChange(index, column.field, value)} />
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
  );
}

function AdminCollection({ title, rows, columns, onChange, onRemove, onAdd }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          Add row
        </Button>
      </div>
      <EditableTable rows={rows} columns={columns} onChange={onChange} onRemove={onRemove} />
    </section>
  );
}

function Results({ result }) {
  if (!result) {
    return (
      <Card className="grid min-h-64 place-items-center text-muted-foreground">
        <div className="grid justify-items-center gap-2">
          <Calculator className="h-9 w-9" />
          <CardTitle className="text-sm">No calculation yet</CardTitle>
        </div>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Total" value={money(result.total)} />
        <MetricCard label="Strategy" value={result.calculation_strategy} />
        <MetricCard label="Status" value={result.status} />
      </div>
      {result.annual.map((year) => (
        <Card key={year.year_label}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{year.year_label}</CardTitle>
            <div className="text-right">
              <CardDescription>{year.transition_category}</CardDescription>
              <div className="font-semibold">{money(year.total)}</div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <MetricCard label="BL" value={money(year.base_liability)} compact />
              <MetricCard label="NCA" value={money(year.notional_chargeable_amount)} compact />
              <MetricCard label="TL" value={money(year.transitional_limit)} compact />
              <MetricCard label="Days" value={`${year.days_charged}/${year.days_in_year}`} compact />
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead>RV</TableHead>
                    <TableHead>Multiplier</TableHead>
                    <TableHead>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {year.lines.map((line) => (
                    <TableRow key={line.code}>
                      <TableCell>{line.label}</TableCell>
                      <TableCell>{line.rateable_value ? money(line.rateable_value) : ""}</TableCell>
                      <TableCell>{line.multiplier || ""}</TableCell>
                      <TableCell className={Number(line.amount) < 0 ? "text-destructive" : ""}>{money(line.amount)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/60 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell>{money(year.total)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function MetricCard({ label, value, compact = false }) {
  return (
    <Card className={cn(compact && "shadow-none")}>
      <CardContent className={cn("p-4", compact && "p-3")}>
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="mt-1 truncate text-sm font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

export default App;
