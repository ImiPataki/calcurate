# England8 2026 Calculation Notes

This note records the reverse-engineering work done against `England8_wo.xlsm` on 2026-06-16 and how the app now applies the 2026 rating-list calculation.

## Workbook Structure

`England8_wo.xlsm` is a macro-enabled workbook with 110 sheets. The calculation itself is primarily formula-driven on hidden sheets, with VBA supporting workbook navigation and data entry.

Important sheets:

- `basic`: user-facing input sheet for the basic calculation.
- `advanced`: user-facing input sheet for the advanced calculation.
- `info sheet`: readable summary of multipliers, transition thresholds, reliefs, and TRS.
- `update`: multiplier, inflation, Crossrail, City, and RHL/retail rate inputs.
- `data`: hidden table of transition caps, thresholds, previous-list multipliers, current-list multipliers, and supplement thresholds.
- `calc1`: hidden calculation sheet for the original/basic side.
- `calc2`: hidden calculation sheet for the revised side.

Important workbook input cells found on `basic`:

- `basic!I5`: previous/final 2023-list rateable value.
- `basic!I6`: current/original 2026-list rateable value.
- `basic!I7`: revised 2026-list rateable value.
- `basic!I23` and `basic!I24`: liability start and end dates.
- `basic!W21`: empty.
- `basic!W22`: charity.
- `basic!W23`: small business rate relief.
- `basic!W24`: RHL/retail.
- `basic!W25`: ratepayer received SBRR on 31 March 2025.
- `basic!W26`: received SSBR in 2025/26.
- `basic!W74`: pub/live music venue.
- `basic!AB2`: new entry in the 2026 list.

## Seeded 2026 Values

The app stores government-updatable values in seed data rather than hard-coding them inside the calculation. For the 2026 list these values are seeded from `England8_wo.xlsm`, mainly from `data` and `update`.

Previous-list multipliers:

| Basis | Workbook cell | Rate |
| --- | --- | ---: |
| 2025/26 small business | `data!C52` | 0.499 |
| 2025/26 standard | `data!D51` | 0.555 |

2026-list multipliers:

| Year | Small | Standard | High value | Small RHL | Standard RHL | Crossrail threshold | Crossrail rate | City small | City standard |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026/27 | 0.432 | 0.480 | 0.508 | 0.382 | 0.430 | 92,000 | 0.020 | 0.029 | 0.032 |
| 2027/28 estimate | 0.450 | 0.500 | 0.529 | 0.398 | 0.448 | 92,000 | 0.020 | 0.029 | 0.032 |
| 2028/29 estimate | 0.469 | 0.521 | 0.551 | 0.415 | 0.467 | 92,000 | 0.020 | 0.029 | 0.032 |

The 2027/28 and 2028/29 rows are workbook estimates. They come from `update!H15:J16`, `update!H23:I24`, and linked `data` formulas.

Transition bands:

| Location group | Small | Medium | Large |
| --- | --- | --- | --- |
| England outside Greater London/City | RV <= 20,000 | RV > 20,000 and RV <= 100,000 | RV > 100,000 |
| Greater London and City of London | RV <= 28,000 | RV > 28,000 and RV <= 100,000 | RV > 100,000 |

Transition caps:

| Year | Winner large | Winner medium | Winner small | Loser large | Loser medium | Loser small | Q |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026/27 | 0 | 0 | 0 | 130 | 115 | 105 | 1.000 |
| 2027/28 estimate | 0 | 0 | 0 | 125 | 125 | 110 | 1.042 |
| 2028/29 estimate | 0 | 0 | 0 | 125 | 140 | 125 | 1.042 |

The app stores the final appropriate fractions for loser cases:

| Year | Small | Medium | Large |
| --- | ---: | ---: | ---: |
| 2026/27 | 1.0500 | 1.1500 | 1.3000 |
| 2027/28 estimate | 1.1462 | 1.3025 | 1.3025 |
| 2028/29 estimate | 1.3025 | 1.4588 | 1.3025 |

Winner rows have `X = 0` in the workbook, which means the appropriate fraction is treated as 1 and phasing does not apply.

## Core 2026 Calculation

The workbook does not simply compare the current year's national chargeable amount with the previous year's bill. It carries forward a transition state year by year.

### Step 1: Work out previous base liability

For the first 2026-list year:

```text
previous base liability = previous RV x previous-list multiplier
```

The previous-list multiplier is selected by previous RV:

- Previous RV under 51,000 uses 0.499.
- Previous RV 51,000 or above uses 0.555.

### Step 2: Work out the ordinary NCA

For each 2026-list year:

```text
ordinary NCA = current RV x applicable multiplier
```

The applicable multiplier is selected by current RV and RHL flag:

- Non-RHL under 51,000: small business multiplier.
- Non-RHL from 51,000 to under 500,000: standard multiplier.
- RV 500,000 and over: high-value multiplier.
- RHL under 51,000: small RHL multiplier.
- RHL from 51,000 to under 500,000: standard RHL multiplier.

### Step 3: Work out the transition-test NCA

This is the most important 2026 difference.

In 2026/27 only, the workbook includes the Transitional Relief Supplement in the amount used to decide whether transitional phasing applies:

```text
2026/27 transition-test NCA = current RV x (applicable multiplier + 0.010)
```

For later years, the workbook does not simply recalculate the test NCA from the ordinary multiplier. It carries forward the previous transition-test NCA and applies a rounded growth factor:

```text
2027/28 growth factor = ROUND(2027/28 small multiplier / (2026/27 small multiplier + 0.010), 3)
2028/29 growth factor = ROUND(2028/29 small multiplier / 2027/28 small multiplier, 3)
next transition-test NCA = previous transition-test NCA x growth factor
```

Workbook cells:

- `calc1!D21 = D5 * (D20 + 0.01)`.
- `calc1!D187 = D21`.
- `calc1!E186 = ROUND(E176 / (D176 + 0.01), 3)`.
- `calc1!F186 = ROUND(F176 / (E176 + 0), 3)`.
- `calc1!E187 = D187 * E186`.
- `calc1!F187 = E187 * F186`.

### Step 4: Winner or loser and size category

The workbook assigns:

```text
winner/loser = "l" if the year's comparison NCA is greater than previous base, otherwise "w"
category = "s", "m", or "l" from the transition band
transition code = winner/loser + category
```

Examples:

- `ls`: loser small.
- `lm`: loser medium.
- `ll`: loser large.
- `ws`: winner small.

Workbook cells:

- `calc1!D22 = IF(D21>D19,"l","w")`.
- `calc1!D23 = IF(D5<=D13,"s",IF(D5<=D14,"m","l"))`.
- `calc1!D24 = D22&D23`.
- `calc1!D25 = HLOOKUP(D24,data!$C$2:$H$10,D4+1,FALSE)`.

### Step 5: Appropriate fraction and transitional limit

```text
appropriate fraction = 1 if X is 0, otherwise X x Q / 100
transitional limit = previous base x appropriate fraction
```

Workbook cells:

- `calc1!D27 = IF(D25=0,1,D25*D26/100)`.
- `calc1!D28 = D19*D27`.

### Step 6: Decide whether phasing applies

The workbook applies phasing only if all relevant conditions are true:

- The transition-test NCA is outside both the previous base and transitional limit.
- The prior year was still in phasing. For 2026/27 this starts as true.
- The winner/loser direction has not changed.
- The appropriate fraction is not 1.
- Previous RV and current RV are both greater than zero.
- The workbook's manual no-phasing switch is not set.

Workbook cells:

- `calc1!D30 = AND(D187>D19,D187>D28)`.
- `calc1!D31 = AND(D187<D19,D187<D28)`.
- `calc1!D38 = AND(D29=FALSE,D32=TRUE,D33=TRUE,D34=TRUE,D35=TRUE,D36=TRUE,D37=FALSE)`.

The app now mirrors this state-machine approach for the standard calculator and the advanced calculator's normal annual-start path.

### Step 7: Charge amount and TRS

If transitional phasing applies:

```text
base charge = transitional limit
TRS charge = 0
```

If transitional phasing does not apply:

```text
base charge = ordinary NCA
TRS charge = current RV x 0.010, only in 2026/27
```

TRS is not charged for new entries in the 2026 list.

Workbook references:

- `info sheet!C42`: TRS applies if transitional relief does not apply.
- `info sheet!C43`: TRS does not apply to new 2026-list entries.
- `calc1!D173 = IF(D154=TRUE,0,D5*IF(D38=FALSE,0.01,0)*B173*D190)`.

### Step 8: Carry forward to the next year

For the normal calculation path, the workbook carries forward the transition limit, not the actual payable amount:

```text
next year's previous base = this year's transitional limit
```

Workbook cells:

- `calc1!E19 = ... D28` in the normal path.
- `calc1!F19 = ... E28` in the normal path.

This matters. A property can have no transition in 2026/27 but still use the 2026/27 transition limit as the base for the 2027/28 transition decision.

## Workbook Scenarios Used As Regression Tests

These scenarios were calculated through Excel using `England8_wo.xlsm` hidden `calc1` outputs and are now covered by automated tests.

### Small property: previous RV 10,000, current RV 12,000

| Year | Previous base | Ordinary NCA | Transition-test NCA | Limit | Phased | TRS | Total |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| 2026/27 | 4,990.00 | 5,184.00 | 5,304.00 | 5,239.50 | Yes | 0.00 | 5,239.50 |
| 2027/28 | 5,239.50 | 5,400.00 | 5,399.47 | 6,005.51 | No | 0.00 | 5,400.00 |
| 2028/29 | 6,005.51 | 5,628.00 | 5,626.25 | 6,005.51 | No | 0.00 | 5,628.00 |

The old app result for 2026/27 was 5,304.00. That was wrong because it charged TRS instead of using TRS in the transition test and suppressing the separate TRS line once phasing applied.

### Standard property: previous RV 51,000, current RV 60,000

| Year | Previous base | Ordinary NCA | Limit | Phased | TRS | Total |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| 2026/27 | 28,305.00 | 28,800.00 | 32,550.75 | No | 600.00 | 29,400.00 |
| 2027/28 | 32,550.75 | 30,000.00 | 32,550.75 | No | 0.00 | 30,000.00 |
| 2028/29 | 32,550.75 | 31,260.00 | 32,550.75 | No | 0.00 | 31,260.00 |

### Medium property: previous RV 51,000, current RV 100,000

| Year | Previous base | Ordinary NCA | Transition-test NCA | Limit | Phased | TRS | Total |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| 2026/27 | 28,305.00 | 48,000.00 | 49,000.00 | 32,550.75 | Yes | 0.00 | 32,550.75 |
| 2027/28 | 32,550.75 | 50,000.00 | 49,882.00 | 42,397.35 | Yes | 0.00 | 42,397.35 |
| 2028/29 | 42,397.35 | 52,100.00 | 51,955.04 | 61,849.26 | No | 0.00 | 52,100.00 |

## Other Workbook Relief Logic

The workbook has additional relief paths that are not just simple multiplier changes:

- SBRR: thresholds of 12,000 and 15,000, with a tapering `E` value.
- SSBR: annual increase cap of 800 and separate eligibility checks.
- RHL/retail: 2026 list uses lower RHL multipliers for eligible properties, plus a separate RHL/SSBR block.
- Pub/live music venue relief: 15 percent in year 1, inflation-only annual increases in years 2 and 3, with an RV threshold of 100,000 and a three-year cap shown in the workbook.
- Empty, charity, certificates, improvement relief, and revised value calculations are handled on separate workbook sections and hidden sheets.

The app's standard calculator exposes only location, previous RV, current RV, liability dates, and RHL. Therefore the standard calculator implements the core 2026 multiplier, transition, TRS, Crossrail, and City supplement logic. The advanced calculator reuses the same 2026 transition state for normal annual-start calculations, but SSBR/RHL special cases remain more complex because the workbook has separate formula blocks for those.

## App Implementation Notes

Updated app areas:

- `backend/app/seed.py`: stores the 2026 workbook multipliers, estimated 2027/28 and 2028/29 values, transition caps, TRS condition, Crossrail threshold, and City premiums.
- `backend/app/calculations.py`: implements the 2026 workbook transition state machine for the standard calculator.
- `backend/app/advanced_calculations.py`: reuses the same 2026 transition helper for the advanced calculator's normal annual-start path and warns users when selected 2026 advanced relief/date combinations have not yet been matched to dedicated England8 workbook examples.
- `backend/tests/test_calculations.py`: contains workbook regression scenarios for 2026.

The seed process now backfills an existing local database if the stored 2026 rate list is stale or missing the workbook years. Saved scenario records are not required for redeployment and are not a blocker.

## Residual Review Points

The 2026 standard calculation is now aligned to the workbook scenarios above. Before using advanced 2026 cases involving relief combinations for high-value decisions, the following should still be checked against workbook examples:

- SSBR current and previous eligibility.
- RHL with the RHL/SSBR block.
- Empty properties below the empty threshold.
- Charity plus other relief combinations.
- Pub/live music venue relief.
- Mid-year certificate or RV change scenarios using `calc2`.
