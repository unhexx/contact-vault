# Data Handling & Ethics

Contact Vault processes highly sensitive personal data (identity documents, phones, addresses, financial hints, travel, social profiles, telecom meta).

## Operator responsibilities

- Ensure a **lawful basis** to process the data in your jurisdiction.
- Do not use for stalking, harassment, or unauthorized surveillance.
- Prefer minimal retention; delete data no longer needed.
- Restrict access to trusted operators only.

## Engineering controls (to implement)

- Optional encryption at rest for report blobs and document numbers. **v0.5:** AES-256-GCM on optional `STORE_RAW_REPORTS` files (`data/reports/{id}.bin`) and on `IdentityDocument.number` when `REPORT_BLOB_KEY` is set. Stored `numberNorm` is a keyed HMAC so exact match and list search of a full normalized number still work. No key keeps leftover plaintext (residual risk). Wrong/missing key on ciphertext rows fails closed. Do not encrypt `e164` / `emailNorm`. See [Roadmap.md](../07-ROADMAP/Roadmap.md).
- No full passport/SNILS/INN/PIN/PUK values in application logs at `info` level.
- Export / delete contact and related facts.
- Clear UI marking of sources and confidence.
- Telecom secrets (PIN/PUK) stored only in restricted meta; never displayed in lists by default.

## Fixtures

Only **anonymized** sample reports may be committed. Never commit live personal data from real reports (HTML or text).
