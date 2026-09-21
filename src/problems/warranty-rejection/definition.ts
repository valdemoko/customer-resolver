/**
 * Problem Module: warranty-rejection (Fase 8.2).
 *
 * "Me han rechazado la garantía. ¿Puedo reclamar?"
 *
 * Legal basis (VERIFIED per F8.2 Legal Specification):
 * - TRLGDCU Arts. 114-125 — Conformity regime for consumer goods
 * - TRLGDCU Art. 118 — Putting into conformity (repair/replacement)
 * - TRLGDCU Art. 119 — Price reduction and contract resolution
 * - TRLGDCU Art. 120 — Time limits for manifesting non-conformity
 * - TRLGDCU Art. 121 — Burden of proof (2-year presumption)
 * - TRLGDCU Art. 122 — Suspension of time limits + post-repair period
 * - TRLGDCU Art. 124 — Prescription of action (5 years)
 * - TRLGDCU Art. 125 — Action against manufacturer
 * - EU Directive 2019/771 — Sale of goods conformity
 *
 * IMPORTANT: Art. 116 TRLGDCU — incompatibility of actions (TRLGDCU vs. CC).
 * Consumer goods conformidad regime REPLACES CC Arts. 1484-1497.
 *
 * "Garantía rechazada" is NOT a legal concept in the TRLGDCU.
 * It is decomposed into factual components for rule evaluation.
 */
import { defineProblemModule, type ProblemModuleDefinition } from "@core/problems/contract";

export const MODULE_KEY = "warranty-rejection";
export const MODULE_VERSION = 1;

export const warrantyRejectionModule: ProblemModuleDefinition = defineProblemModule({
  key: MODULE_KEY,
  version: MODULE_VERSION,
  title: "Garantía rechazada",
  description:
    "El vendedor ha rechazado tu solicitud relacionada con una falta de conformidad. " +
    "Analizamos qué ha ocurrido, qué información falta y qué vías de actuación " +
    "pueden estar disponibles. El análisis es factual: fechas, plazos, respuestas " +
    "del vendedor y documentación. Las conclusiones jurídicas finales pertenecen " +
    "al Result Engine.",
  jurisdictions: ["ES"],
  locales: ["es-ES"],

  // ── Fact catalogue ──────────────────────────────────────────────
  // Facts are organized into Required / Optional / Derived / Evidence-only.
  // Only 3 facts are required — the intake is conversational, not a form.
  factCatalogue: [
    // ── Required facts (minimum viable set) ───────────────────────
    {
      key: "nonconformity.description",
      type: "string",
      description:
        "Descripción del consumidor sobre la supuesta falta de conformidad " +
        "(defecto, malfunction, etc.). Texto libre.",
      questionId: "q-defect-description",
      required: true,
    },
    {
      key: "seller.response_received",
      type: "boolean",
      description:
        "¿El consumidor ha recibido alguna respuesta del vendedor sobre " +
        "la reclamación de garantía?",
      questionId: "q-seller-responded",
      required: true,
    },
    {
      key: "seller.rejection",
      type: "boolean",
      description:
        "¿El vendedor se ha negado explícitamente a proporcionar una " +
        "medida correctora (reparación, sustitución u otra) para la " +
        "supuesta falta de conformidad? Solo verdadero cuando existe " +
        "una comunicación clara de rechazo.",
      questionId: "q-seller-rejected",
      required: true,
    },

    // ── Optional facts — Purchase ─────────────────────────────────
    {
      key: "purchase.delivery_date",
      type: "date",
      description:
        "Fecha de entrega del producto al consumidor. Por defecto se presume " +
        "la fecha de factura o albarán (Art. 123.1). Requerida para reglas " +
        "temporales.",
      questionId: "q-delivery-date",
      required: false,
    },
    {
      key: "purchase.amount",
      type: "money",
      description: "Importe pagado por el producto.",
      questionId: "q-amount",
      required: false,
    },
    {
      key: "purchase.channel",
      type: "enum",
      description: "Canal de compra: online, tienda física, teléfono.",
      questionId: "q-channel",
      required: false,
      options: ["online", "tienda_fisica", "telefono"],
    },
    {
      key: "purchase.invoice_available",
      type: "boolean",
      description: "¿El consumidor dispone de factura o justificante de compra?",
      questionId: "q-invoice",
      required: false,
    },

    // ── Optional facts — Product ──────────────────────────────────
    {
      key: "product.type",
      type: "string",
      description:
        "Descripción o categoría del producto (texto libre, no enum — " +
        "la entrada conversacional no debe forzar categorización prematura).",
      questionId: "q-product-type",
      required: false,
    },
    {
      key: "product.is_used",
      type: "boolean",
      description:
        "¿El producto es de segunda mano o reacondicionado? " +
        "Relevante para los plazos (Art. 120.1).",
      questionId: "q-is-used",
      required: false,
    },
    {
      key: "product.age_at_purchase_months",
      type: "number",
      description:
        "Edad del producto en meses en el momento de la compra (solo para productos usados).",
      questionId: "q-product-age",
      required: false,
    },

    // ── Optional facts — Seller response ──────────────────────────
    {
      key: "seller.rejection_reason",
      type: "string",
      description:
        "Motivo declarado por el vendedor para el rechazo (texto libre).",
      questionId: "q-rejection-reason",
      required: false,
    },
    {
      key: "seller.rejection_date",
      type: "date",
      description:
        "Fecha en que el vendedor comunicó el rechazo.",
      questionId: "q-rejection-date",
      required: false,
    },
    {
      key: "seller.refused_repair",
      type: "boolean",
      description:
        "¿El vendedor se ha negado explícitamente a reparar?",
      questionId: "q-refused-repair",
      required: false,
    },
    {
      key: "seller.refused_replacement",
      type: "boolean",
      description:
        "¿El vendedor se ha negado explícitamente a sustituir el producto?",
      questionId: "q-refused-replacement",
      required: false,
    },
    {
      key: "seller.offered_repair",
      type: "boolean",
      description:
        "¿El vendedor ha ofrecido reparación como medida correctora?",
      questionId: "q-offered-repair",
      required: false,
    },
    {
      key: "seller.offered_replacement",
      type: "boolean",
      description:
        "¿El vendedor ha ofrecido sustitución como medida correctora?",
      questionId: "q-offered-replacement",
      required: false,
    },
    {
      key: "seller.claimed_misuse",
      type: "boolean",
      description:
        "¿El vendedor ha alegado uso indebido del producto como causa?",
      questionId: "q-claimed-misuse",
      required: false,
    },
    {
      key: "seller.claimed_external_damage",
      type: "boolean",
      description:
        "¿El vendedor ha alegado daño externo (no defecto de fabricación)?",
      questionId: "q-claimed-external",
      required: false,
    },
    {
      key: "seller.claimed_warranty_expired",
      type: "boolean",
      description:
        "¿El vendedor ha alegado que el plazo de garantía ha expirado?",
      questionId: "q-claimed-expired",
      required: false,
    },
    {
      key: "seller.claimed_wear_and_tear",
      type: "boolean",
      description:
        "¿El vendedor ha alegado desgaste normal por uso?",
      questionId: "q-claimed-wear",
      required: false,
    },
    {
      key: "seller.technical_report_available",
      type: "boolean",
      description:
        "¿El vendedor dispone de un informe técnico que respalda el rechazo?",
      questionId: "q-technical-report",
      required: false,
    },
    {
      key: "seller.declared_wont_repair",
      type: "boolean",
      description:
        "¿El vendedor ha declarado que no va a reparar el producto? " +
        "Art. 119.f TRLGDCU.",
      questionId: "q-declared-wont-repair",
      required: false,
    },

    // ── Optional facts — Repair history ───────────────────────────
    {
      key: "repair.requested",
      type: "boolean",
      description:
        "¿El consumidor ha solicitado reparación al vendedor?",
      questionId: "q-repair-requested",
      required: false,
    },
    {
      key: "repair.completed",
      type: "boolean",
      description:
        "¿El vendedor ha completado una reparación?",
      questionId: "q-repair-completed",
      required: false,
    },
    {
      key: "repair.delivery_date",
      type: "date",
      description:
        "Fecha en que el producto reparado fue devuelto al consumidor. " +
        "Art. 122.3: 1 año de presunción adicional.",
      questionId: "q-repair-return-date",
      required: false,
    },
    {
      key: "repair.failed",
      type: "boolean",
      description:
        "¿La reparación falló (el producto no fue restaurado a conformidad)?",
      questionId: "q-repair-failed",
      required: false,
    },
    {
      key: "repair.defect_recurred",
      type: "boolean",
      description:
        "¿El mismo defecto (mismo origen) reapareció después de la reparación? " +
        "Art. 119.d, 122.3.",
      questionId: "q-defect-recurred",
      required: false,
    },
    {
      key: "repair.defect_different",
      type: "boolean",
      description:
        "¿Apareció un defecto DIFERENTE después de la reparación?",
      questionId: "q-different-defect",
      required: false,
    },
    {
      key: "repair.within_reasonable_time",
      type: "boolean",
      description:
        "¿La reparación se completó en un plazo razonable? Art. 118.4.b.",
      questionId: "q-repair-reasonable-time",
      required: false,
    },

    // ── Optional facts — Replacement ──────────────────────────────
    {
      key: "replacement.completed",
      type: "boolean",
      description:
        "¿El vendedor ha completado una sustitución del producto?",
      questionId: "q-replacement-completed",
      required: false,
    },
    {
      key: "replacement.delivery_date",
      type: "date",
      description:
        "Fecha en que el producto sustituido fue entregado.",
      questionId: "q-replacement-date",
      required: false,
    },

    // ── Optional facts — Commercial warranty ──────────────────────
    {
      key: "commercial_warranty.exists",
      type: "boolean",
      description:
        "¿Existe un documento de garantía comercial separada?",
      questionId: "q-commercial-warranty",
      required: false,
    },
    {
      key: "commercial_warranty.guarantor",
      type: "string",
      description:
        "¿Quién es el garante de la garantía comercial (fabricante, vendedor, tercero)?",
      questionId: "q-guarantor",
      required: false,
    },
    {
      key: "commercial_warranty.period_months",
      type: "number",
      description:
        "Duración de la garantía comercial en meses.",
      questionId: "q-warranty-period",
      required: false,
    },
    {
      key: "commercial_warranty.expired",
      type: "boolean",
      description:
        "¿Ha expirado el plazo de la garantía comercial?",
      questionId: "q-warranty-expired",
      required: false,
    },

    // ── Optional facts — Consumer action ──────────────────────────
    {
      key: "consumer.notified_seller",
      type: "boolean",
      description:
        "¿El consumidor ha notificado formalmente al vendedor la falta de conformidad?",
      questionId: "q-notified-seller",
      required: false,
    },
    {
      key: "consumer.notification_date",
      type: "date",
      description:
        "Fecha en que el consumidor notificó al vendedor. " +
        "Art. 122: inicia la suspensión de plazos.",
      questionId: "q-notification-date",
      required: false,
    },
    {
      key: "consumer.resolution_declared",
      type: "boolean",
      description:
        "¿El consumidor ha declarado la resolución del contrato al vendedor?",
      questionId: "q-resolution-declared",
      required: false,
    },

    // ── Derived facts (computed, never collected) ─────────────────
    {
      key: "compliance.current_date",
      type: "date",
      description:
        "Fecha actual del sistema (derivada de context.currentDate). " +
        "No se pregunta al usuario.",
      required: false,
    },
    {
      key: "compliance.responsibility_deadline",
      type: "date",
      description:
        "Fecha límite de responsabilidad: delivery_date + 36 meses (o plazo acordado para segunda mano, mínimo 12 meses). " +
        "Art. 120.1 TRLGDCU.",
      required: false,
    },
    {
      key: "compliance.presumption_deadline",
      type: "date",
      description:
        "Fecha límite de presunción: delivery_date + 24 meses (o plazo acordado, mínimo 12 meses). " +
        "Art. 121.1 TRLGDCU.",
      required: false,
    },
    {
      key: "compliance.after_repair_deadline",
      type: "date",
      description:
        "Fecha límite post-reparación: repair.delivery_date + 12 meses. " +
        "Art. 122.3 TRLGDCU. Solo se computa si repair.completed = true.",
      required: false,
    },
  ],

  // ── Adaptive intake ─────────────────────────────────────────────
  // Conversational, not a rigid form. Phase 1 asks minimal questions.
  intake: [
    // Phase 1: What happened?
    {
      id: "q-defect-description",
      text: "¿Qué problema tiene el producto? Descríbelo con tus propias palabras.",
      type: "string",
      factKey: "nonconformity.description",
      required: true,
    },
    {
      id: "q-seller-responded",
      text: "¿Has contactado con el vendedor y has recibido alguna respuesta?",
      type: "boolean",
      factKey: "seller.response_received",
      required: true,
    },
    {
      id: "q-seller-rejected",
      text: "¿El vendedor se ha negado a reparar, sustituir o dar alguna solución?",
      type: "boolean",
      factKey: "seller.rejection",
      required: true,
    },

    // Phase 2: Seller response details (conditional)
    {
      id: "q-rejection-reason",
      text: "¿Cuál fue el motivo que dio el vendedor para el rechazo?",
      type: "string",
      factKey: "seller.rejection_reason",
      required: false,
      askIf: [{ factKey: "seller.rejection" as never, equals: true }],
    },
    {
      id: "q-offered-repair",
      text: "¿El vendedor te ofreció reparar el producto?",
      type: "boolean",
      factKey: "seller.offered_repair",
      required: false,
      askIf: [{ factKey: "seller.response_received" as never, equals: true }],
    },
    {
      id: "q-offered-replacement",
      text: "¿El vendedor te ofreció sustituir el producto?",
      type: "boolean",
      factKey: "seller.offered_replacement",
      required: false,
      askIf: [{ factKey: "seller.response_received" as never, equals: true }],
    },
    {
      id: "q-claimed-misuse",
      text: "¿El vendedor dijo que el problema es por un uso indebido?",
      type: "boolean",
      factKey: "seller.claimed_misuse",
      required: false,
      askIf: [{ factKey: "seller.rejection" as never, equals: true }],
    },
    {
      id: "q-claimed-external",
      text: "¿El vendedor dijo que es un daño externo?",
      type: "boolean",
      factKey: "seller.claimed_external_damage",
      required: false,
      askIf: [{ factKey: "seller.rejection" as never, equals: true }],
    },
    {
      id: "q-claimed-expired",
      text: "¿El vendedor dijo que la garantía ya ha expirado?",
      type: "boolean",
      factKey: "seller.claimed_warranty_expired",
      required: false,
      askIf: [{ factKey: "seller.rejection" as never, equals: true }],
    },
    {
      id: "q-claimed-wear",
      text: "¿El vendedor dijo que es desgaste normal?",
      type: "boolean",
      factKey: "seller.claimed_wear_and_tear",
      required: false,
      askIf: [{ factKey: "seller.rejection" as never, equals: true }],
    },
    {
      id: "q-declared-wont-repair",
      text: "¿El vendedor dijo que no va a reparar el producto?",
      type: "boolean",
      factKey: "seller.declared_wont_repair",
      required: false,
      askIf: [{ factKey: "seller.rejection" as never, equals: true }],
    },

    // Phase 3: Purchase details (asked when needed for time analysis)
    {
      id: "q-delivery-date",
      text: "¿Cuándo recibiste el producto? Si tienes factura, la fecha de entrega suele aparecer ahí.",
      type: "date",
      factKey: "purchase.delivery_date",
      required: false,
    },
    {
      id: "q-is-used",
      text: "¿Es un producto de segunda mano o reacondicionado?",
      type: "boolean",
      factKey: "product.is_used",
      required: false,
    },
    {
      id: "q-amount",
      text: "¿Cuánto pagaste por el producto?",
      type: "money",
      factKey: "purchase.amount",
      required: false,
    },

    // Phase 4: Repair history
    {
      id: "q-repair-completed",
      text: "¿El vendedor ha reparado ya el producto alguna vez?",
      type: "boolean",
      factKey: "repair.completed",
      required: false,
    },
    {
      id: "q-repair-return-date",
      text: "¿Cuándo te devolvieron el producto reparado?",
      type: "date",
      factKey: "repair.delivery_date",
      required: false,
      askIf: [{ factKey: "repair.completed" as never, equals: true }],
    },
    {
      id: "q-repair-failed",
      text: "¿La reparación falló? ¿El producto sigue con el mismo problema?",
      type: "boolean",
      factKey: "repair.failed",
      required: false,
      askIf: [{ factKey: "repair.completed" as never, equals: true }],
    },
    {
      id: "q-defect-recurred",
      text: "¿Después de la reparación, el mismo problema volvió a aparecer?",
      type: "boolean",
      factKey: "repair.defect_recurred",
      required: false,
      askIf: [{ factKey: "repair.completed" as never, equals: true }],
    },

    // Phase 5: Additional context
    {
      id: "q-commercial-warranty",
      text: "¿Tienes un documento de garantía comercial del fabricante o tienda?",
      type: "boolean",
      factKey: "commercial_warranty.exists",
      required: false,
    },
  ],

  // ── Rule keys ───────────────────────────────────────────────────
  ruleKeys: [
    "warranty-rejection.seller-rejected-within-period",
    "warranty-rejection.presumption-applies",
    "warranty-rejection.no-remedy-offered",
    "warranty-rejection.repair-failed-or-defect-recurred",
    "warranty-rejection.seller-claims-expired",
    "warranty-rejection.seller-declares-wont-repair",
  ],

  relatedProblems: ["no-delivery-refund", "cancellation-charge"],
});
