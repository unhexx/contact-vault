# Inline Dossier / Scoring Text Format → Domain Mapping

Third supported ingestion format (alongside `void-html` and `sectioned-text`).

Observed in multi-source person dossiers that include **risk scoring**, criminal history, incomes, vehicles, bank products and SIM registration data.

## Detection

Treat as `inline-dossier` when **any** of:

1. Text starts with or contains `\u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u044b \u0441\u043a\u043e\u0440\u0438\u043d\u0433\u0430` / `\u041e\u0431\u0449\u0438\u0439 \u043f\u043e\u043a\u0430\u0437\u0430\u0442\u0435\u043b\u044c`
2. High density of inline patterns `\u0418\u043c\u044f\\s*:\\s*` followed by other `Key\\s*:` on the **same logical record** (few newlines between fields)
3. Presence of `====\u0414\u043e\u0445\u043e\u0434\u044b====` / `====\u0410\u0434\u0440\u0435\u0441\u0430====` style section markers combined with the above

If the file also has clean `=== Source ===` + one-key-per-line layout, prefer `sectioned-text`.

## High-level structure

```
[Scoring header — free text]
  \u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u044b \u0441\u043a\u043e\u0440\u0438\u043d\u0433\u0430 \u041e\u0431\u0449\u0438\u0439 \u043f\u043e\u043a\u0430\u0437\u0430\u0442\u0435\u043b\u044c: 0.8 - \u043f\u043b\u043e\u0445\u043e
  \u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438 ... \u0421\u0442\u0430\u0442\u044c\u044f \u2116228 \u0427.2 ...

====\u0414\u043e\u0445\u043e\u0434\u044b====
  (tabular / space-separated work + amount + year lines)

====\u0410\u0434\u0440\u0435\u0441\u0430====
  (concatenated address blob — split heuristically)

[Record]* 
  SOURCE_NAME==== \u0418\u043c\u044f : FIO \u0414\u0430\u0442\u0430 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f : DOB \u041f\u0430\u0441\u043f\u043e\u0440\u0442 : N ... Key : Value ...
```

Records are primarily **inline key-value** sequences. The source name is typically the token(s) immediately preceding `==== \u0418\u043c\u044f` (or a free-text label ending just before the next `\u0418\u043c\u044f :`).

## Parsing algorithm (target)

```
1. Extract scoring header → RiskScore / ScoringResult
2. Extract ====\u0414\u043e\u0445\u043e\u0434\u044b==== block → FinancialFact[] / Employment income
3. Extract ====\u0410\u0434\u0440\u0435\u0441\u0430==== block → Address[] (aggressive split on known region/city patterns)
4. Split body into records on /(?:={3,}\\s*)?\u0418\u043c\u044f\\s*:/
5. For each record:
   a. Capture preceding source label (up to previous record end or section marker)
   b. Parse inline "Key : Value" pairs with a greedy key list (longest-key-first)
   c. Map to domain facts with provenance.sourceName = source label
6. Post-process: related persons, vehicle aggregation, telecom meta
```

## Key alias table (additional / overlapping)

| Canonical | Observed keys in this format |
|-----------|------------------------------|
| fullName | \u0418\u043c\u044f |
| dateOfBirth | \u0414\u0430\u0442\u0430 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f, \u0433\u043e\u0434 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f |
| passportNumber | \u041f\u0430\u0441\u043f\u043e\u0440\u0442, \u041f\u0430\u0441\u043f\u043e\u0440\u0442\u0430 |
| passportIssuedAt | \u0414\u0430\u0442\u0430 \u0432\u044b\u0434\u0430\u0447\u0438 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430, \u0414\u0430\u0442\u0430 \u0432\u044b\u0434\u0430\u0447\u0438, \u0414\u0430\u0442\u0430 \u0432\u044b\u0434\u0430\u0447\u0438 \u043f\u0430\u0441\u043f\u043e\u0440\u0442\u0430 |
| passportIssuedBy | \u041e\u0440\u0433\u0430\u043d \u0432\u044b\u0434\u0430\u0447\u0438 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430, \u041a\u0435\u043c \u0432\u044b\u0434\u0430\u043d, \u0412\u044b\u0434\u0430\u043d |
| passportDeptCode | \u041a\u043e\u0434 \u043f\u043e\u0434\u0440\u0430\u0437\u0434\u0435\u043b\u0435\u043d\u0438\u044f |
| placeOfBirth | \u041c\u0435\u0441\u0442\u043e \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f |
| snils | \u0421\u043d\u0438\u043b\u0441, \u0421\u041d\u0418\u041b\u0421 |
| inn | \u0418\u041d\u041d |
| omsPolicy | \u041f\u043e\u043b\u0438\u0441 \u041e\u041c\u0421 |
| phone | \u0422\u0435\u043b\u0435\u0444\u043e\u043d, \u0422\u0435\u043b\u0435\u0444\u043e\u043d_\u0440\u0430\u0431\u043e\u0442\u044b, \u0421\u0432\u044f\u0437\u044c_\u0441_\u0442\u0435\u043b\u0435\u0444\u043e\u043d\u043e\u043c |
| email | Email, E-Mail, EMAIL, \u0415\u043c\u0430il |
| address | \u0410\u0434\u0440\u0435\u0441, \u0410\u0434\u0440\u0435\u0441 \u0434\u043b\u044f \u0441\u0432\u044f\u0437\u0438, \u0410\u0434\u0440\u0435\u0441 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438, \u0410\u0434\u0440\u0435\u0441 \u043f\u0440\u043e\u0436\u0438\u0432\u0430\u043d\u0438\u044f |
| citizenship | \u0413\u0440\u0430\u0436\u0434\u0430\u043d\u0441\u0442\u0432\u043e |
| militaryId | \u0412\u043e\u0435\u043d\u043d\u044b\u0439 \u0431\u0438\u043b\u0435\u0442 |
| employer | \u041c\u0435\u0441\u0442\u043e \u0440\u0430\u0431\u043e\u0442\u044b, \u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f, \u0420\u0430\u0431\u043e\u0442\u043e\u0434\u0430\u0442\u0435\u043b\u044c |
| position | \u0414\u043e\u043b\u0436\u043d\u043e\u0441\u0442\u044c |
| income | \u0421\u0443\u043c\u043c\u0430_\u0434\u043e\u0445\u043e\u0434\u0430, \u0414\u043e\u0445\u043e\u0434, \u0413\u043e\u0434\u043e\u0432\u0430\u044f \u0441\u0443\u043c\u043c\u0430 \u0434\u043e\u0445\u043e\u0434\u0430 |
| vehiclePlate | \u0410\u0432\u0442\u043e |
| vehicleVin | VIN, \u041d\u043e\u043c\u0435\u0440 \u043a\u0443\u0437\u043e\u0432\u0430 |
| vehicleBrandModel | \u041c\u0430\u0440\u043a\u0430/\u043c\u043e\u0434\u0435\u043b\u044c, \u041c\u043e\u0434\u0435\u043b\u044c |
| bankAccount | \u041d\u043e\u043c\u0435\u0440 \u0441\u0447\u0435\u0442\u0430 |
| cardNumber | \u0411\u0430\u043d\u043a\u043e\u0432\u0441\u043a\u0430\u044f \u043a\u0430\u0440\u0442\u0430, \u041a\u0430\u0440\u0442\u044b |
| relatedPerson | \u0421\u0432\u044f\u0437\u0430\u043d\u043d\u044b\u0435 \u043b\u0438\u0446\u0430 |
| relationType | \u0422\u0438\u043f \u0441\u0432\u044f\u0437\u0438 |
| criminalArticle | \u0421\u0442\u0430\u0442\u044c\u044f, \u041e\u0431\u0432\u0438\u043d\u0435\u043d\u0438\u0435, \u041d\u043e\u043c\u0435\u0440 \u0441\u0442\u0430\u0442\u044c\u0438 |
| criminalCase | \u041d\u043e\u043c\u0435\u0440 \u0434\u0435\u043b\u0430 |
| criminalSentenceDate | \u0414\u0430\u0442\u0430 \u043f\u0440\u0438\u0433\u043e\u0432\u043e\u0440\u0430 |
| criminalDecision | \u0420\u0435\u0448\u0435\u043d\u0438\u0435 |

Unknown keys → `extras` / meta (never drop).

## Domain mapping highlights

| Source content | Domain target |
|----------------|---------------|
| Scoring header (score, categories, articles) | **RiskScore** + Incident[] for each article |
| \u0421\u0443\u0434\u0438\u043c\u043e\u0441\u0442\u0438 / \u041a\u0420\u0418\u041c\u0418\u041d\u0410\u041b / \u0424\u0421\u041a\u041d / \u043f\u0440\u0438\u0433\u043e\u0432\u043e\u0440 | **Incident** (severity=high) |
| \u0414\u043e\u0445\u043e\u0434\u044b / \u0414\u041e\u0425\u041e\u0414\u042b \u0424\u041b | FinancialFact + Employment |
| \u0410\u0434\u0440\u0435\u0441\u0430 blob + per-record addresses | Address[] |
| \u0420\u041e\u0421\u0420\u0415\u0415\u0421\u0422\u0420 / \u043f\u0430\u0441\u043f\u043e\u0440\u0442\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 | IdentityDocument (passport_ru) |
| \u0412\u043e\u0435\u043d\u043d\u044b\u0439 \u0431\u0438\u043b\u0435\u0442 | IdentityDocument (military) |
| \u041f\u043e\u043b\u0438\u0441 \u041e\u041c\u0421 / \u0415\u041c\u0418\u0410\u0421 | IdentityDocument (oms) |
| \u0412\u041a\u041b\u0410\u0414\u042b \u0420\u0424 / \u0431\u0430\u043d\u043a\u043e\u0432\u0441\u043a\u0438\u0435 \u0441\u0447\u0435\u0442\u0430 / \u043a\u0430\u0440\u0442\u044b | BankRelation + PaymentCard + FinancialFact |
| \u0420\u0415\u0413\u0418\u0421\u0422\u0420\u0426\u0418\u042f SIM / Tele2 | ContactPoint (phone) + telecom meta |
| \u0420\u0424 \u0412\u041b\u0410\u0414\u0415\u041b\u042c\u0426\u042b \u0422\u0421 / \u0430\u0432\u0442\u043e\u0441\u0442\u0440\u0430\u0445\u043e\u0432\u0430\u043d\u0438\u0435 | Vehicle |
| GOSUSLUGI.RU \u0420\u041e\u0414\u0421\u0422\u0412\u0415\u041d\u041d\u042b\u0415 \u0421\u0412\u042f\u0417\u0418 | Relationship (family) |

## New domain types

### RiskScore

```ts
interface RiskScore {
  overall: number;              // 0..1
  label?: string;
  categories: { name: string; flag: 0 | 1 }[];
  articles: { code: string; category?: string; details?: string }[];
  provenance: Provenance[];
}
```

### Incident enrichment

- `articleCode`, `caseNumber`, `sentenceDate`, `decision`, `region`
- severity: high for criminal convictions

## Multi-person

`\u0421\u0432\u044f\u0437\u0430\u043d\u043d\u044b\u0435 \u043b\u0438\u0446\u0430 : \u0427\u0418\u0421\u0422\u042f\u041a\u041e\u0412\u0410 \u0421\u041e\u0424\u042c\u042f ...` + `\u0422\u0438\u043f \u0441\u0432\u044f\u0437\u0438 : \u0420\u041e\u0414\u0418\u0422\u0415\u041b\u042c` → Relationship (family).

## Idempotency

- `contentHash = sha256(normalized text)`
- `mode = "inline_dossier"`

## Parser layout

```
packages/parser/src/inlineDossier/
  extractScoring.ts
  splitRecords.ts
  parseInlineKV.ts      # longest-key-first
  mapToDomain.ts
```

## Agent notes

- Longest-key-first when tokenizing inline KV.
- Do not drop criminal/scoring data — map to Incident + RiskScore.
- Sanitize fixtures (no real PII).
- PIN/PUK/IMEI: redact per product policy if required.
