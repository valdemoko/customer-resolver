/**
 * End-to-end check of the case report screen.
 *
 * The backend is stubbed so the report can be rendered without a database: what
 * matters here is the screen — conclusions grouped by meaning, pending data that
 * can be answered in place (and then re-analysed), the person's own answers, the
 * official channels and the PDF download.
 */
import { expect, test } from "@playwright/test";

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

function buildResult(pendingCount: number) {
  return {
    overallStatus: "SUPPORTED",
    summary: "Análisis: 2 afirmaciones confirmadas; 1 afirmación sin datos suficientes.",
    claims: [
      {
        id: "claim-0",
        ruleKey: "flight-cancel.notice-period-insufficient",
        status: "SUPPORTED",
        assertion: "El plazo de aviso fue inferior a 14 días antes de la salida",
        explanation: "La aerolínea canceló el vuelo con dos días de antelación.",
        missingFacts: [],
      },
      {
        id: "claim-1",
        ruleKey: "flight-cancel.compensation-amount",
        status: "INSUFFICIENT_DATA",
        assertion: "La cuantía base de compensación según distancia del vuelo",
        explanation: "No podemos determinar la cuantía sin conocer la distancia.",
        missingFacts: ["flight.compensation_tier"],
      },
    ],
    sources: [
      {
        sourceId: "src-eu261-art7",
        title: "Reglamento (CE) 261/2004, art. 7",
        url: "https://eur-lex.europa.eu/eli/reg/2004/261/oj",
        type: "Reglamento",
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
  nextStep: "Faltan 2 datos para poder concluir. Empieza por: ¿Aceptaste el vuelo alternativo? (y 1 más)",
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

test("el informe se organiza por secciones, deja completar los datos y ofrece el PDF", async ({
  page,
}) => {
  let answeredPending = false;

  await page.route("**/api/intake/interpret", (route) =>
    route.fulfill({ json: interpretPayload }),
  );
  await page.route("**/api/intake/guidance", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/intake/confirm", (route) =>
    route.fulfill({ json: { success: true, decision: "confirmed", contradictionDetected: false } }),
  );
  await page.route("**/api/cases/*/intake", async (route) => {
    if (route.request().method() === "POST") {
      answeredPending = true;
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
        // After completing a pending fact the analysis is re-run: the report must
        // come back updated, with that datum no longer pending.
        result: buildResult(answeredPending ? 1 : 3),
        answers,
      },
    }),
  );
  await page.route("**/api/cases/*/actions", (route) => route.fulfill({ json: { actionPlan } }));

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

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

  // ── The report ──────────────────────────────────────────────────
  await expect(page.getByText("Esto es lo que hemos encontrado")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Dictamen", { exact: true })).toBeVisible();
  await expect(page.getByText("Datos que faltan", { exact: true })).toBeVisible();
  await expect(page.getByText("Lo que hemos podido confirmar", { exact: true })).toBeVisible();
  await expect(page.getByText("Lo que aún no podemos determinar", { exact: true })).toBeVisible();
  await expect(page.getByText("Dónde reclamar", { exact: true })).toBeVisible();
  await expect(page.getByText("Tus respuestas", { exact: true })).toBeVisible();
  await expect(page.getByText("10/08/2026").first()).toBeVisible();
  await expect(page.getByText("Fuentes consultadas", { exact: true })).toBeVisible();

  const body = await page.locator("body").innerText();
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
