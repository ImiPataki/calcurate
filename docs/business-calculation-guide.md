# CalcuRate Business Calculation Guide

This guide explains, in business terms, what CalcuRate calculates, how the figures are built up, and how the app keeps government-updated rates, thresholds, caps, and supplements separate by rating list and rate year.

## What CalcuRate Does

CalcuRate is a business rates calculation and scenario tool for England.

It has two main calculation modes:

- **Calculator**: calculates one property liability for a selected rating list, location, previous rateable value, current rateable value, and optional liability dates.
- **Advanced**: compares an **original** liability position with a **revised** liability position and shows the saving by rate year.

The app does not hard-code one fixed set of rates into the screen. It stores rate lists, yearly multipliers, transition rules, relief settings, and supplements as configurable data. The calculation engine then applies the correct stored data for the selected rating list and year.

## Key Terms

- **RV / Rateable Value**: the property value used for business rates.
- **Previous RV**: the RV from the previous rating list, used for transitional relief calculations.
- **Current RV**: the RV for the selected rating list.
- **Multiplier**: the rate applied to RV to calculate the base liability.
- **NCA / National Chargeable Amount**: the unadjusted base charge before transition caps and supplements.
- **BL / Base Liability**: the prior liability figure used as the starting point for transition calculations.
- **TL / Transitional Limit**: the maximum phased liability allowed for that year, based on the previous year's base liability and the government's transition cap.
- **Transitional Relief**: the adjustment that limits increases where the transition rules apply.
- **Supplements**: extra amounts such as standard multiplier supplement, Crossrail, City of London premium, or other configured additions.

## Basic Calculator Flow

For each applicable rate year, CalcuRate follows this process.

1. **Select the rating list**

   The user chooses a rate list, for example:

   - `england_2023`: England 2023 Rating List, from 1 April 2023 to 31 March 2026.
   - `england_2026_draft`: England 2026 Rating List, from 1 April 2026 to 31 March 2029.

   Only active rate lists can be calculated.

2. **Work out the liability period**

   If the user enters start and end liability dates, the app only charges the overlapping days in each rate year.

   If no dates are entered, the full selected rating list period is used.

3. **Choose the transition category**

   The app places the property into a transition band based on:

   - the selected location;
   - the current RV;
   - the configured band thresholds for that rating list.

   For the seeded English rules, locations are grouped as:

   - England outside London;
   - London, covering Greater London and City of London.

   The transition category is usually `small`, `medium`, or `large`.

4. **Calculate the prior base liability**

   The first year's base liability starts from:

   ```text
   previous RV x previous-list small business multiplier
   ```

   For the seeded 2023 and 2026 configurations, the previous-list small multiplier is stored as `0.499`.

5. **Calculate the NCA**

   The app calculates the annual notional charge:

   ```text
   current RV x applicable multiplier
   ```

   The applicable multiplier depends on the rating list strategy:

   - For the 2023 list, the app uses the small business multiplier as the base charge and adds the standard multiplier difference as a separate supplement where applicable.
   - For the 2026 list, the app uses the configured multiplier tier directly. This supports small, standard, high-value, and RHL-specific tiers.

6. **Apply transitional relief if needed**

   The app compares the NCA with the prior base liability and the transitional limit.

   ```text
   transitional limit = previous base liability x appropriate fraction
   ```

   If the NCA is above both the previous base liability and the transitional limit, the base charge is capped at the transitional limit.

   In that case:

   ```text
   transitional relief = capped base charge - NCA
   ```

   This is normally shown as a negative adjustment, because it reduces the full NCA down to the phased amount.

7. **Add configured supplements**

   The app checks each supplement rule for the year and applies it when:

   - the rule is active;
   - the property location matches the rule scope;
   - the current RV is inside the rule's configured RV range.

   Examples in the seeded data include:

   - standard supplement;
   - Crossrail supplement;
   - City of London supplement or premium;
   - 2026 transitional relief supplement, stored for the configured 2026 method.

8. **Prorate for part-year liability**

   If the user only has liability for part of a rate year, the app prorates the annual result:

   ```text
   charged days / days in rate year
   ```

   The app then applies that factor to the base charge, supplements, and total.

9. **Round money values**

   Money amounts are rounded to the nearest penny using standard half-up rounding.

10. **Carry the base charge forward**

   For multi-year rating lists, each year's capped or uncapped base charge becomes the previous base for the next year's transitional calculation.

## Example Calculation Logic

For a 2023/24 example with:

- previous RV: `15,000`;
- current RV: `30,000`;
- previous-list small multiplier: `0.499`;
- 2023/24 small transition appropriate fraction: `1.15`;
- 2023/24 small multiplier: `0.499`;

The app calculates:

```text
base liability = 15,000 x 0.499 = 7,485.00
NCA = 30,000 x 0.499 = 14,970.00
transitional limit = 7,485.00 x 1.15 = 8,607.75
```

Because the NCA is higher than the transitional limit, the charge is capped:

```text
base charge = 8,607.75
transitional relief = 8,607.75 - 14,970.00 = -6,362.25
```

If there are no supplements and the property is liable for the full year, the total is `8,607.75`.

## Advanced Calculator Flow

The Advanced calculator is designed for valuation-change and appeal scenarios. It calculates two parallel positions:

- **Original**: the starting or existing liability position.
- **Revised**: the proposed or corrected liability position.

The saving is:

```text
original liability - revised liability
```

The Advanced screen supports:

- different prior-list RVs and start RVs for each side;
- date-based RV changes;
- percentage payable changes;
- vacancy periods;
- charity treatment;
- RHL flagging;
- retail relief;
- SBRR by year;
- SSBR current-year handling;
- transitional certificate values;
- improvement relief deductions.

### Date Changes

The Advanced calculator normalizes each side into dated events.

Each side starts with a fixed event on the rating-list start date. User-entered date rows can then change:

- RV;
- percentage payable;
- vacant status.

The backend splits each rate year into segments wherever a relevant date change or improvement relief boundary occurs. Each segment is calculated for the number of days it covers, then added back into the annual result.

### Vacancy and Percentage Payable

If a segment is marked vacant, the payable percentage is treated as zero for that segment.

If charity is selected, the app uses the configured charity payable percentage. In the seeded rules this is `20%`.

### SBRR

Small Business Rate Relief can be selected by rate year. When selected, and when charity/vacancy rules do not block it, the app calculates the relief using the configured thresholds:

```text
100% relief at or below the full-relief RV threshold
tapered relief between the full-relief threshold and taper limit
0% relief at or above the taper limit
```

In the seeded rules:

- full relief applies up to RV `12,000`;
- tapering applies below RV `15,000`.

### Retail / RHL Relief

The Advanced calculator can apply configured retail/RHL relief percentages by year.

In the seeded 2023 rules:

- 2023/24: `75%`;
- 2024/25: `75%`;
- 2025/26: `40%`.

The seeded 2026 rules currently have no retail relief percentages configured.

### SSBR

Supporting Small Business Relief can use a prior liability or a base-liability override. When active, the transition limit is not allowed to be below:

```text
previous base liability + configured annual SSBR cap amount
```

In the seeded rules:

- 2023 list annual cap amount: `600`;
- 2026 list annual cap amount: `800`.

### Improvement Relief

Improvement relief is treated as an RV deduction for the period where the improvement relief row is active.

The app validates that:

- the improvement relief row has a from date, to date, and certified value;
- the start date also exists in the Date Changes section;
- the day after the end date exists in the Date Changes section unless the relief ends on the final day of the rating list.

### Certificates

The Advanced calculator accepts start-list and prior-list certificate inputs. These can replace the start RV or prior RV used by that side of the calculation.

The certificate type is stored in the request, but the current backend calculation does not yet use the type to branch into separate formula routes. Business users should treat the certificate type field as captured scenario information unless and until separate certificate-specific calculation routes are implemented.

### Advanced Validation

Advanced calculations return warnings and errors. If any blocking error exists, the app returns validation messages instead of annual comparison figures.

Examples include:

- missing certificate date for an entered certificate value;
- missing certificate value for an entered certificate date;
- date changes outside the selected rating-list period;
- date changes out of sequence, unless the user allows dates in any order;
- duplicate dates, which are collapsed with a warning;
- charity and SBRR selected together;
- SSBR selected without prior liability or base-liability override;
- incomplete improvement relief rows.

## How Government-Changed Values Are Tracked

Government and local-authority values are stored as versioned configuration data, not as scattered frontend logic.

The main stored objects are:

- **Rate list**: the overall revaluation period, such as 2023 to 2026 or 2026 to 2029.
- **Rate year**: each annual charging year inside a rate list, such as 2023/24.
- **Multiplier tiers**: small business, standard, high-value, and RHL-specific multipliers, each with RV thresholds.
- **Transition bands**: RV ranges that classify a property as small, medium, or large for transition.
- **Transition caps**: annual cap percentages and appropriate fractions by transition category.
- **Supplement rules**: supplements such as Crossrail or City of London premium, including location scope, RV thresholds, active flag, and rate.
- **Advanced rules**: relief and behaviour settings used by the Advanced calculator, such as charity percentage, SBRR thresholds, retail relief by year, and SSBR cap amount.

Each rate list can also store:

- source URLs;
- source notes;
- a `verified_on` date;
- active, draft, or archived status;
- the calculation strategy used by the backend.

This means a new government announcement should normally be handled by updating the configuration for the relevant rating list or rate year, not by changing the calculator screen.

## Admin Workflow For Rate Updates

The Admin area exposes the calculation configuration in four practical sections.

### Rating List Setup

Business/admin users can manage:

- code;
- name;
- country;
- active/draft/archived status;
- calculation strategy;
- rating-list start and end dates;
- verification date;
- source note.

### Year Rates

For each rate year, users can manage:

- year label;
- year start and end dates;
- multiplier tiers;
- RV thresholds for each multiplier;
- whether a multiplier is RHL-only.

### Transition

Users can manage:

- list-wide transition bands by location group and RV range;
- annual transition caps by small, medium, and large category;
- appropriate fractions used in the transitional-limit calculation.

### Supplements

Users can manage:

- supplement code and name;
- location scope;
- RV thresholds;
- active flag;
- supplement rate.

## Seed Data And Reset

When the backend starts, it creates the database tables and seeds default rate data if the database is empty.

The seeded data includes:

- England 2023 Rating List;
- England 2026 Rating List configuration;
- default transition bands;
- annual multipliers and caps;
- supplement rules;
- advanced rule settings.

The Admin screen also has a reset action that restores the seeded configuration.

Important operational note: resetting seed data deletes the current rate configuration and replaces it with the built-in defaults. The current backend reset also deletes basic saved scenarios. Advanced saved scenarios are stored separately as request/result snapshots, so they may remain available but can reference assumptions from before the reset.

## Scenario Saving

When a scenario is saved, the app stores:

- the user's input request;
- the calculated result at the time of saving;
- created and updated timestamps.

This applies to both basic and advanced scenarios.

Because the result is stored with the scenario, an old saved scenario keeps the result that was calculated at the time. If rate configuration later changes, users should recalculate and resave the scenario if they want the scenario to reflect the new rates.

## Current Implementation Boundaries

The app is configurable, but not every possible business-rates edge case is guaranteed to be implemented.

Current boundaries to be aware of:

- Only active rate lists can be calculated.
- The seeded logic is England-focused.
- The 2023 strategy represents the standard multiplier difference as a supplement.
- The 2026 strategy uses configured multiplier tiers directly.
- The Advanced calculator captures certificate type, but does not yet run separate certificate-specific formula routes.
- There is no authentication in the current app, so anyone with access to the Admin screen can change calculation parameters.

## Business Assurance Checklist

Before relying on a newly updated rating list or rate year, check:

- the rate list is marked active only when ready for use;
- the correct calculation strategy is selected;
- all annual rate years exist with correct start and end dates;
- multiplier thresholds and inclusive/exclusive boundaries match the published rules;
- transition bands match the correct England/London thresholds;
- annual transition caps and appropriate fractions are entered correctly;
- location-specific supplements have the correct scope and RV thresholds;
- advanced relief settings are updated for the relevant year;
- source notes and verification dates are filled in;
- representative test scenarios have been recalculated and reviewed.
