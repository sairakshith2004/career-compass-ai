import JSZip from "jszip";

import type { ResumeAnalysis } from "../src/lib/resume-ai.server";

/** A minimal but real PDF whose text `pdf-parse` can extract. */
export function makePdf(text: string): Uint8Array {
  const objs = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${text.length + 60} >>\nstream\nBT /F1 12 Tf 50 740 Td (${text}) Tj ET\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objs) {
    offsets.push(pdf.length);
    pdf += o;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += String(off).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

/** A minimal but real DOCX whose text `mammoth` can extract. */
export async function makeDocx(text: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip
    .folder("_rels")!
    .file(
      ".rels",
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    );
  zip
    .folder("word")!
    .file(
      "document.xml",
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    );
  const buf = await zip.generateAsync({ type: "uint8array" });
  return buf;
}

export function fileFrom(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes], name, { type });
}

export const SAMPLE_RESUME_TEXT =
  "Priya Nair\nB.Tech, Electronics and Communication Engineering, NIT Warangal, 2026\n" +
  "Skills: Embedded C, Verilog, Python, MATLAB, Git\n" +
  "Projects: FPGA-based traffic controller (Verilog, Vivado); IoT weather station (ESP32, Embedded C).\n" +
  "Internship: Firmware intern at Acme Semiconductors (summer 2025).";

/** A schema-valid analysis, used by the fake AI in tests. */
export const FAKE_ANALYSIS: ResumeAnalysis = {
  candidateName: "Priya Nair",
  summary: "ECE student with embedded and FPGA project experience.",
  education: [
    {
      institution: "NIT Warangal",
      degree: "B.Tech",
      fieldOfStudy: "Electronics and Communication Engineering",
      graduationYear: 2026,
    },
  ],
  academic: {
    detectedDegree: "B.Tech",
    detectedBranch: "Electronics and Communication Engineering",
    detectedBranchConfidence: 95,
    detectedSpecialization: "Embedded Systems",
    detectedSpecializationConfidence: 62,
    detectedCollege: "NIT Warangal",
    detectedGraduationYear: 2026,
  },
  experienceLevel: "internship",
  experienceLevelConfidence: 80,
  skills: [
    {
      name: "Embedded C",
      kind: "language",
      evidenceType: "supported_by_resume",
      confidence: 88,
      evidence: [{ kind: "project", label: "IoT weather station" }],
    },
    {
      name: "Verilog",
      kind: "language",
      evidenceType: "supported_by_resume",
      confidence: 84,
      evidence: [{ kind: "project", label: "FPGA traffic controller" }],
    },
    {
      name: "Python",
      kind: "language",
      evidenceType: "claimed",
      confidence: 55,
      evidence: [],
    },
  ],
  programmingLanguages: ["Embedded C", "Verilog", "Python"],
  frameworks: [],
  tools: ["MATLAB", "Git", "Vivado"],
  databases: [],
  cloudTechnologies: [],
  projects: [
    {
      title: "FPGA-based traffic controller",
      description: "Verilog RTL on Vivado.",
      technologies: ["Verilog", "Vivado"],
      domain: "hardware",
    },
  ],
  projectDomains: ["hardware", "embedded", "iot"],
  internships: [
    {
      kind: "internship",
      organization: "Acme Semiconductors",
      role: "Firmware Intern",
      startDate: "2025-05",
      endDate: "2025-07",
      summary: "Firmware for a sensor board.",
    },
  ],
  workExperience: [],
  certifications: [],
  achievements: [],
  potentialCareers: [
    {
      title: "Embedded Engineer",
      score: 92,
      rationale: "Two embedded projects and a firmware internship.",
    },
    { title: "VLSI Design Engineer", score: 78, rationale: "Verilog/FPGA project work." },
    {
      title: "Software Engineer",
      score: 45,
      rationale: "Some Python; limited software depth shown.",
    },
  ],
};

/** Build an injectable `parse` for `analyzeResumeText` / `runResumeAnalysis`. */
export function fakeParse(analysis: ResumeAnalysis | null, opts: { stopReason?: string } = {}) {
  return async (_text: string) => ({
    analysis,
    stopReason: opts.stopReason ?? "end_turn",
    model: "fake-model",
    usage: { input: 100, output: 200 },
  });
}
