/**
 * End-to-end check of the case report screen.
 *
 * The backend is stubbed so the report can be rendered without a database: what
 * matters here is the screen — the amounts and dates up front, the company and
 * its verified customer service, conclusions grouped by meaning, pending data
 * that can be answered in place (and then re-analysed), the person's own
 * answers, the official channels and the PDF download.
 */
import { expect, test, type Page } from "@playwright/test";

const CASE_ID = "11111111-2222-4333-8444-555555555555";

const interpretPayload = {
  caseId: CASE_ID,
  interpretation: {
    summary: "Cancelación de un vuelo de Madrid a Londres.",
    candidateModules: [
      {
        problemKey: "flight-cancel",
        signals: ["vuelo cancelado"],
        matchedRequiredFacts: [],
        missingRequiredFacts: [],
        confidence: "HIGH",
      },
    ],
    factCandidates: [],
    missingInformation: [],
    ambiguities: [],
    entities: [],
    jurisdictionHints: [{ jurisdiction: "ES", confidence: "HIGH", signals: ["Madrid"] }],
  },
  routing: {
    status: "ROUTED",
    moduleKey: "flight-cancel",
    moduleTitle: "Vuelo cancelado",
    userExplanation: "Parece que tu problema está relacionado con: Vuelo cancelado.",
  },
  nextQuestion: {
    factKey: "flight.departure_airport",
    questionText: "¿De qué aeropuerto salía tu vuelo? Escribe la ciudad o su código IATA.",
    reason: "Required fact missing",
    priority: "REQUIRED",
    remainingCount: 1,
    questionType: "string",
    options: ["MAD — Madrid", "LHR — Londres"],
    required: true,
    totalApplicable: 2,
  },
  budget: { current: 0, max: 3 },
};

const missingPending = [
  {
    factKey: "airline.re_routing.accepted",
    answerFactKey: "airline.re_routing.accepted",
    description: "¿Aceptaste el vuelo alternativo que te ofrecieron?",
    answerType: "boolean",
    kind: "question",
    impact: "required",
    answerable: true,
    blockedClaims: ["flight-cancel.compensation-amount"],
  },
  {
    factKey: "flight.compensation_tier",
    answerFactKey: "flight.departure_airport",
    description:
      "No hemos podido calcular el importe de la compensación porque no reconocemos los aeropuertos del vuelo.",
    answerType: "string",
    answerOptions: ["MAD — Madrid", "LHR — Londres"],
    kind: "review",
    impact: "required",
    answerable: true,
    blockedClaims: ["flight-cancel.compensation-amount"],
  },
  {
    factKey: "airline.not_computable",
    description: "No hemos podido calcular este dato con la información disponible.",
    kind: "review",
    impact: "required",
    answerable: false,
    blockedClaims: ["flight-cancel.assistance-not-offered"],
  },
];

/** Verified customer service of the company the case is against. */
const KNOWN_COMPANY = {
  name: "Vueling",
  factKey: "airline.name",
  known: true,
  sector: "Aerolínea",
  channels: [
    {
      kind: "phone",
      label: "Atención al cliente en España",
      value: "900 645 000",
      hours: "Línea disponible 24 h.",
    },
    {
      kind: "web",
      label: "Reclamaciones y reembolsos",
      url: "https://help.vueling.com/hc/es/articles/19798807271441",
    },
  ],
  sourceUrl: "https://help.vueling.com/hc/es/articles/19916107516177",
  verifiedAt: "2026-09-22",
};

const COMPANY_QUESTION = {
  id: "q-airline-name",
  text: "¿Qué aerolínea era?",
  factKey: "airline.name",
  type: "string",
};

const FACT_LABELS = {
  "cancellation.date": "¿Cuándo te comunicaron la cancelación?",
  "flight.compensation_tier": "Tier de compensación según distancia",
};

const HIGHLIGHTS = [
  {
    label: "¿Tuviste gastos adicionales por la cancelación?",
    value: "249,90 €",
    kind: "money",
    factKey: "passenger.additional_costs",
  },
  {
    label: "¿Cuál era la fecha programada del vuelo?",
    value: "10/08/2026",
    kind: "date",
    factKey: "flight.scheduled_date",
  },
];

function buildResult(pendingCount: number, companyKnown: boolean) {
  return {
    overallStatus: "SUPPORTED",
    summary: "Análisis: 2 afirmaciones confirmadas; 1 afirmación sin datos suficientes.",
    company: companyKnown ? KNOWN_COMPANY : null,
    claims: [
      {
        id: "claim-0",
        ruleKey: "flight-cancel.notice-period-insufficient",
        status: "SUPPORTED",
        assertion: "El plazo de aviso fue inferior a 14 días antes de la salida",
        explanation: "La aerolínea canceló el vuelo con dos días de antelación.",
        missingFacts: [],
        supportingFacts: [
          { factKey: "cancellation.date", value: { type: "date", value: "2026-09-01" } },
        ],
      },
      {
        id: "claim-1",
        ruleKey: "flight-cancel.compensation-amount",
        status: "INSUFFICIENT_DATA",
        assertion: "La cuantía base de compensación según distancia del vuelo",
        explanation: "No podemos determinar la cuantía sin conocer la distancia.",
        missingFacts: ["flight.compensation_tier"],
        supportingFacts: [],
      },
    ],
    sources: [
      {
        sourceId: "src-eu261-art7",
        title: "Reglamento (CE) 261/2004, art. 7",
        url: "https://eur-lex.europa.eu/eli/reg/2004/261/oj",
        type: "Reglamento",
        claim: "Cuantía de la compensación por distancia",
      },
    ],
    disclaimers: ["Esta información no constituye asesoramiento legal."],
    missingInformation: missingPending.slice(0, pendingCount),
    channels: [
      {
        id: "aesa-pasajeros",
        target: "Agencia Española de Seguridad Aérea (AESA)",
        channel: "Reclamación por cancelación",
        why: "Autoridad competente para las compensaciones del Reglamento 261/2004.",
        url: "https://www.seguridadaerea.gob.es/",
      },
    ],
  };
}

const answers = [
  { label: "¿De qué aeropuerto salía tu vuelo?", value: "Madrid", origin: "USER" },
  { label: "¿Cuál era la fecha programada del vuelo?", value: "10/08/2026", origin: "USER" },
];

const actionPlan = {
  nextStep:
    "Faltan 2 datos para poder concluir. Empieza por: ¿Aceptaste el vuelo alternativo? (y 1 más)",
  actions: [
    {
      id: "a1",
      type: "COLLECT_INFORMATION",
      title: "Completar: ¿Aceptaste el vuelo alternativo",
      description: "¿Aceptaste el vuelo alternativo que te ofrecieron?",
      priority: 1,
    },
    {
      id: "a2",
      type: "REQUEST_REFUND",
      title: "Solicitar reembolso",
      description: "Puede solicitar el reembolso o la compensación que corresponda a su caso.",
      priority: 1,
    },
  ],
};

interface StubState {
  /** A fact was saved from the report: the re-analysis no longer reports it. */
  pendingAnswered: boolean;
  /** The company is named (and its contacts known) on the report. */
  companyKnown: boolean;
}

async function installBackend(page: Page, state: StubState): Promise<void> {
  await page.route("**/api/intake/interpret", (route) => route.fulfill({ json: interpretPayload }));
  await page.route("**/api/intake/guidance", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/intake/confirm", (route) =>
    route.fulfill({ json: { success: true, decision: "confirmed", contradictionDetected: false } }),
  );
  await page.route("**/api/cases/*/intake", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { factKey?: string };
      state.pendingAnswered = true;
      // Answering the company question is what names the company.
      if (body.factKey === COMPANY_QUESTION.factKey) state.companyKnown = true;
      return route.fulfill({ json: { success: true, decision: "confirmed" } });
    }
    return route.fulfill({
      json: {
        caseId: CASE_ID,
        status: "INTAKE",
        problemKey: "flight-cancel",
        confirmedFacts: [],
        nextQuestion: null,
        allRequiredConfirmed: true,
        factCount: 4,
      },
    });
  });
  await page.route("**/api/cases/*/result", (route) =>
    route.fulfill({
      json: {
        result: buildResult(state.pendingAnswered ? 1 : 3, state.companyKnown),
        answers,
        highlights: HIGHLIGHTS,
        factLabels: FACT_LABELS,
        companyQuestion: state.companyKnown ? null : COMPANY_QUESTION,
      },
    }),
  );
  await page.route("**/api/cases/*/actions", (route) => route.fulfill({ json: { actionPlan } }));
}

/** Walks the flow from the problem description to the report. */
async function reachReport(page: Page): Promise<void> {
  await page.goto("/resolver");
  await page.getByRole("textbox").first().fill("me han cancelado el vuelo de Madrid a Londres");
  await page.getByRole("button", { name: "Analizar" }).click();

  await expect(page.getByText("Completar datos")).toBeVisible({ timeout: 10000 });
  await page.getByText("Completar datos").click();

  // Questionnaire: one question, answered with the suggestion list available.
  await expect(page.getByText("¿De qué aeropuerto salía tu vuelo?")).toBeVisible();
  await expect(page.locator('datalist option[value="MAD — Madrid"]')).toHaveCount(1);
  await page.locator('input[list="answer-suggestions"]').fill("Madrid");
  await page.getByRole("button", { name: "Confirmar" }).click();

  await expect(page.getByRole("button", { name: "Sin documentos" })).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Sin documentos" }).click();

  await expect(page.getByText("Esto es lo que hemos encontrado")).toBeVisible({ timeout: 15000 });
}

test("el informe se organiza por secciones, deja completar los datos y ofrece el PDF", async ({
  page,
}) => {
  const state: StubState = { pendingAnswered: false, companyKnown: true };
  await installBackend(page, state);

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await reachReport(page);

  // ── The report ──────────────────────────────────────────────────
  await expect(page.getByText("Dictamen", { exact: true })).toBeVisible();
  await expect(page.getByText("Datos clave de tu caso", { exact: true })).toBeVisible();
  await expect(page.getByText("249,90 €").first()).toBeVisible();
  await expect(page.getByText("Datos que faltan", { exact: true })).toBeVisible();
  await expect(page.getByText("Lo que hemos podido confirmar", { exact: true })).toBeVisible();
  await expect(page.getByText("Lo que aún no podemos determinar", { exact: true })).toBeVisible();
  await expect(page.getByText("Dónde reclamar", { exact: true })).toBeVisible();
  await expect(page.getByText("Tus respuestas", { exact: true })).toBeVisible();
  await expect(page.getByText("10/08/2026").first()).toBeVisible();
  await expect(page.getByText("Fuentes consultadas", { exact: true })).toBeVisible();

  // ── The company and its customer service ────────────────────────
  await expect(page.getByText("A quién contactar en la empresa", { exact: true })).toBeVisible();
  await expect(page.getByText("Vueling", { exact: true })).toBeVisible();
  await expect(page.getByText("900 645 000")).toBeVisible();
  // Channels are always attributable: date of verification and official source.
  await expect(page.getByText(/Canales verificados el 2026-09-22/)).toBeVisible();
  // The company question is not asked once the company is known.
  await expect(page.getByText("¿Qué aerolínea era?")).toHaveCount(0);

  // What a conclusion is based on, and what each source backs.
  await expect(
    page.getByText("En qué se basa: ¿Cuándo te comunicaron la cancelación?"),
  ).toBeVisible();
  await expect(page.getByText("Cuantía de la compensación por distancia")).toBeVisible();

  const body = await page.locator("body").innerText();
  // Debug aid: `REPORT_TEXT=1 npx playwright test` prints the rendered report.
  if (process.env.REPORT_TEXT) console.log(`\n===== INFORME =====\n${body}\n===== FIN =====\n`);
  // No internal fact keys, no repeated steps.
  expect(body).not.toContain("flight.compensation_tier");
  expect(body).not.toContain("airline.re_routing.accepted");
  expect(body.match(/Solicitar reembolso/g)).toHaveLength(1);

  // ── Completing a pending fact from the report itself ────────────
  await page.getByRole("button", { name: "Sí", exact: true }).first().click();
  await expect(page.getByText("Dato guardado.").first()).toBeVisible({ timeout: 10000 });
  // The report was regenerated: the items the fresh analysis no longer reports
  // as pending are gone from the page.
  await expect(
    page.getByText("No hemos podido calcular este dato con la información disponible."),
  ).toHaveCount(0);

  // ── Download ────────────────────────────────────────────────────
  await expect(page.getByRole("link", { name: /PDF/i })).toHaveAttribute(
    "href",
    `/api/cases/${CASE_ID}/export?format=pdf`,
  );

  expect(errors).toEqual([]);
});

test("si no sabemos contra qué empresa es, el informe la pregunta y la incorpora", async ({
  page,
}) => {
  const state: StubState = { pendingAnswered: false, companyKnown: false };
  await installBackend(page, state);

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await reachReport(page);

  // No company yet: the report says so and asks for it in place.
  await expect(page.getByText("A quién contactar en la empresa", { exact: true })).toBeVisible();
  await expect(page.getByText(/Todavía no sabemos contra qué empresa reclamas/)).toBeVisible();
  const companyInput = page.getByPlaceholder("Escribe el nombre de la empresa");
  await expect(companyInput).toBeVisible();

  await companyInput.fill("Vueling");
  await page.getByRole("button", { name: "Guardar y actualizar el informe" }).click();

  // The report came back with the company named and its official channels.
  await expect(page.getByText("Vueling", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("900 645 000")).toBeVisible();
  await expect(page.getByPlaceholder("Escribe el nombre de la empresa")).toHaveCount(0);

  expect(errors).toEqual([]);
});
