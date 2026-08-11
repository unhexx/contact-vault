/**
 * Russian/Latin key labels → domain field targets for inline-dossier
 * (Inline-Dossier-Mapping + overlapping sectioned-text aliases).
 */

export type InlineDomainTarget =
  | "phone"
  | "email"
  | "fio"
  | "dob"
  | "place_of_birth"
  | "passport"
  | "passport_issued_at"
  | "passport_issued_by"
  | "passport_department_code"
  | "snils"
  | "inn"
  | "oms"
  | "military"
  | "driving_license"
  | "address"
  | "related_person"
  | "relation_type"
  | "criminal_article"
  | "criminal_case"
  | "criminal_sentence_date"
  | "criminal_decision"
  | "employer"
  | "position"
  | "income"
  | "vehicle_plate"
  | "vehicle_vin"
  | "vehicle_model"
  | "bank_account"
  | "card_number"
  | "citizenship"
  | "telegram"
  | "unknown";

/** Normalize key for lookup: trim, lower, collapse spaces, ё→е. */
export function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ё/g, "е");
}

/**
 * Known keys for longest-key-first tokenizer (display form).
 * Sorted longest → shortest at runtime via knownKeysSorted().
 */
export const KNOWN_KEYS: string[] = [
  "Дата выдачи паспорта",
  "Дата выдачи документа",
  "Орган выдачи документа",
  "Адрес регистрации",
  "Адрес проживания",
  "Адрес для связи",
  "Связанные лица",
  "Справочный адрес",
  "Код подразделения",
  "Место рождения",
  "Дата рождения",
  "год рождения",
  "Место работы",
  "Тип связи",
  "Военный билет",
  "Полис ОМС",
  "Дата приговора",
  "Номер дела",
  "Номер статьи",
  "Номер счета",
  "Банковская карта",
  "Марка/модель",
  "Номер кузова",
  "Дата выдачи",
  "Кем выдан",
  "Серия и номер паспорта",
  "Годовая сумма дохода",
  "Сумма_дохода",
  "Телефон_работы",
  "Связь_с_телефоном",
  "Водительское удостоверение",
  "Telegram ID",
  "Организация",
  "Работодатель",
  "Должность",
  "Гражданство",
  "Паспорта",
  "Паспорт",
  "СНИЛС",
  "Снилс",
  "ИНН",
  "ОМС",
  "Телефон",
  "Телефоны",
  "Email",
  "E-Mail",
  "EMAIL",
  "Емаil",
  "Почта",
  "Адрес",
  "Имя",
  "ФИО",
  "Авто",
  "VIN",
  "Модель",
  "Карты",
  "Статья",
  "Обвинение",
  "Решение",
  "Доход",
  "Выдан",
  "Telegram",
  "Max ID",
];

const ALIASES: Array<{ match: string | RegExp; target: InlineDomainTarget }> = [
  { match: "телефон", target: "phone" },
  { match: "телефоны", target: "phone" },
  { match: "телефон_работы", target: "phone" },
  { match: "связь_с_телефоном", target: "phone" },
  { match: "email", target: "email" },
  { match: "e-mail", target: "email" },
  { match: "емаil", target: "email" },
  { match: "почта", target: "email" },
  { match: "фио", target: "fio" },
  { match: "имя", target: "fio" },
  { match: "дата рождения", target: "dob" },
  { match: "день рождения", target: "dob" },
  { match: "год рождения", target: "dob" },
  { match: "др", target: "dob" },
  { match: "место рождения", target: "place_of_birth" },
  { match: "паспорт", target: "passport" },
  { match: "паспорта", target: "passport" },
  { match: "серия и номер паспорта", target: "passport" },
  { match: "дата выдачи паспорта", target: "passport_issued_at" },
  { match: "дата выдачи документа", target: "passport_issued_at" },
  { match: "дата выдачи", target: "passport_issued_at" },
  { match: "кем выдан", target: "passport_issued_by" },
  { match: "орган выдачи документа", target: "passport_issued_by" },
  { match: "выдан", target: "passport_issued_by" },
  { match: "код подразделения", target: "passport_department_code" },
  { match: "снилс", target: "snils" },
  { match: "инн", target: "inn" },
  { match: "полис омс", target: "oms" },
  { match: "омс", target: "oms" },
  { match: "военный билет", target: "military" },
  { match: "водительское удостоверение", target: "driving_license" },
  { match: "адрес регистрации", target: "address" },
  { match: "адрес проживания", target: "address" },
  { match: "адрес для связи", target: "address" },
  { match: "справочный адрес", target: "address" },
  { match: "адрес", target: "address" },
  { match: "связанные лица", target: "related_person" },
  { match: "тип связи", target: "relation_type" },
  { match: "статья", target: "criminal_article" },
  { match: "обвинение", target: "criminal_article" },
  { match: "номер статьи", target: "criminal_article" },
  { match: "номер дела", target: "criminal_case" },
  { match: "дата приговора", target: "criminal_sentence_date" },
  { match: "решение", target: "criminal_decision" },
  { match: "место работы", target: "employer" },
  { match: "организация", target: "employer" },
  { match: "работодатель", target: "employer" },
  { match: "должность", target: "position" },
  { match: "сумма_дохода", target: "income" },
  { match: "годовая сумма дохода", target: "income" },
  { match: "доход", target: "income" },
  { match: "авто", target: "vehicle_plate" },
  { match: "vin", target: "vehicle_vin" },
  { match: "номер кузова", target: "vehicle_vin" },
  { match: "марка/модель", target: "vehicle_model" },
  { match: "модель", target: "vehicle_model" },
  { match: "номер счета", target: "bank_account" },
  { match: "банковская карта", target: "card_number" },
  { match: "карты", target: "card_number" },
  { match: "гражданство", target: "citizenship" },
  { match: "telegram id", target: "telegram" },
  { match: "telegram", target: "telegram" },
  { match: "max id", target: "telegram" },
];

export function resolveKeyAlias(key: string): InlineDomainTarget {
  const n = normalizeKey(key);
  for (const entry of ALIASES) {
    if (typeof entry.match === "string") {
      if (n === entry.match || n.startsWith(entry.match + " ")) {
        return entry.target;
      }
    } else if (entry.match.test(n)) {
      return entry.target;
    }
  }
  // Partial contains fallbacks
  if (n.includes("телефон")) return "phone";
  if (n.includes("email") || n.includes("e-mail") || n.includes("почта"))
    return "email";
  if (n.includes("снилс")) return "snils";
  if (n.includes("инн")) return "inn";
  if (n.includes("паспорт") && n.includes("выдач")) return "passport_issued_at";
  if (n.includes("паспорт") && (n.includes("кем") || n.includes("орган")))
    return "passport_issued_by";
  if (n.includes("паспорт")) return "passport";
  if (n.includes("адрес")) return "address";
  if (n.includes("фио") || n === "имя") return "fio";
  if (n.includes("рожден")) return "dob";
  if (n.includes("стать") || n.includes("обвинен")) return "criminal_article";
  if (n.includes("связанн")) return "related_person";
  return "unknown";
}
