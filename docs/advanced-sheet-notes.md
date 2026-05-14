# CalcuRate Advanced Sheet Exploration Notes

Source workbook: `England7_wo.xlsm`
Sheet explored: `advanced`

These notes describe the workbook behaviour that should be replicated in the React/FastAPI application in a later implementation phase.

## High-Level Purpose

The `advanced` sheet is a scenario editor for comparing an original business-rates liability profile against a revised profile across the 2023 rating list.

It is not a single calculation screen. It combines:

- start-of-list property values for original and revised cases;
- dated changes after 01/04/2023;
- original vs revised liability output by rate year;
- optional relief/certificate panels;
- validation and error navigation;
- links to reports, details, payments, and interest sheets.

The UI should be rebuilt as a structured workflow, not as an Excel-like grid.

## Workbook Structure

Workbook facts:

- 103 sheets.
- `advanced` is visible and maps to `xl/worksheets/sheet23.xml`.
- `advanced` print area: `advanced!$E$3:$R$100`.
- `advanced` used range: `A1:AS282`.
- The sheet contains roughly 824 formulas via `openpyxl`, plus many hidden helper cells.
- No merged cells, no tables, no freeze pane.

Advanced-related sheets worth preserving conceptually:

- `advanced`: main user input and annual output.
- `input_engine_o`: normalized original-side dated input.
- `input_engine_r`: normalized revised-side dated input.
- `workings1`, `workings1x`, `workings2`: detailed liability workings.
- `nncalc1`, `nccalc1`, `bncalc1`, `bccalc1`: original calculation variants.
- `nncalc2`, `nccalc2`, `bncalc2`, `bccalc2`: revised calculation variants.
- `advanced report`: standard report.
- `advanced client report`: client-facing report.
- `advanced detail`: detailed original/revised breakdown.
- `advanced payments`: payment/report output.
- `interest`: interest calculation output.
- `s44a`: separate Section 44a savings calculator.

The `nn/nc/bn/bc` naming appears to represent combinations of no certificates, current-list certificates, prior-list/base certificates, and both certificate types.

## Main Advanced Screen

The visible advanced screen is organized into these sections.

### Top Scenario Section

Rows 4-16 capture the starting values at 01/04/2023.

Main fields:

- Address/search/import helpers.
- Location dropdown.
- Original values:
  - prior-list RV or zero if none;
  - RV as at 01/04/2023 or zero if none;
  - percentage payable from 01/04/2023;
  - vacant as at 01/04/2023;
  - base liability.
- Revised values:
  - prior-list RV;
  - RV as at 01/04/2023;
  - percentage payable;
  - vacant;
  - base liability.
- Charity flags for original/revised.
- RHL/Retail flags for original/revised.
- SBRR and SSBR flags.
- Calculation number spinner.
- Hypothetical checkbox.

Important hidden cells:

- `V3`: calculation number.
- `V4`: hypothetical.
- `V6`: list start date, currently `2023-04-01`.
- `V7`: list end date, currently `2026-03-31`.
- `AA3`: overall top-section OK flag.
- `AJ`/`AK`: linked checkbox state for original/revised options.
- `AN:AP`: hidden storage and macro-linked name/value/id map.

Location dropdown:

- Form control "Drop Down 1".
- Linked cell: `global!$D$4`.
- List source: `global!$C$4:$C$6`.
- Advanced sheet visible location field is tied to this value.

### SBRR Panel

Hidden rows 18-28 are the SBRR panel.

State and fields:

- `U20`: panel state, e.g. `closed`.
- Original SBRR year flags: `I22:I24`.
- Revised SBRR year flags: `M22:M24`.
- Year labels cover 2023/24, 2024/25, 2025/26.
- Hidden flags around `V23:V24` indicate whether SBRR is on any year or no years.

Behaviour:

- The `SBRR` button toggles the panel.
- Resetting SBRR sets first-year original to `n`, cascades later years from the prior year, and resets revised rows from the original rows.
- Opening from the SBRR relief action can set original year 1 to `y` and then cascade.

### Transitional Certificates Panel

Hidden rows 31-45 are the transitional-certificate panel.

State and fields:

- `U31`: panel state.
- Original start-of-list certificate value/date: `I36`, `I37`.
- Revised start-of-list certificate value/date: `M36`, `M37`.
- Original prior-list certificate value/date: `I41`, `I42`.
- Revised prior-list certificate value/date: `M41`, `M42`.
- Certificate type toggles:
  - original Reg 18/DOS vs Reg 16/MCC: hidden cells `U37`, `V37`;
  - revised Reg 18/DOS vs Reg 16/MCC: hidden cells `W37`, `X37`.
- Calculated usable base liability/effective dates:
  - original: `I44`, `I45`;
  - revised: `M44`, `M45`.

Behaviour:

- `certbutton` opens/closes this panel.
- `change_reg_original` and `change_reg_revised` toggle the certificate basis:
  - switching to MCC sets the certificate date to the start-of-list date and clears date-section certify ticks;
  - switching back clears the certificate date.
- Certifying a dated row from the date section opens the panel if required and writes that row's RV/date into the certificate fields.
- Only one certificate row can be selected per side.

### Improvement Relief Panel

Hidden rows 50-59 are the improvement-relief panel.

State and fields:

- `U53`: panel state.
- Original improvement rows:
  - dates `G54:H58`;
  - certified value `I54:I58`.
- Revised improvement rows:
  - dates `M54:N58`;
  - certified value `O54:O58`.
- Hidden validation formulas live around `W:AM`.

Behaviour:

- The panel is toggled by the improvement button.
- The help text states that an improvement relief start date must also exist in the Date Section.
- The date after the improvement relief end date must also exist in the Date Section unless the end date is the end of the list.
- The certified value is deducted from the RV shown for that date.

### Date Section

Rows 64-80 capture dated changes after 01/04/2023.

Original side:

- Certify tick controls: `AJ70:AJ80`.
- From date: `H69:H80`.
- RV: `I69:I80`.
- Percentage payable: `J69:J80`.
- Vacant: `K69:K80`.

Revised side:

- Certify tick controls: `AK70:AK80`.
- From date: `M69:M80`.
- RV: `N69:N80`.
- Percentage payable: `O69:O80`.
- Vacant: `P69:P80`.

Row 69 is fixed to the start-of-list values from the top section:

- date: `2023-04-01`;
- RV: copied from the top original/revised RV;
- percentage payable: copied from the top original/revised percentage;
- vacant: copied from the top original/revised vacant flag.

Rows 70-80 provide 11 user-entered change rows per side.

Important hidden helpers:

- `U:V`: sequence checks.
- `W:Y`: threshold/date checks.
- `X:Z`: vacant and under-threshold flags.
- `AA`: aggregate boolean flags.
- `AB:AD`: certificate-date checks.
- `W64`: whether date sequence checking is enabled. The visible button says "Click here to allow dates in any order".

Behaviour:

- By default, date rows are sequence checked.
- The user can allow dates in any order.
- Dates must be inside the list period.
- Certificate effective dates must exist in the Date Section.

### Annual Results

Rows 86-103 contain visible annual output.

Columns:

- `G`: rate year.
- `H`: original phased/true marker.
- `I`: original liability.
- `M`: revised phased/true marker.
- `N`: revised liability.
- `Q`: saving.

Rows:

- 2023/24.
- 2024/25.
- 2025/26.

Hidden output/validation:

- `W:X:Y:Z` contain error list/return locations.
- `W103`: named `adv_all_ok`; overall advanced-sheet valid flag.

## Control and Macro Map

The advanced sheet has 95 shapes/form controls.

Important controls:

- `Go to Menu`: `goto_home`.
- `Clear All Input`: `clear_advanced_all`.
- Calculation-number spinner: linked to `V3`.
- Hypothetical checkbox: linked to `V4`.
- `clear this section...`: `reset_adv_top`.
- `SBRR`: `show_sbrr`.
- Transitional certificates panel: `show_tr`.
- Improvement relief panel: `show_improvement`.
- Original date-section certify ticks: `certify_o`.
- Revised date-section certify ticks: `certify_r`.
- Date sequence button: `switch_off_sequence_check`.
- Address button: `goto_details`.
- VOA website picture button: `gotovowebsitefromcalcpage`.
- Import from Analyse picture button: `import_from_analyse`.
- Send to Analyse picture button: `sendtoanalysefromcalcpage`.
- Reports:
  - standard report: `goto_advanced_report`;
  - client/ratepayer report: `goto_advanced_client_report`;
  - advanced detail: `goto_advanced_detail`;
  - advanced payments: `globalgoto`;
  - interest: `goto_interest`.

Important VBA modules:

- `Module11.bas`: `advanced_error_message`.
- `Module28.bas`: charity handling.
- `Module29.bas`: hypothetical/calculation-number reset and SBRR panel handling.
- `Module30.bas`: transitional-certificate and improvement panel handling.
- `Module31.bas`: top-section reset.
- `Module32.bas`: date-section reset.
- `Module33.bas`: original date certify behaviour.
- `Module34.bas`: revised date certify behaviour.
- `Module35.bas`: full advanced reset.
- `Module36.bas`: certificate type toggles and help text.
- `Module2.bas`: retail/RHL checkbox handling.
- `Module3.bas`: navigation/report macros.

## Important Behaviour to Replicate

### Original and Revised Are Parallel Scenarios

The page always computes both sides:

- original liability;
- revised liability;
- saving = original - revised.

The revised side often defaults from or mirrors the original side, but can diverge.

### Dated Inputs Need Normalization

The Excel workbook uses `input_engine_o` and `input_engine_r` to:

- collect the fixed start-of-list row plus user-entered changes;
- filter blanks;
- sort into order;
- remove duplicates;
- determine RV/percentage/vacancy at key dates;
- feed yearly liability workings.

The application should implement this explicitly in backend code. Do not model it as spreadsheet cells.

### Certificates Change the Calculation Route

Each side can be calculated through several routes:

- no certificates;
- current-list certificates;
- prior-list/base certificates;
- both certificate types.

This is why separate sheets exist for `nncalc`, `nccalc`, `bncalc`, and `bccalc` for original and revised.

The backend calculation engine should represent certificate state explicitly and select the appropriate route.

### Validation Is Central

The advanced sheet has hidden error rows and an `advanced_error_message` macro. The React app should show validation inline and as a summary.

Observed validations include:

- dates out of sequence;
- dates outside the rating-list start/end;
- advanced features not available in some cases, with basic-only fallback;
- BRS/Greater London selected while location is not Greater London;
- charity combined with SBRR/SSBR;
- certificate value entered with no certificate date;
- certificate effective date missing from the Date Section;
- improvement relief date requirements not met.

### Charity Changes Percentage Payable

The charity macros set percentage payable to 20 percent when selected:

- original charity selected: original and revised percentage payable are set to `0.2`; revised charity is also selected;
- original charity cleared: original percentage payable returns to `1`;
- revised charity selected: revised percentage payable set to `0.2`;
- revised charity cleared: revised percentage payable returns to `1`.

### Retail/RHL and SSBR Need Explicit Flags

Retail/RHL and SSBR have linked hidden cells and previous-year/current-year state:

- retail original/revised: `AJ8`, `AK8`;
- RHL previous-year input values/status: `AN12`, `AN13`, `AO12`, `AO13`;
- SSBR previous-year toggles: `AJ11`, `AK11`;
- SSBR current toggles: `AJ5`, `AK5`.

RHL clearing behaviour resets the previous-year input/status for that side.

## Data Model Implications

The current app should add an advanced scenario model rather than trying to stretch the basic calculator payload.

Suggested backend concepts:

- `AdvancedCalculation`
  - list period/rate period id;
  - location/rating area;
  - calculation number;
  - hypothetical flag;
  - address/client metadata;
  - original scenario;
  - revised scenario;
  - validation status;
  - annual result rows.
- `AdvancedScenarioSide`
  - prior-list RV;
  - start RV;
  - start payable percentage;
  - start vacant flag;
  - user-entered base liability override;
  - charity flag;
  - SBRR year flags;
  - retail/RHL/SSBR flags;
  - transitional certificate inputs;
  - improvement relief rows;
  - dated changes.
- `AdvancedDatedChange`
  - from date;
  - RV;
  - payable percentage;
  - vacant flag;
  - certify flag.
- `TransitionalCertificateInput`
  - start-of-list certificate value/date;
  - prior-list certificate value/date;
  - certificate basis/type.
- `ImprovementReliefInput`
  - from date;
  - to date;
  - certified value.
- `AdvancedAnnualResult`
  - rate year;
  - original phased/true marker;
  - original liability;
  - revised phased/true marker;
  - revised liability;
  - saving.

Admin/config implications:

- Advanced rules must be period-aware.
- Date boundaries must come from the active rating-list period.
- Location-dependent rules must remain configurable.
- Relief availability and certificate behaviours need versioned configuration, because the transcript and workbook both indicate rules change by list period.

## UX Implications

Do not replicate the orange Excel grid literally. A clearer web UI should use:

- page header showing active rating list and date range;
- side-by-side cards or tabs for Original and Revised scenario setup;
- a shared Date Changes table with Original/Revised columns;
- collapsible panels for SBRR, Transitional Certificates, Improvement Relief, RHL/Retail, and SSBR;
- inline validation next to the relevant panel;
- annual results summary fixed near the top or right;
- report actions grouped separately from calculation inputs.

Dropdowns should replace free-text where the workbook has fixed options:

- location/rating area;
- yes/no/vacant;
- SBRR by year;
- certificate type;
- rate/list period;
- relief type/eligibility.

## Next Implementation Targets

Recommended sequence:

1. Add backend Pydantic models for advanced calculation payloads.
2. Add SQLite tables for saved advanced calculations and dated child rows.
3. Implement normalization of dated original/revised input.
4. Add certificate route selection.
5. Port annual liability calculation for original and revised sides.
6. Add validation summary matching the workbook's hidden error logic.
7. Build React advanced page with sections instead of spreadsheet-like layout.
8. Add report/detail/payment output pages after calculation output is stable.

