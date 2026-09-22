/**
 * PDF export adapter.
 *
 * Produces a single, self-contained PDF of the case: what the person answered,
 * what the analysis could confirm, what is still missing, what to do next, where
 * to complain and which official sources back it.
 *
 * Two rules it never breaks:
 *  - The content comes from `ExportData` only. Nothing is invented: no phone
 *    numbers, no mailboxes, no legal references beyond the cited sources.
 *  - Anything that cannot be drawn is dropped, never silently mangled. Text is
 *    transliterated to the PDF standard font encoding (WinAnsi), so a stray
 *    glyph cannot corrupt a page.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ExportPort } from "@core/export/ports";
import type {
  ExportAnswer,
  ExportData,
  ExportFormat,
  ExportOptions,
  ExportResult,
} from "@core/export/types";
import type { ClaimStatus } from "@core/result/types";
import { COMPANY_CONTACT_GUIDANCE } from "@core/result/company-contacts";

// ── Layout constants (A4, points) ───────────────────────────────────

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT = 14;
const BODY_SIZE = 10;
const SMALL_SIZE = 8.5;

const COLORS = {
  ink: rgb(0.1, 0.1, 0.12),
  muted: rgb(0.42, 0.42, 0.46),
  accent: rgb(0.13, 0.36, 0.6),
  rule: rgb(0.82, 0.82, 0.84),
  supported: rgb(0.11, 0.45, 0.28),
  insufficient: rgb(0.6, 0.4, 0.08),
  contradicted: rgb(0.6, 0.16, 0.16),
} as const;

const STATUS_LABELS: Record<ClaimStatus, string> = {
  SUPPORTED: "Confirmado",
  POTENTIALLY_APPLICABLE: "Puede ser aplicable",
  INSUFFICIENT_DATA: "Falta información",
  CONTRADICTED: "Información contradictoria",
  NOT_APPLICABLE: "No aplicable",
  UNKNOWN: "No determinado",
};

const ORIGIN_LABELS: Record<ExportAnswer["origin"], string> = {
  USER: "Indicado por ti",
  DOCUMENT: "Leído de un documento",
  DERIVED: "Calculado por el análisis",
};

// ── Text helpers ────────────────────────────────────────────────────

/** Characters the standard PDF fonts cannot encode, mapped to readable ASCII. */
const TRANSLITERATIONS: Readonly<Record<string, string>> = {
  // The euro sign is outside WinAnsi's drawable range for the standard fonts:
  // without this, "249,90 €" would be printed as "249,90".
  "€": "EUR",
  "→": "->",
  "←": "<-",
  "≤": "<=",
  "≥": ">=",
  "≈": "~",
  "•": "-",
  "·": "-",
  "¼": "1/4",
  "½": "1/2",
  "¾": "3/4",
};

/**
 * Make a string drawable with WinAnsi and free of control characters.
 * Spanish accents, ñ, ¿, ¡, «», € and dashes are all inside WinAnsi and survive.
 */
function toDrawable(text: string): string {
  let out = "";
  for (const rawChar of text.normalize("NFC")) {
    const mapped = TRANSLITERATIONS[rawChar];
    if (mapped) {
      out += mapped;
      continue;
    }
    const code = rawChar.codePointAt(0) ?? 0;
    if (code < 32) {
      out += " ";
      continue;
    }
    // Latin-1 + the printable WinAnsi range used by these fonts.
    if (code > 255) continue;
    out += rawChar;
  }
  return out.replace(/[ \t]+/g, " ").trim();
}

/** Wrap text to a width, using the real font metrics. */
function wrap(text: string, font: PdfFontLike, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current.length > 0) lines.push(current);
      current = word;
    }
    if (current.length > 0) lines.push(current);
  }
  return lines;
}

interface PdfFontLike {
  widthOfTextAtSize(text: string, size: number): number;
}

// ── Document writer ─────────────────────────────────────────────────

/**
 * Minimal flowing-text writer: tracks the cursor, breaks pages, and keeps a
 * heading with the text that follows it.
 */
class ReportWriter {
  private page;
  private y = PAGE_HEIGHT - MARGIN;
  private pageNumber = 1;

  constructor(
    private readonly doc: Awaited<ReturnType<typeof PDFDocument.create>>,
    private readonly body: PdfFontLike & { tag: string },
    private readonly bold: PdfFontLike & { tag: string },
  ) {
    this.page = this.addPage();
  }

  private addPage() {
    const page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pageNumber += 1;
    this.y = PAGE_HEIGHT - MARGIN;
    return page;
  }

  private ensure(space: number): void {
    if (this.y - space < MARGIN) this.page = this.addPage();
  }

  private draw(
    text: string,
    font: PdfFontLike & { tag: string },
    size: number,
    color = COLORS.ink,
    indent = 0,
  ): void {
    this.page.drawText(text, {
      x: MARGIN + indent,
      y: this.y,
      size,
      font: font as never,
      color,
    });
    this.y -= size + 4;
  }

  title(text: string, subtitle?: string): void {
    this.draw(toDrawable(text), this.bold, 20, COLORS.ink);
    if (subtitle) this.draw(toDrawable(subtitle), this.body, 10, COLORS.muted);
    this.y -= 6;
    this.rule();
  }

  sectionHeading(text: string): void {
    this.ensure(LINE_HEIGHT * 3);
    this.y -= 10;
    this.draw(toDrawable(text.toUpperCase()), this.bold, 9.5, COLORS.accent);
    this.y -= 2;
  }

  paragraph(text: string, options?: { size?: number; color?: unknown; indent?: number }): void {
    const size = options?.size ?? BODY_SIZE;
    const color = (options?.color as never) ?? COLORS.ink;
    const indent = options?.indent ?? 0;
    const lines = wrap(toDrawable(text), this.body, size, CONTENT_WIDTH - indent);
    for (const line of lines) {
      this.ensure(LINE_HEIGHT);
      this.draw(line, this.body, size, color, indent);
    }
  }

  /** Bold label followed by body text, kept together on the same page. */
  labelled(label: string, body: string, indent = 0): void {
    const lines = wrap(toDrawable(body), this.body, BODY_SIZE, CONTENT_WIDTH - indent);
    this.ensure(LINE_HEIGHT * Math.min(lines.length + 1, 4));
    this.draw(toDrawable(label), this.bold, BODY_SIZE, COLORS.ink, indent);
    for (const line of lines) {
      this.ensure(LINE_HEIGHT);
      this.draw(line, this.body, BODY_SIZE, COLORS.ink, indent);
    }
  }

  bullet(text: string, indent = 8): void {
    const lines = wrap(toDrawable(text), this.body, BODY_SIZE, CONTENT_WIDTH - indent - 10);
    this.ensure(LINE_HEIGHT);
    this.draw("-", this.body, BODY_SIZE, COLORS.muted, indent);
    for (const line of lines) {
      this.ensure(LINE_HEIGHT);
      this.draw(line, this.body, BODY_SIZE, COLORS.ink, indent + 10);
    }
  }

  spacer(amount = 6): void {
    this.y -= amount;
  }

  rule(): void {
    this.ensure(6);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.5,
      color: COLORS.rule,
    });
    this.y -= 10;
  }

  /** Page numbers, added once at the end so they cover every page. */
  stampFooters(): void {
    const pages = this.doc.getPages();
    pages.forEach((page, index) => {
      const label = `Resolveo - Informe del caso - Página ${index + 1} de ${pages.length}`;
      page.drawText(toDrawable(label), {
        x: MARGIN,
        y: MARGIN / 2,
        size: SMALL_SIZE,
        font: this.body as never,
        color: COLORS.muted,
      });
    });
  }
}

// ── Section builders ────────────────────────────────────────────────

function claimColor(status: ClaimStatus) {
  if (status === "SUPPORTED") return COLORS.supported;
  if (status === "INSUFFICIENT_DATA") return COLORS.insufficient;
  if (status === "CONTRADICTED") return COLORS.contradicted;
  return COLORS.muted;
}

/** Amounts and dates first: the case in numbers before the prose. */
function buildHighlightsSection(writer: ReportWriter, data: ExportData): void {
  const highlights = data.highlights ?? [];
  if (highlights.length === 0) return;

  writer.sectionHeading("Datos clave del caso");
  for (const item of highlights) {
    writer.labelled(`${item.label}: ${item.value}`, "", 4);
  }
  writer.spacer(2);
}

/**
 * The company the claim is against and its official customer service.
 *
 * Only channels verified against the company's own page are printed, and the
 * document always says where they were read so the person can re-check them.
 */
function buildCompanySection(writer: ReportWriter, data: ExportData): void {
  const company = data.result.company;
  if (!company) return;

  writer.sectionHeading(`Empresa a la que reclamas: ${company.name}`);

  if (!company.known) {
    writer.paragraph(
      "Todavía no tenemos verificados los canales oficiales de atención al cliente de esta empresa, así que no reproducimos ningún teléfono ni correo para no darte un dato equivocado. Puedes encontrarlos así:",
      { size: SMALL_SIZE },
    );
    for (const step of COMPANY_CONTACT_GUIDANCE) writer.bullet(step);
    writer.spacer(2);
    return;
  }

  for (const channel of company.channels) {
    const detail =
      channel.value !== undefined
        ? `${channel.value}. ${channel.hours ?? ""}`.trim()
        : (channel.hours ?? "");
    writer.labelled(`${channel.label}: ${detail}`, channel.note ?? "", 4);
    if (channel.url) {
      writer.paragraph(channel.url, { size: SMALL_SIZE, color: COLORS.accent, indent: 8 });
    }
  }

  if (company.note) {
    writer.spacer(2);
    writer.paragraph(company.note, { size: SMALL_SIZE, color: COLORS.muted });
  }
  if (company.sourceUrl) {
    writer.paragraph(
      `Canales verificados el ${company.verifiedAt ?? ""} en la página oficial: ${company.sourceUrl}`,
      { size: SMALL_SIZE, color: COLORS.muted },
    );
  }
  writer.spacer(2);
}

function buildAnswersSection(writer: ReportWriter, data: ExportData): void {
  const answers = data.answers ?? [];
  if (answers.length === 0) return;

  writer.sectionHeading("Qué nos has indicado");
  for (const answer of answers) {
    writer.labelled(`${answer.label}: ${answer.value}`, `(${ORIGIN_LABELS[answer.origin]})`);
  }
}

function buildResultSection(writer: ReportWriter, data: ExportData): void {
  writer.sectionHeading("Resumen del análisis");
  writer.paragraph(data.result.summary);

  const order: ClaimStatus[] = [
    "SUPPORTED",
    "POTENTIALLY_APPLICABLE",
    "INSUFFICIENT_DATA",
    "CONTRADICTED",
    "NOT_APPLICABLE",
  ];

  for (const status of order) {
    const claims = data.result.claims.filter((claim) => claim.status === status);
    if (claims.length === 0) continue;
    writer.spacer(4);
    writer.paragraph(STATUS_LABELS[status], { color: claimColor(status) });
    for (const claim of claims) {
      writer.labelled(`- ${claim.assertion}`, claim.explanation, 8);
    }
  }
}

function buildMissingSection(writer: ReportWriter, data: ExportData): void {
  const missing = data.result.missingInformation.filter((m) => m.impact === "required");
  const recommended = data.result.missingInformation.filter((m) => m.impact !== "required");
  if (missing.length === 0 && recommended.length === 0) return;

  writer.sectionHeading("Datos que faltan");
  if (missing.length > 0) {
    writer.paragraph("Con estos datos el análisis puede concluir:");
    for (const item of missing) writer.bullet(item.description);
  }
  for (const item of recommended) writer.bullet(item.description);
}

function buildActionsSection(writer: ReportWriter, data: ExportData): void {
  writer.sectionHeading("Qué hacer ahora");
  writer.paragraph(data.actionPlan.nextStep);
  writer.spacer(2);
  for (const action of data.actionPlan.actions) {
    writer.labelled(`${action.priority}. ${action.title}`, action.description, 4);
  }
}

function buildChannelsSection(writer: ReportWriter, data: ExportData): void {
  if (data.result.channels.length === 0) return;
  writer.sectionHeading("Dónde reclamar");
  for (const channel of data.result.channels) {
    writer.labelled(channel.target, `${channel.channel}. ${channel.why}`, 4);
    writer.paragraph(channel.url, { size: SMALL_SIZE, color: COLORS.accent, indent: 4 });
  }
  writer.spacer(2);
  writer.paragraph(
    "El teléfono y el correo de cada organismo se publican en su página oficial. No los copiamos aquí porque cambian con el tiempo.",
    { size: SMALL_SIZE, color: COLORS.muted },
  );
}

function buildSourcesSection(
  writer: ReportWriter,
  data: ExportData,
  includeSources: boolean,
): void {
  if (!includeSources || data.result.sources.length === 0) return;
  writer.sectionHeading("Fuentes consultadas");
  for (const source of data.result.sources) {
    // The claim each source backs is what makes the list checkable.
    writer.labelled(source.title, `${source.claim}. ${source.url}`, 4);
  }
}

function buildDisclaimers(writer: ReportWriter, data: ExportData, include: boolean): void {
  if (!include || data.result.disclaimers.length === 0) return;
  writer.sectionHeading("Aviso legal");
  for (const disclaimer of data.result.disclaimers) writer.bullet(disclaimer);
}

// ── Adapter ─────────────────────────────────────────────────────────

export class PdfExportAdapter implements ExportPort {
  readonly format: ExportFormat = "pdf";

  supports(format: ExportFormat): boolean {
    return format === "pdf";
  }

  async export(data: ExportData, options?: ExportOptions): Promise<ExportResult> {
    const doc = await PDFDocument.create();
    doc.setTitle(`Informe del caso ${data.result.caseId}`);
    doc.setCreator("Resolveo");
    doc.setProducer("Resolveo");

    const body = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const writer = new ReportWriter(doc, body as never, bold as never);

    const created = data.caseMetadata.createdAt.slice(0, 10);
    writer.title(
      "Informe del caso",
      `${data.caseMetadata.problemTitle} · ${data.caseMetadata.jurisdiction} · Caso del ${created}`,
    );
    writer.paragraph(
      `Estado del análisis: ${STATUS_LABELS[data.result.overallStatus]}. Fecha del análisis: ${data.result.evaluatedAt.slice(0, 10)}.`,
      { color: COLORS.muted },
    );

    buildHighlightsSection(writer, data);
    buildCompanySection(writer, data);
    buildAnswersSection(writer, data);
    buildResultSection(writer, data);
    buildMissingSection(writer, data);
    buildActionsSection(writer, data);
    buildChannelsSection(writer, data);
    buildSourcesSection(writer, data, options?.includeSources ?? true);
    buildDisclaimers(writer, data, options?.includeDisclaimers ?? true);

    writer.stampFooters();

    const bytes = await doc.save();
    return {
      format: "pdf",
      content: bytes,
      mimeType: "application/pdf",
      filename: `resolveo-${data.result.caseId}.pdf`,
      sizeBytes: bytes.length,
    };
  }
}
