# Candidate Sourcing Verification

Run `node --test tests/sourcing.test.mjs tests/ocr-fallback.test.mjs` for profile normalization, document extraction and cross-provider OCR checks. Provider calls are mocked; the Groq PDF-to-image rendering test uses a real generated two-page PDF.

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
