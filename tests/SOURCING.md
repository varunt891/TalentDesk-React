# Candidate Sourcing Verification

Run `node --test tests/sourcing.test.mjs tests/ocr-fallback.test.mjs` for profile normalization, document extraction and cross-provider OCR checks. Provider calls are mocked; the Groq PDF-to-image rendering test uses a real generated two-page PDF.

Run `node --test tests/extension-skills.test.mjs` for LinkedIn skill-section matching, activity/comment counter rejection, supported AI fallback, duplicate accessible-label handling and preservation of valid skills such as C++, C#, .NET, R, Live Streaming and non-English skill names. Coverage includes semantic list rows, plain paragraph and heading titles, skill search links, exclusion of nested employer labels, and skills loaded below the initial page height. The side-panel browser checks also reproduce dirty DOM skills overriding AI results, verify the imported skills, and leave missing skills empty instead of inventing them.

Run `node --test tests/extension-experience.test.mjs` for first-role preservation in text-only Experience sections, current-role badges before job titles, and grouped company roles. Screenshot regressions verify the latest Unoah role remains first and the two nested Abacus roles retain their employer, dates, and descriptions between standalone Ignyte and WMS entries. Both structured DOM lists and text fallback are covered, including multiple groups and duration-only company tenure. Browser checks carry these records and skills through Quick Extract's one-time deep retry, AI review, and the mocked import payload.

AI skill inference is separate from explicit skill extraction. The web-profile parser returns `inferred_skills: [{ skill, evidence }]`; the extension accepts suggestions only when their 20–600 character quote appears in both the captured source and the candidate's work description. It deduplicates against explicit skills and labels suggestions in tags and imported notes. Quick Extract automatically makes one AI request when a completed capture has substantive work descriptions but no skills; failures preserve the DOM preview. Tests cover evidence matching, rejected title-only/fabricated evidence, automatic inference, retained company boundaries, import provenance, and AI unavailability. `tests/ai-workbench-api.test.mjs` also verifies the authenticated parser request/response contract using a mocked AI provider and disposable database. No paid model calls are made by these tests; live model inference quality still needs review.

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

Extension 1.1.8 adds evidence-backed AI skill suggestions from work descriptions and an automatic AI pass when captured LinkedIn skills are empty. It retains the experience grouping, skill-layout and lazy-loading fixes from 1.1.5–1.1.7. After updating the unpacked extension, reload it on `chrome://extensions`, refresh the LinkedIn tab and capture again. Existing candidate records are not automatically rewritten.
