/**
 * Problem Module: cancellation-charge (Fase 4).
 *
 * "Cancelé un servicio y me han cobrado después. ¿Qué hago?"
 *
 * This module owns ALL problem-specific knowledge: fact catalogue, intake,
 * rule keys, jurisdictions. The core knows nothing about it. Facts exist only
 * if a rule or workflow requirement justifies them (docs prompt §6).
 */
import { defineProblemModule, type ProblemModuleDefinition } from "@core/problems/contract";

export const MODULE_KEY = "cancellation-charge";
export const MODULE_VERSION = 1;

export const cancellationChargeModule: ProblemModuleDefinition = defineProblemModule({
  key: MODULE_KEY,
  version: MODULE_VERSION,
  title: "Cobro después de cancelar un servicio",
  description:
    "Analiza la situación de una persona que canceló un servicio (telecom, suscripción, etc.) " +
    "y posteriormente recibió un cargo. El análisis es factual: fechas, importes y " +
    "existencia de compromiso de permanencia. Las conclusiones jurídicas finales " +
    "pertenecen al Result Engine (Fase 7) — este módulo solo produce evaluaciones estructuradas.",
  jurisdictions: ["ES"],
  locales: ["es-ES"],

  // Every fact exists because a rule (rules.ts) or the workflow needs it.
  factCatalogue: [
    {
      key: "service.contract_start_date",
      type: "date",
      description:
        "Fecha de inicio de vigencia del contrato (rule: contract-duration-over-24-months — Ley 11/2022 art. 67.7).",
      questionId: "q-contract-start",
      required: false,
    },
    {
      key: "cancellation.date",
      type: "date",
      description:
        "Fecha (calendario) en que el usuario solicitó la cancelación/rescisión del servicio.",
      questionId: "q-cancellation-date",
      required: true,
    },
    {
      key: "charge.date",
      type: "date",
      description:
        "Fecha del cargo cuestionado (rules: charge-after-cancellation, charge-after-penalty-free-rescission).",
      questionId: "q-charge-date",
      required: true,
    },
    {
      key: "charge.amount",
      type: "money",
      description:
        "Importe del cargo cuestionado (workflow requirement: toda evaluación de un problema de cobro necesita el importe).",
      questionId: "q-charge-amount",
      required: true,
    },
    {
      key: "contract.commitment_exists",
      type: "boolean",
      description: "¿El contrato incluía compromiso de permanencia conocido por el usuario?",
      questionId: "q-commitment",
      required: false,
    },
    {
      key: "cancellation.confirmation_exists",
      type: "boolean",
      description: "¿El usuario tiene confirmación de la cancelación?",
      questionId: "q-confirmation",
      required: false,
    },
  ],

  // Adaptive intake: confirmation only asked when relevant (skip logic via askIf).
  intake: [
    {
      id: "q-contract-start",
      text: "¿En qué fecha iniciaste el contrato con el proveedor? (aproximada si no la recuerdas con exactitud)",
      type: "date",
      factKey: "service.contract_start_date",
      required: false,
    },
    {
      id: "q-cancellation-date",
      text: "¿En qué fecha solicitaste la cancelación del servicio?",
      type: "date",
      factKey: "cancellation.date",
      required: true,
    },
    {
      id: "q-charge-date",
      text: "¿En qué fecha te han cobrado el cargo?",
      type: "date",
      factKey: "charge.date",
      required: true,
    },
    {
      id: "q-charge-amount",
      text: "¿De cuánto es el importe cobrado?",
      type: "money",
      factKey: "charge.amount",
      required: true,
    },
    {
      id: "q-commitment",
      text: "¿Tu contrato incluía algún compromiso de permanencia que conocieras?",
      type: "boolean",
      factKey: "contract.commitment_exists",
      required: false,
    },
    {
      id: "q-confirmation",
      text: "¿Tienes algún documento o mensaje que confirme la cancelación?",
      type: "boolean",
      factKey: "cancellation.confirmation_exists",
      required: false,
      // Only meaningful to explore when the user says there was NO commitment:
      // with a commitment the confirmation matters less for the first factual rules.
      askIf: [{ factKey: "contract.commitment_exists", equals: false }],
    },
  ],

  ruleKeys: [
    "cancellation-charge.charge-after-cancellation",
    "cancellation-charge.contract-duration-over-24-months",
    "cancellation-charge.charge-after-penalty-free-rescission",
  ],

  relatedProblems: [],
});
