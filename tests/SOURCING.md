# Candidate Sourcing Verification

Run `node --test tests/sourcing.test.mjs tests/ocr-fallback.test.mjs` for profile normalization, document extraction and cross-provider OCR checks. Provider calls are mocked; the Groq PDF-to-image rendering test uses a real generated two-page PDF.

Run `node --test tests/extension-skills.test.mjs` for LinkedIn skill-section matching, activity/comment counter rejection, supported AI fallback, duplicate accessible-label handling and preservation of valid skills such as C++, C#, .NET, R, Live Streaming and non-English skill names. Coverage includes semantic list rows, plain paragraph and heading titles, skill search links, exclusion of nested employer labels, and skills loaded below the initial page height. The side-panel browser checks also reproduce dirty DOM skills overriding AI results, verify the imported skills, and leave missing skills empty instead of inventing them.

Run `node --test tests/extension-experience.test.mjs` for first-role preservation in text-only Experience sections, current-role badges before job titles, and grouped company roles. Screenshot regressions verify the latest Unoah role remains first and the two nested Abacus roles retain their employer, dates, and descriptions between standalone Ignyte and WMS entries. Both structured DOM lists and text fallback are covered, including multiple groups and duration-only company tenure. Browser checks carry these records and skills through Quick Extract's one-time deep retry, AI review, and the mocked import payload.

AI skill inference is separate from explicit skill extraction. The web-profile parser returns `inferred_skills: [{ skill, evidence, basis }]`. For `basis: "responsibilities"`, a 20–600 character quote must appear in both captured source text and a work description. For `basis: "role"`, evidence must exactly match a captured role title; suggested skill terms must match that role's domain after common expansions such as Manager/Management and PMO/IT/CTO. Role-based suggestions are explicitly labeled unverified in tags and imported notes; unrelated tools such as AWS or Python cannot be inferred from a CTO title. Quick Extract automatically makes one AI request when a completed capture has roles but no skills. Failures preserve the DOM preview and display a persistent explanation by the skills field. Tests cover evidence matching, fabrication rejection, the reported seven-role timeline with no responsibility descriptions, automatic inference, company boundaries, import provenance, and AI unavailability. `tests/ai-workbench-api.test.mjs` verifies the authenticated parser contract with a mocked provider and disposable database. Automated tests do not make paid model calls.

Release 1.1.9 was also checked with one real configured AI-provider request using a fictional candidate and the reported role titles: the model returned eight role-based suggestions, all accepted by the extension's validator. This verifies one representative model response, not every profile or model output.

Release 1.1.10 displays only skill names in tags, with a single short suggestion hint. Source evidence remains in tooltips and imported notes; inference and validation behavior are unchanged.

Start Vite on port 5174, then run:

```sh
node tests/sourcing.browser.mjs
node tests/sourced-pool.browser.mjs
```

Set `SOURCING_TEST_URL` to use a different local frontend URL. Browser checks use mocked Chrome APIs and backend responses, with no writes to a real candidate database. Screenshots are generated under `tests/` and ignored by Git.

Coverage includes PDF/DOCX/TXT/HTML text extraction, rejected corrupt documents, scanned-PDF provider success/failure, safe preview rendering, editable skills, full resume preservation, attachment metadata, cross-window isolation, stale response rejection, unassigned sourced creation, failed promotion retry, preservation of untouched fields, all-records navigation, and widths from 320px to desktop.

Manual integration checks still needed with an authenticated unpacked extension:

- Capture actual LinkedIn, GitHub, embedded resume viewers, and authenticated document URLs.
- Upload representative legacy DOC files and image-only PDFs. OCR tries configured Groq, Gemini, OpenRouter and Mistral providers in that order, using the existing API keys. Groq renders PDF pages into images and uses `GROQ_VISION_MODEL` / `GROQ_VISION_FALLBACK_MODELS`; Mistral uses `MISTRAL_OCR_MODEL` / `MISTRAL_OCR_FALLBACK_MODELS`. OpenRouter sends the PDF through its `mistral-ocr` file parser to the configured chat models (OpenRouter OCR charges may apply). Each provider has a 10-second total attempt budget; invalid/empty/truncated results fall through. Groq documents over 10 pages or oversized rendered images fall through intact to PDF providers. OCR accuracy depends on scan quality.
- Enable file access in extension settings for local `file://` pages; uploading the original file works without page injection.
- Verify API and original-file storage credentials in the target deployment.

Browser-internal pages, inaccessible cross-origin frames, canvas-only document viewers and encrypted documents may require uploading the original document or pasting its text. No extraction path guarantees complete or correct fields; every capture remains editable before import.

The installable extension archive is `public/downloads/talentdesk-extension.zip`. Regenerate after extension changes with PowerShell:

```powershell
Compress-Archive -Path extension/* -DestinationPath public/downloads/talentdesk-extension.zip -Force
```

Extension 1.1.9 supports conservative role-based suggestions when work descriptions are missing, runs automatic AI inference for role-only histories, and explains empty/error results by the skills field. It retains the experience grouping and skill extraction fixes from 1.1.5–1.1.8. After updating the unpacked extension, reload it on `chrome://extensions`, refresh the LinkedIn tab and capture again. Existing candidate records are not automatically rewritten.
