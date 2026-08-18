# Report Mapping — Supported Ingestion Formats

Contact Vault supports **three report formats** from the same family of OSINT aggregators:

| Format ID | Description | Detection |
|-----------|-------------|-----------|
| `void-html` | Self-contained Void Search SPA HTML (embedded JSON) | `.html` + `__report_embed__` / SPA markers |
| `sectioned-text` | Plain-text multi-source dump | Clean `=== ... ===` section headers + line-oriented key-value |
| `inline-dossier` | Inline key-value dossier with optional scoring header | Scoring markers (`Результаты скоринга` / `Общий показатель`), dense `Имя :` inline records, or `====Доходы====` / `====Адреса====` style blocks (after clean sectioned fails) |

All three normalize into the same domain model (`Person` + children + `Provenance`). Scoring headers map to **RiskScore** / **Incident** (see [Inline-Dossier-Mapping.md](./Inline-Dossier-Mapping.md)).

---

## Format A — Void HTML / JSON (`void-html`)

### Ingestion priority

1. `window.__REPORT_EMBED__`
2. `<script id="__report_embed__" type="application/json">`
3. Live poll `/api/report/{id}` when applicable
4. DOM fallback (Cheerio / linkedom)

### Modes

| Mode | Signals | Output |
|------|---------|--------|
| Person dossier | profile, documents, addresses, groups | Person + children |
| FIO list | fio-list, renderFioReport | Person stubs |
| Telegram | tg-wrap | Person + messenger/social |
| Face/photo | facesearch, person_info | Person + matches + dossier |

### Section map (person dossier)

| Void key / card | Domain target |
|-----------------|---------------|
| query / request | ReportImport |
| profile / profile_all | NameVariant, ContactPoint |
| phonebook_names | NameVariant aliases |
| documents | IdentityDocument[] |
| addresses | Address[] |
| movements | Address periods + TravelRecord(MOVEMENT) |
| connections / family | Relationship[] |
| work / companies | Employment + Company |
| vehicles / autoregs | Vehicle[] (v0.3: `brand`/`mark`/`make`, `model`, `plate`/`reg_num`/`gosnomer`, `vin`; optional year/power/volume/category/ownership; other keys → extras). Require plate, vin, brand, or model. `autophotos` stay unmapped (no photo pipeline). |
| finance | FinancialFact[] |
| flights / crossings | TravelRecord |
| incidents | Incident[] |
| banks | BankRelation[] (v0.3: `name` / `bank` / `bank_name` → bankName; optional account* → accountHint; `bik`/`bic`; other keys → extras). Cards stay unmapped. |
| social_profiles | ContactPoint (social/messenger) |
| phone_reviews | PhoneReputation |
| person_info | bulk identity enrichment |

---

## Format B — Sectioned plain text (`sectioned-text`)

### Structure (canonical)

```text
=== Общая сводка ===
Key: value, value2
Key2: value

=== Source Name Year ===
Key: value
Key: value

=== Source Name Year ===
...
```

Rules observed in production samples:

1. **Section header** = line matching `/^===\s*(.+?)\s*===\s*$/`
2. **First section** is often `Общая сводка` — aggregated multi-value summary (phones, SNILS, emails, FIO list under «Личности», passports, addresses, birth place).
3. **Subsequent sections** are source-specific; title usually contains source brand + year (`Клиенты T2.ru 2024`, `Росреестр 2024`, `Пользователи Telegram`).
4. **Records** = consecutive key-value lines until next section header. A single section may contain **multiple records** (blank line or repeated primary key like ФИО/Телефон starts a new record).
5. **Keys** are Russian labels; values may be comma-separated lists.
6. Related persons (e.g. child with own SNILS/OMS) appear as separate records sharing the query phone.

### Key alias map (Russian → domain)

| Text key (examples) | Domain field |
|---------------------|--------------|
| Телефон | ContactPoint.phone |
| Email / E-mail | ContactPoint.email |
| ФИО / Имя / ФИО (обновлённое) | NameVariant |
| Личности | NameVariant[] (summary list, often «fio + dob») |
| День рождения | Person.dateOfBirth / related |
| Место рождения | Person.placeOfBirth |
| Паспорт | IdentityDocument(passport_ru) number |
| Дата выдачи паспорта | IdentityDocument.issuedAt |
| Кем выдан / Орган, выдавший паспорт | IdentityDocument.issuedBy |
| Код подразделения | IdentityDocument.departmentCode |
| СНИЛС | IdentityDocument(snils) |
| ИНН | IdentityDocument(inn) |
| Полис ОМС | IdentityDocument(oms) |
| Водительское удостоверение | IdentityDocument(driving_license) |
| Адрес / Адрес регистрации / Справочный адрес | Address |
| Должность | Employment.position |
| Место работы / Предыдущая работа | Employment.employer |
| Доход / Зарплата | FinancialFact / Employment income |
| Желаемая должность | Employment wish |
| Образование / Образовательное учреждение | Education extras |
| Telegram ID / Логин / link | ContactPoint messenger/social (telegram) |
| MAX ID | ContactPoint messenger (max) |
| Номер карты | PaymentCard |
| Возможные имена | NameVariant aliases (phonebook; lower confidence) |
| Оператор связи / Регион | Phone metadata (carrier, region) |
| PIN-код / PUK-код / Серийный номер / Тариф | Telecom subscription extras (store in meta / Employment-like timeline) |
| Статус (Госуслуги) | Account status extras |

Unknown keys → `extras: Record<string, string>` on the fact / source record (never drop).

### Summary section special handling

`=== Общая сводка ===` seeds the Person:

- Split multi-value fields on commas where appropriate (phones, emails, SNILS, passports).
- Parse `Личности` entries as `NameVariant` (+ optional DOB if present in the same token).
- Addresses may be poorly delimited; keep raw strings and optionally run a normalizer later.

### Related persons

If a record’s ФИО + DOB clearly differ from the primary person (e.g. child), create:

- a separate **Person** stub **or**
- a **Relationship** with `relatedPersonHint` (MVP: Relationship; full Person later).

Shared phone alone is **not** sufficient to merge identities.

### Provenance for text format

```ts
{
  reportId,
  reportQuery,          // usually primary phone
  sourceName,           // section title without year, e.g. "Клиенты T2.ru"
  section: sectionTitle,
  originalKey,
  originalValue,
  extractedAt,
  confidence,           // summary slightly lower than structured source rows
  count?: number
}
```

### Idempotency

`contentHash = sha256(normalized text)` + primary query phone/email/FIO fingerprint.

---

## Shared post-processing

Regardless of format:

1. Normalize phones toward E.164 (`7952…` → `+7952…`).
2. Deduplicate ContactPoints / Documents by normalized value.
3. Attach all source section names to `Person.sourceReports`.
4. Run merge-candidate detection against existing DB persons.

## Format C — Inline dossier / scoring text (`inline-dossier`)

Third format. Authoritative field map and detection rules: **[Inline-Dossier-Mapping.md](./Inline-Dossier-Mapping.md)**.

Summary:

- Free-text **scoring header** → `RiskScore` (overall, label, categories, articles) + optional `Incident` seeds
- `====Доходы====` / `====Адреса====` blocks → financial/address facts (extras or Address[])
- Dense **inline** `Key : Value` records with source label preceding `====` / `Имя :`
- Prefer `sectioned-text` when the file is clean line-oriented `=== Source ===` + one-key-per-line

Synthetic sample: `samples/inline-dossier/person-scoring-basic.txt`.

---

## Parser package layout

```
packages/parser/
  src/
    detectFormat.ts          // void-html | sectioned-text | inline-dossier | unknown
    voidHtml/
    sectionedText/
      splitSections.ts
      parseRecord.ts
      keyAliases.ts
      mapToDomain.ts
    inlineDossier/
    normalize/
      phone.ts
      name.ts
      date.ts
    index.ts                 // parseReport(input) → ParseResult
```

`ParseResult` = `{ format, reportMeta, persons: PersonDraft[], relationships, warnings[] }`.
