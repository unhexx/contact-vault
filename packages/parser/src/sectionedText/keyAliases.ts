/**
 * Russian key labels → domain field targets for sectioned-text (Report-Mapping Format B).
 */

export type DomainTarget =
  | "phone"
  | "email"
  | "fio"
  | "personalities" // Личности multi-list
  | "dob"
  | "place_of_birth"
  | "passport"
  | "passport_issued_at"
  | "passport_issued_by"
  | "passport_department_code"
  | "snils"
  | "inn"
  | "oms"
  | "driving_license"
  | "address"
  | "telegram"
  | "max_id"
  | "employer"
  | "position"
  | "wish"
  | "income"
  | "unknown";

/** Normalize key for lookup: trim, lower, collapse spaces, strip parentheticals lightly. */
export function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ё/g, "е");
}

const ALIASES: Array<{ match: RegExp | string; target: DomainTarget }> = [
  { match: "телефон", target: "phone" },
  { match: "телефоны", target: "phone" },
  { match: "email", target: "email" },
  { match: "e-mail", target: "email" },
  { match: "почта", target: "email" },
  { match: "фио", target: "fio" },
  { match: "имя", target: "fio" },
  { match: /^фио\s*\(/, target: "fio" },
  { match: "личности", target: "personalities" },
  { match: "день рождения", target: "dob" },
  { match: "дата рождения", target: "dob" },
  { match: "др", target: "dob" },
  { match: "место рождения", target: "place_of_birth" },
  { match: "паспорт", target: "passport" },
  { match: "серия и номер паспорта", target: "passport" },
  { match: "дата выдачи паспорта", target: "passport_issued_at" },
  { match: "кем выдан", target: "passport_issued_by" },
  { match: "орган, выдавший паспорт", target: "passport_issued_by" },
  { match: "код подразделения", target: "passport_department_code" },
  { match: "снилс", target: "snils" },
  { match: "инн", target: "inn" },
  { match: "полис омс", target: "oms" },
  { match: "омс", target: "oms" },
  { match: "водительское удостоверение", target: "driving_license" },
  { match: "адрес", target: "address" },
  { match: "адрес регистрации", target: "address" },
  { match: "справочный адрес", target: "address" },
  { match: "адрес проживания", target: "address" },
  { match: "telegram id", target: "telegram" },
  { match: "telegram", target: "telegram" },
  { match: "логин", target: "telegram" },
  { match: "max id", target: "max_id" },
  { match: "место работы", target: "employer" },
  { match: "предыдущая работа", target: "employer" },
  { match: "организация", target: "employer" },
  { match: "работодатель", target: "employer" },
  { match: "должность", target: "position" },
  { match: "желаемая должность", target: "wish" },
  { match: "доход", target: "income" },
  { match: "зарплата", target: "income" },
];

export function resolveKeyAlias(key: string): DomainTarget {
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
  // Partial contains for common keys
  if (n.includes("телефон")) return "phone";
  if (n.includes("email") || n.includes("e-mail") || n.includes("почта")) return "email";
  if (n.includes("снилс")) return "snils";
  if (n.includes("инн")) return "inn";
  if (n.includes("паспорт") && n.includes("выдач")) return "passport_issued_at";
  if (n.includes("паспорт") && (n.includes("кем") || n.includes("орган"))) return "passport_issued_by";
  if (n.includes("паспорт")) return "passport";
  if (n.includes("адрес")) return "address";
  if (n.includes("фио")) return "fio";
  if (n.includes("рожден")) return "dob";
  return "unknown";
}
