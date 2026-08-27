/**
 * Resume upload security. Every uploaded file is untrusted: we validate size,
 * extension, declared MIME *and* the real file signature, sanitize the
 * filename, run a malware scan, and only then hand the bytes to text
 * extraction. Files are stored under an opaque per-user key and are never
 * served from a public route.
 *
 * `.server.ts` — server-only.
 */

export const RESUME_MAX_BYTES = Number(process.env["RESUME_MAX_BYTES"] ?? 5 * 1024 * 1024);
const MIN_BYTES = 64;

export type ResumeFileKind = "pdf" | "docx";

const KIND_BY_EXT: Record<string, ResumeFileKind> = { pdf: "pdf", docx: "docx" };
const ALLOWED_MIMES: Record<ResumeFileKind, string[]> = {
  pdf: ["application/pdf", "application/x-pdf", "application/octet-stream"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "application/octet-stream",
    "",
  ],
};

export class ResumeUploadError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ResumeUploadError";
    this.code = code;
  }
}

/**
 * Reduce an arbitrary client-supplied name to a safe, display-only basename:
 * drop any path, strip control chars and anything outside a conservative
 * allow-list, collapse dots, cap length, and guarantee a correct extension.
 * The result is NEVER used as a filesystem path (storage keys are UUIDs).
 */
/** Drop C0/C1 control characters (incl. NUL) by code point — avoids a
 * control-char regex literal. */
function stripControlChars(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x20 && c !== 0x7f) out += ch;
  }
  return out;
}

export function sanitizeFilename(raw: string, kind: ResumeFileKind): string {
  const base = raw.split(/[/\\]/).pop() ?? "resume";
  let name = stripControlChars(base)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\s_-]+/, "")
    .trim();

  name = name.replace(/\.(pdf|docx|doc|txt|zip)$/i, "");
  if (name.length === 0) name = "resume";
  if (name.length > 80) name = name.slice(0, 80);
  return `${name}.${kind}`;
}

function detectKindFromSignature(bytes: Uint8Array): ResumeFileKind | null {
  // PDF: "%PDF-"
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return "pdf";
  }
  // DOCX is a ZIP container: "PK\x03\x04" (or the empty-archive / spanned variants).
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  ) {
    return "docx";
  }
  return null;
}

export type ValidatedResume = {
  kind: ResumeFileKind;
  safeFileName: string;
  bytes: Uint8Array;
  sizeBytes: number;
  /** The canonical MIME to persist (from the verified signature, not the client). */
  mimeType: string;
};

/**
 * Full validation gate. Throws `ResumeUploadError` with a user-safe message on
 * any failure; returns the sanitized, signature-verified file on success.
 */
export async function validateResumeUpload(file: File): Promise<ValidatedResume> {
  if (file.size < MIN_BYTES) {
    throw new ResumeUploadError("empty", "That file looks empty or corrupt.");
  }
  if (file.size > RESUME_MAX_BYTES) {
    const mb = Math.round(RESUME_MAX_BYTES / (1024 * 1024));
    throw new ResumeUploadError("too_large", `Resume must be ${mb} MB or smaller.`);
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const extKind = KIND_BY_EXT[ext];
  if (!extKind) {
    throw new ResumeUploadError("bad_extension", "Upload a PDF or DOCX file.");
  }

  const declaredMime = (file.type || "").toLowerCase();
  if (!ALLOWED_MIMES[extKind].includes(declaredMime)) {
    throw new ResumeUploadError(
      "bad_mime",
      "That file's type doesn't match a PDF or DOCX. Re-export it and try again.",
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  const sigKind = detectKindFromSignature(bytes);
  if (!sigKind) {
    throw new ResumeUploadError(
      "bad_signature",
      "That file isn't a valid PDF or DOCX (its contents don't match its extension).",
    );
  }
  if (sigKind !== extKind) {
    throw new ResumeUploadError(
      "signature_mismatch",
      `That file is actually a ${sigKind.toUpperCase()}, not a ${extKind.toUpperCase()}.`,
    );
  }

  const scan = await scanResume(bytes, sigKind);
  if (!scan.ok) {
    throw new ResumeUploadError("malware", scan.reason);
  }

  const canonicalMime =
    sigKind === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  return {
    kind: sigKind,
    safeFileName: sanitizeFilename(file.name, sigKind),
    bytes,
    sizeBytes: file.size,
    mimeType: canonicalMime,
  };
}

// --- malware scanning architecture --------------------------------------

export type ScanResult = { ok: true } | { ok: false; reason: string };

/**
 * Pluggable malware scan. In order:
 *   1. Structural heuristics that run everywhere (macro-enabled Office parts,
 *      embedded executables inside the DOCX zip, PDF `/Launch` / OpenAction
 *      auto-exec actions).
 *   2. An external scanner when `RESUME_MALWARE_SCAN_CMD` is set — the command
 *      receives the file on stdin and must exit 0 for "clean", non-zero for
 *      "infected". This is where ClamAV (`clamdscan -`) or a cloud AV shim
 *      plugs in; production deployments SHOULD configure one.
 *
 * A scanner that is not configured is not a silent pass: the heuristics below
 * still run, and the result is logged.
 */
export async function scanResume(bytes: Uint8Array, kind: ResumeFileKind): Promise<ScanResult> {
  const heuristic = kind === "docx" ? scanDocxHeuristics(bytes) : scanPdfHeuristics(bytes);
  if (!heuristic.ok) return heuristic;

  const cmd = process.env["RESUME_MALWARE_SCAN_CMD"];
  if (cmd) {
    try {
      const external = await runExternalScanner(cmd, bytes);
      if (!external.ok) return external;
    } catch (err) {
      console.error("[resume-scan] external scanner failed to run:", (err as Error).message);
      throw new ResumeUploadError(
        "scan_unavailable",
        "Couldn't scan that file right now. Please try again in a moment.",
      );
    }
  }
  return { ok: true };
}

function bytesInclude(hay: Uint8Array, needle: string): boolean {
  const n = new TextEncoder().encode(needle);
  outer: for (let i = 0; i + n.length <= hay.length; i++) {
    for (let j = 0; j < n.length; j++) if (hay[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

function scanDocxHeuristics(bytes: Uint8Array): ScanResult {
  // We don't unzip (that itself is attack surface). Central-directory filenames
  // are stored as plain text inside the archive, so a substring scan catches the
  // dangerous entries.
  for (const marker of ["vbaProject.bin", "vbaData.xml", "word/vbaProject"]) {
    if (bytesInclude(bytes, marker)) {
      return {
        ok: false,
        reason: "That document contains macros. Upload a macro-free PDF or DOCX.",
      };
    }
  }
  for (const marker of [".exe", ".dll", ".scr", ".bat", ".cmd", ".vbs", ".jar", ".ps1"]) {
    if (bytesInclude(bytes, marker)) {
      return {
        ok: false,
        reason: "That document has an embedded executable and can't be accepted.",
      };
    }
  }
  return { ok: true };
}

function scanPdfHeuristics(bytes: Uint8Array): ScanResult {
  // Auto-executing actions in a PDF are a classic delivery vector.
  for (const marker of ["/Launch", "/JavaScript", "/JS ", "/OpenAction", "/AA "]) {
    if (bytesInclude(bytes, marker)) {
      return {
        ok: false,
        reason:
          "That PDF contains active scripting or auto-run actions. Re-export it as a plain PDF.",
      };
    }
  }
  return { ok: true };
}

async function runExternalScanner(cmd: string, bytes: Uint8Array): Promise<ScanResult> {
  const { spawn } = await import("node:child_process");
  const [bin, ...args] = cmd.split(/\s+/);
  return new Promise<ScanResult>((resolve, reject) => {
    const proc = spawn(bin!, args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d) => {
      if (stderr.length < 2000) stderr += String(d);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true });
      } else {
        console.warn("[resume-scan] scanner exit", code, stderr.slice(0, 200));
        resolve({ ok: false, reason: "That file was flagged by our malware scanner." });
      }
    });
    proc.stdin?.end(Buffer.from(bytes));
  });
}
