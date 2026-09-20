/**
 * Search functionality tests — Consumer Resolver.
 *
 * Tests the search scoring, matching, and result generation logic.
 */
import { describe, it, expect } from "vitest";

// ── Search logic (extracted from SearchBar for testing) ──────────

interface ProblemEntry {
  slug: string;
  title: string;
  category: string;
  keywords: string[];
  available: boolean;
}

const PROBLEMS: ProblemEntry[] = [
  {
    slug: "cancellation-charge",
    title: "Cancelación y cargos posteriores",
    category: "Pagos y facturas",
    keywords: [
      "cancelar",
      "cancelación",
      "cobrado",
      "cargo",
      "factura",
      "servicio",
      "telecomunicaciones",
      "suscripción",
      "permanencia",
      "internet",
      "móvil",
      "telefonía",
      "contrato",
    ],
    available: true,
  },
  {
    slug: "no-delivery-refund",
    title: "Compras y reembolsos",
    category: "Compras",
    keywords: [
      "pedido",
      "compra",
      "reembolso",
      "devolución",
      "dinero",
      "vendedor",
      "tienda",
      "envío",
      "entrega",
      "llegar",
    ],
    available: false,
  },
  {
    slug: "warranty-rejection",
    title: "Garantías y reparaciones",
    category: "Garantías",
    keywords: [
      "garantía",
      "reparación",
      "producto",
      "defectuoso",
      "sustitución",
      "rechazado",
      "técnico",
    ],
    available: false,
  },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function scoreProblem(problem: ProblemEntry, query: string): number {
  if (!query.trim()) return 0;
  const terms = normalize(query)
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  let score = 0;
  const titleNorm = normalize(problem.title);
  const categoryNorm = normalize(problem.category);

  for (const term of terms) {
    if (titleNorm.includes(term)) score += 10;
    if (categoryNorm.includes(term)) score += 5;
    for (const kw of problem.keywords) {
      const kwNorm = normalize(kw);
      if (kwNorm === term) score += 8;
      else if (kwNorm.includes(term) || term.includes(kwNorm)) score += 4;
    }
  }

  return score;
}

interface SearchResult {
  problem: ProblemEntry;
  score: number;
}

function searchProblems(query: string): SearchResult[] {
  return PROBLEMS.map((problem) => ({ problem, score: scoreProblem(problem, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ── Tests ────────────────────────────────────────────────────────

describe("Search: scoring", () => {
  it("returns 0 for empty query", () => {
    expect(scoreProblem(PROBLEMS[0]!, "")).toBe(0);
  });

  it("scores exact keyword match (≥8 points)", () => {
    const score = scoreProblem(PROBLEMS[0]!, "cancelar");
    expect(score).toBeGreaterThanOrEqual(8);
  });

  it("scores title match (≥10 points)", () => {
    const score = scoreProblem(PROBLEMS[0]!, "cancelación");
    expect(score).toBeGreaterThanOrEqual(10);
  });

  it("scores category match (≥5 points)", () => {
    const score = scoreProblem(PROBLEMS[0]!, "facturas");
    expect(score).toBeGreaterThanOrEqual(5);
  });

  it("scores partial keyword match (≥4 points)", () => {
    const score = scoreProblem(PROBLEMS[0]!, "telecom");
    expect(score).toBeGreaterThanOrEqual(4);
  });

  it("returns 0 for completely unrelated query", () => {
    expect(scoreProblem(PROBLEMS[0]!, "xyzxyzxyz")).toBe(0);
  });

  it("handles accented characters (garantía matches warranty-rejection)", () => {
    const score = scoreProblem(PROBLEMS[2]!, "garantía");
    expect(score).toBeGreaterThan(0);
  });

  it("accumulates multi-term scores", () => {
    const score = scoreProblem(PROBLEMS[0]!, "cancelar cobrado");
    // cancelar: keyword +8, cobrado: keyword +8 = 16
    expect(score).toBeGreaterThanOrEqual(16);
  });
});

describe("Search: result ranking", () => {
  it("returns results sorted by score descending", () => {
    const results = searchProblems("cancelar servicio");
    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });

  it("finds cancellation-charge for 'cobrado después de cancelar'", () => {
    const results = searchProblems("cobrado después de cancelar");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.problem.slug).toBe("cancellation-charge");
  });

  it("finds warranty for 'garantía'", () => {
    const results = searchProblems("garantía");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.problem.slug).toBe("warranty-rejection");
  });

  it("finds delivery for 'pedido llega'", () => {
    const results = searchProblems("pedido llega");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.problem.slug).toBe("no-delivery-refund");
  });

  it("returns empty for gibberish", () => {
    const results = searchProblems("asdfjkl qwerty");
    expect(results).toHaveLength(0);
  });
});

describe("Search: availability marking", () => {
  it("marks cancellation-charge as available", () => {
    const results = searchProblems("cancelar cobrado");
    const found = results.find((r) => r.problem.slug === "cancellation-charge");
    expect(found?.problem.available).toBe(true);
  });

  it("marks warranty-rejection as not available", () => {
    const results = searchProblems("garantía");
    const found = results.find((r) => r.problem.slug === "warranty-rejection");
    expect(found?.problem.available).toBe(false);
  });
});

describe("Search: Próximamente result handling", () => {
  it("identifies no-delivery-refund as not available", () => {
    const results = searchProblems("pedido no llega");
    const found = results.find((r) => r.problem.slug === "no-delivery-refund");
    expect(found).toBeDefined();
    expect(found!.problem.available).toBe(false);
  });

  it("identifies warranty-rejection as not available", () => {
    const results = searchProblems("garantía rechazada");
    const found = results.find((r) => r.problem.slug === "warranty-rejection");
    expect(found).toBeDefined();
    expect(found!.problem.available).toBe(false);
  });

  it("distinguishes available from not-available in mixed results", () => {
    const results = searchProblems("cancelar servicio");
    const available = results.filter((r) => r.problem.available);
    // cancellation-charge should be first and available
    expect(available.length).toBeGreaterThan(0);
    expect(available[0]!.problem.slug).toBe("cancellation-charge");
  });
});

describe("Search: natural language queries", () => {
  it("handles 'me han cobrado una factura después de cancelar'", () => {
    const results = searchProblems("me han cobrado una factura después de cancelar");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.problem.slug).toBe("cancellation-charge");
  });

  it("handles 'cancelé internet y me cobraron permanencia'", () => {
    const results = searchProblems("cancelé internet y me cobraron permanencia");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.problem.slug).toBe("cancellation-charge");
  });

  it("handles 'compra que nunca llegó'", () => {
    const results = searchProblems("compra que nunca llegó");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.problem.slug).toBe("no-delivery-refund");
  });

  it("handles 'reparación rechazada en garantía'", () => {
    const results = searchProblems("reparación rechazada en garantía");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.problem.slug).toBe("warranty-rejection");
  });
});

// ── Free-form problem detection (problema-libre) ────────────────

interface FreeFormEntry {
  slug: string;
  keywords: string[];
  title: string;
  available: boolean;
}

const FREE_FORM_ENTRIES: FreeFormEntry[] = [
  {
    slug: "cancellation-charge",
    keywords: [
      "cancelar",
      "cancelación",
      "cobrado",
      "cargo",
      "factura",
      "permanencia",
      "internet",
      "móvil",
      "telefonía",
    ],
    title: "Cancelación y cargos posteriores",
    available: true,
  },
];

function detectFreeFormMatch(text: string): FreeFormEntry | null {
  const lower = normalize(text);
  let bestScore = 0;
  let bestMatch: FreeFormEntry | null = null;
  for (const entry of FREE_FORM_ENTRIES) {
    let score = 0;
    for (const kw of entry.keywords) {
      const kwNorm = normalize(kw);
      if (lower.includes(kwNorm)) score++;
    }
    if (score > bestScore && score >= 2) {
      bestScore = score;
      bestMatch = entry;
    }
  }
  return bestMatch;
}

describe("Free-form problem detection", () => {
  it("detects cancellation-charge from natural description", () => {
    const match = detectFreeFormMatch("cancelé mi contrato de internet y me han cobrado");
    expect(match).not.toBeNull();
    expect(match!.slug).toBe("cancellation-charge");
    expect(match!.available).toBe(true);
  });

  it("detects from short description with 2+ keywords", () => {
    const match = detectFreeFormMatch("cancelar factura permanencia");
    expect(match).not.toBeNull();
    expect(match!.slug).toBe("cancellation-charge");
  });

  it("returns null for description with fewer than 2 matching keywords", () => {
    const match = detectFreeFormMatch("tengo un problema con mi router");
    expect(match).toBeNull();
  });

  it("returns null for unrelated description", () => {
    const match = detectFreeFormMatch("mi gato se escapó por la ventana");
    expect(match).toBeNull();
  });

  it("returns null for empty string", () => {
    const match = detectFreeFormMatch("");
    expect(match).toBeNull();
  });

  it("match never includes case creation or persistence metadata", () => {
    const match = detectFreeFormMatch("cancelar internet factura");
    expect(match).not.toBeNull();
    // The match only has slug, title, available — no case creation logic
    expect(match).not.toHaveProperty("caseId");
    expect(match).not.toHaveProperty("persisted");
  });
});
