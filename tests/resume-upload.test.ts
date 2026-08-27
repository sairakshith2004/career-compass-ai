import { describe, expect, test } from "bun:test";

import {
  sanitizeFilename,
  scanResume,
  validateResumeUpload,
  ResumeUploadError,
} from "../src/lib/resume-upload.server";
import { makePdf, makeDocx, fileFrom } from "./resume-fixtures";

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("validateResumeUpload", () => {
  test("accepts a valid PDF and returns the canonical MIME", async () => {
    const file = fileFrom(makePdf("A".repeat(200)), "resume.pdf", PDF_MIME);
    const v = await validateResumeUpload(file);
    expect(v.kind).toBe("pdf");
    expect(v.mimeType).toBe(PDF_MIME);
    expect(v.safeFileName).toBe("resume.pdf");
  });

  test("accepts a valid DOCX", async () => {
    const bytes = await makeDocx("Valid resume content ".repeat(10));
    const file = fileFrom(bytes, "My CV.docx", DOCX_MIME);
    const v = await validateResumeUpload(file);
    expect(v.kind).toBe("docx");
    expect(v.mimeType).toBe(DOCX_MIME);
    expect(v.safeFileName).toBe("My CV.docx");
  });

  test("rejects an unsupported extension", async () => {
    const file = fileFrom(new TextEncoder().encode("hello ".repeat(50)), "notes.txt", "text/plain");
    await expect(validateResumeUpload(file)).rejects.toMatchObject({ code: "bad_extension" });
  });

  test("rejects a file whose bytes don't match its extension (content sniffing)", async () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...new Uint8Array(200)]);
    const file = fileFrom(gif, "resume.pdf", PDF_MIME);
    await expect(validateResumeUpload(file)).rejects.toMatchObject({ code: "bad_signature" });
  });

  test("rejects a PDF renamed to .docx", async () => {
    const file = fileFrom(makePdf("A".repeat(200)), "resume.docx", DOCX_MIME);
    await expect(validateResumeUpload(file)).rejects.toMatchObject({ code: "signature_mismatch" });
  });

  test("rejects an oversized file", async () => {
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    const file = fileFrom(big, "huge.pdf", PDF_MIME);
    await expect(validateResumeUpload(file)).rejects.toMatchObject({ code: "too_large" });
  });

  test("rejects a macro-enabled DOCX (malicious input)", async () => {
    // A zip that names a vbaProject part — caught without unzipping.
    const bytes = new Uint8Array([
      0x50,
      0x4b,
      0x03,
      0x04,
      ...new TextEncoder().encode("word/vbaProject.bin"),
      ...new Uint8Array(80),
    ]);
    const file = fileFrom(bytes, "resume.docx", DOCX_MIME);
    await expect(validateResumeUpload(file)).rejects.toMatchObject({ code: "malware" });
  });

  test("rejects a PDF with embedded JavaScript / auto-run actions", async () => {
    const bytes = new TextEncoder().encode(
      "%PDF-1.4\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\n" +
        "x".repeat(100),
    );
    const file = fileFrom(bytes, "resume.pdf", PDF_MIME);
    await expect(validateResumeUpload(file)).rejects.toMatchObject({ code: "malware" });
  });
});

describe("sanitizeFilename", () => {
  test("strips path traversal and keeps a safe basename", () => {
    expect(sanitizeFilename("../../etc/passwd.pdf", "pdf")).toBe("passwd.pdf");
    // NFKD-decomposed accents fall outside the allow-list and become `_`.
    expect(sanitizeFilename("C:\\Users\\me\\résumé final.docx", "docx")).toBe(
      "re_sume_ final.docx",
    );
    expect(sanitizeFilename("résumé final.docx", "docx")).not.toContain("/");
  });

  test("removes control characters and exotic symbols", () => {
    expect(sanitizeFilename("re\u0000su\u001bme<script>.pdf", "pdf")).toBe("resume_script_.pdf");
  });

  test("always produces a name with the correct extension", () => {
    expect(sanitizeFilename("", "pdf")).toBe("resume.pdf");
    expect(sanitizeFilename("....", "docx")).toBe("resume.docx");
    expect(sanitizeFilename("x".repeat(300) + ".pdf", "pdf")).toMatch(/^x{80}\.pdf$/);
  });
});

describe("scanResume heuristics", () => {
  test("clean PDF and DOCX pass", async () => {
    expect(await scanResume(makePdf("clean resume"), "pdf")).toEqual({ ok: true });
    expect(await scanResume(await makeDocx("clean resume"), "docx")).toEqual({ ok: true });
  });

  test("DOCX with an embedded .exe is rejected", async () => {
    const bytes = new Uint8Array([
      0x50,
      0x4b,
      0x03,
      0x04,
      ...new TextEncoder().encode("payload.exe"),
      ...new Uint8Array(40),
    ]);
    const r = await scanResume(bytes, "docx");
    expect(r.ok).toBe(false);
  });
});

test("ResumeUploadError carries a code and a user-safe message", () => {
  const e = new ResumeUploadError("too_large", "Resume must be 5 MB or smaller.");
  expect(e.code).toBe("too_large");
  expect(e.message).toContain("5 MB");
});
