import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { requireAuth } from '../auth.js';
import { prisma } from '../prisma.js';
import { storageService } from '../services/storageService.js';
import { extractText } from '../services/documentTextService.js';
import { parseResumeText } from '../services/resumeParsingService.js';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const MAX_BULK_FILES = 20;

function activeOrgId(req) {
  return req.organizationId || req.profile?.org_id;
}

function usageContext(req) {
  return {
    orgId: activeOrgId(req),
    userId: req.user?.id,
    userName: req.profile?.full_name || req.user?.email,
  };
}

// Same plan-tier fallback used in data.routes.js's candidate-limit check —
// kept in sync manually since it's a single-line business rule, not worth a
// shared module for. Enterprise is uncapped.
function candidateLimitFor(org) {
  if ((org?.subscription_plan || 'Growth') === 'Enterprise') return Infinity;
  return org?.candidate_limit || (org?.subscription_plan === 'Starter' ? 2500 : 15000);
}

// Best-effort: extract text, AI-parse it into profile fields, and upload the
// original file to R2. Never throws — callers get a per-file result object
// with `success`/`error` so one bad file doesn't sink an entire batch, and a
// missing/misconfigured R2 doesn't block the (already useful on its own)
// text-extraction + AI autofill.
async function processResumeFile(file, context) {
  const result = {
    fileName: file.originalname,
    success: false,
    extractedText: '',
    profile: {},
    resume_file_key: null,
    resume_file_name: null,
    resume_file_size: null,
    error: null,
  };

  try {
    result.extractedText = await extractText({ buffer: file.buffer, fileName: file.originalname, mimeType: file.mimetype });
  } catch (err) {
    result.error = err.message || 'Failed to read file.';
    return result;
  }

  // Kick off storage upload concurrently with AI parsing to save latency
  const storagePromise = storageService.uploadFile({
    buffer: file.buffer,
    fileName: file.originalname,
    mimeType: file.mimetype,
    orgId: context.orgId,
  }).catch(err => {
    console.warn('[upload.routes] Resume file storage upload failed, continuing with text only:', err.message);
    return null;
  });

  if (result.extractedText.trim()) {
    try {
      // Race the AI parsing against an 8-second timeout so slow AI fallback chains
      // never push total request time past Render's 30s connection limit on mobile.
      const aiTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI parsing timed out after 8s — skipping, fields left blank for manual entry.')), 8000)
      );
      result.profile = await Promise.race([
        parseResumeText(result.extractedText, context),
        aiTimeout,
      ]);
    } catch (err) {
      console.warn('[upload.routes] AI profile parsing skipped:', err.message);
    }
  }

  const uploaded = await storagePromise;
  if (uploaded) {
    result.resume_file_key = uploaded.key;
    result.resume_file_name = file.originalname;
    result.resume_file_size = uploaded.size;
  }

  result.success = true;
  return result;
}

router.post('/resume', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided.' });
    }

    const result = await processResumeFile(req.file, usageContext(req));
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    return res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, error: err.message || 'Resume upload failed.' });
  }
});

router.post('/resumes/bulk', upload.array('files', MAX_BULK_FILES), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, error: 'No files provided.' });
    }

    const orgId = activeOrgId(req);
    const context = usageContext(req);
    let remaining = Infinity;
    if (orgId) {
      const [org, count] = await Promise.all([
        prisma.organization.findUnique({ where: { id: orgId } }),
        prisma.candidate.count({ where: { org_id: orgId } }),
      ]);
      remaining = candidateLimitFor(org) - count;
    }

    const results = [];
    const toProcess = files.slice(0, Math.max(remaining, 0));
    const skipped = files.slice(toProcess.length);

    for (const file of toProcess) {
      results.push(await processResumeFile(file, context));
    }
    for (const file of skipped) {
      results.push({
        fileName: file.originalname,
        success: false,
        error: `Skipped — over your plan's candidate limit (${Math.max(remaining, 0)} slot${remaining === 1 ? '' : 's'} remaining).`,
      });
    }

    return res.json({ success: true, results });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, error: err.message || 'Bulk resume upload failed.' });
  }
});

const XLSX_HEADER_MAP = {
  firstname: 'first_name',
  first_name: 'first_name',
  lastname: 'last_name',
  last_name: 'last_name',
  email: 'email',
  emailaddress: 'email',
  phone: 'phone',
  phonenumber: 'phone',
  location: 'location',
  city: 'location',
  jobtitle: 'job_title',
  title: 'job_title',
  job_title: 'job_title',
  experience: 'experience',
  yearsexperience: 'experience',
  workauth: 'work_auth',
  work_auth: 'work_auth',
  visa: 'work_auth',
  linkedin: 'linkedin',
  rate: 'rate',
  payrate: 'rate',
  skills: 'skills',
  resumetext: 'resume_text',
  resume: 'resume_text',
  resume_text: 'resume_text',
  notes: 'notes',
  note: 'notes',
};

function normalizeHeader(header) {
  return String(header || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function mapXlsxRow(rawRow) {
  const profile = {};
  for (const [rawKey, rawValue] of Object.entries(rawRow)) {
    const normalized = normalizeHeader(rawKey);
    const field = XLSX_HEADER_MAP[normalized];
    if (!field || rawValue === undefined || rawValue === '') continue;
    if (field === 'skills') {
      profile.skills = String(rawValue).split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    } else {
      profile[field] = String(rawValue).trim();
    }
  }
  return profile;
}

router.post('/candidates/bulk-xlsx', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided.' });
    }

    let workbook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    } catch {
      return res.status(400).json({ success: false, error: 'Could not read that file as an Excel spreadsheet.' });
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const results = rawRows.map((rawRow, index) => {
      const profile = mapXlsxRow(rawRow);
      if (!profile.first_name) {
        return {
          fileName: `Row ${index + 2}`,
          success: false,
          error: 'Missing first_name.',
          profile,
        };
      }
      return { fileName: `Row ${index + 2}`, success: true, error: null, profile };
    });

    return res.json({ success: true, results });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, error: err.message || 'Spreadsheet import failed.' });
  }
});

router.get('/resume-url/:candidateId', async (req, res) => {
  try {
    const orgId = activeOrgId(req);
    const candidate = await prisma.candidate.findFirst({
      where: { id: req.params.candidateId, ...(orgId ? { org_id: orgId } : {}) },
    });
    if (!candidate) return res.status(404).json({ success: false, error: 'Candidate not found.' });
    if (!candidate.resume_file_key) return res.status(404).json({ success: false, error: 'No resume file on file for this candidate.' });

    const url = await storageService.getSignedDownloadUrl(candidate.resume_file_key);
    return res.json({ success: true, url, fileName: candidate.resume_file_name });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, error: err.message || 'Failed to generate download link.' });
  }
});

router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'File is too large (max 5MB per file).'
      : (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT')
        ? `Too many files in one batch (max ${MAX_BULK_FILES}).`
        : err.message;
    return res.status(400).json({ success: false, error: message });
  }
  const status = err.status || 500;
  return res.status(status).json({ success: false, error: err.message || 'Upload failed.' });
});

export default router;
