import type { DocumentType } from "@contact-vault/domain";

/**
 * Map Russian / Void document type labels to DocumentType enum.
 */
export function mapDocumentType(rawType: string): DocumentType {
  const t = rawType.trim().toLowerCase();

  if (t === "passport_foreign" || t.includes("загран") || t.includes("иностр")) {
    return "passport_foreign";
  }
  if (t === "passport" || t === "passport_ru" || t.includes("паспорт")) {
    return "passport_ru";
  }
  if (t === "snils" || t.includes("снилс")) {
    return "snils";
  }
  if (t === "inn" || t.includes("инн")) {
    return "inn";
  }
  if (t === "oms" || t.includes("омс") || t.includes("полис")) {
    return "oms";
  }
  if (
    t === "driving_license" ||
    t.includes("водительск") ||
    t.includes("ву ") ||
    t === "ву"
  ) {
    return "driving_license";
  }
  if (t === "birth_cert" || (t.includes("свидетельств") && t.includes("рожд"))) {
    return "birth_cert";
  }
  if (t === "military" || t.includes("военн")) {
    return "military";
  }

  return "other";
}
