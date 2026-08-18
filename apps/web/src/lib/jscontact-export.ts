import {
  jsContactFilename,
  toJsContact,
  type Person,
} from "@contact-vault/domain";

export const JSCONTACT_MEDIA_TYPE = "application/jscontact+json";

export type JsContactDownload = {
  filename: string;
  mediaType: string;
  body: string;
};

/** Serialize a Person as a JSContact Card download payload. */
export function jsContactDownload(person: Person): JsContactDownload {
  return {
    filename: jsContactFilename(person.id),
    mediaType: JSCONTACT_MEDIA_TYPE,
    body: `${JSON.stringify(toJsContact(person), null, 2)}\n`,
  };
}

export function triggerBrowserDownload(file: JsContactDownload): void {
  const blob = new Blob([file.body], { type: file.mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
