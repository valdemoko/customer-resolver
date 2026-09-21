/**
 * Problem Module: no-delivery-refund (Fase 8.1 — Legal Correction).
 *
 * "Hice una compra, el pedido no llega o no se entrega correctamente
 * y necesito saber qué puedo hacer respecto a la entrega y/o al reembolso."
 *
 * Legal basis (VERIFIED):
 * - TRLGDCU Art. 66 bis — Entrega de bienes, plazos, resolución
 * - TRLGDCU Art. 109 — Ejecución del contrato a distancia
 * - TRLGDCU Art. 110 — Falta de ejecución / indisponibilidad
 * - CC Art. 1124 — Resolución por incumplimiento recíproco
 * - CC Art. 1468 — Obligación de entrega del vendedor
 *
 * IMPORTANT: Art. 112 TRLGDCU is about card payment fraud — NOT used here.
 */
import { defineProblemModule, type ProblemModuleDefinition } from "@core/problems/contract";

export const MODULE_KEY = "no-delivery-refund";
export const MODULE_VERSION = 2; // v2: legal correction

export const noDeliveryRefundModule: ProblemModuleDefinition = defineProblemModule({
  key: MODULE_KEY,
  version: MODULE_VERSION,
  title: "Compras y reembolsos",
  description:
    "Analiza la situación de una persona que realizó una compra y el pedido no llegó " +
    "o no se entregó correctamente, y necesita saber qué puede hacer respecto a la " +
    "entrega y/o al reembolso. El análisis es factual: fechas, plazos, comunicaciones " +
    "y solicitudes. Las conclusiones jurídicas finales pertenecen al Result Engine.",
  jurisdictions: ["ES"],
  locales: ["es-ES"],

  // ── Fact catalogue ──────────────────────────────────────────────
  // Every fact exists because a rule or workflow needs it.
  factCatalogue: [
    // Core transaction
    {
      key: "purchase.date",
      type: "date",
      description: "Fecha en que se realizó la compra o pedido.",
      questionId: "q-purchase-date",
      required: true,
    },
    {
      key: "delivery.promised_date",
      type: "date",
      description:
        "Fecha de entrega prometida o acordada por el vendedor. " +
        "Si no se acordó ninguna fecha, se aplica el plazo legal de 30 días (Art. 66 bis.1).",
      questionId: "q-promised-date",
      required: false,
    },
    {
      key: "delivery.applicable_deadline",
      type: "date",
      description:
        "Fecha límite de entrega aplicable. Si existe fecha acordada, es esa fecha. " +
        "Si no, se calcula como purchase.date + 30 días naturales (Art. 66 bis.1). " +
        "Este fact se calcula automáticamente y no se pregunta al usuario.",
      questionId: "q-applicable-deadline",
      required: false,
    },
    {
      key: "delivery.received",
      type: "boolean",
      description: "¿El producto fue finalmente entregado al consumidor?",
      questionId: "q-received",
      required: true,
    },
    {
      key: "delivery.actual_date",
      type: "date",
      description: "Fecha real de entrega del producto (si se entregó).",
      questionId: "q-actual-date",
      required: false,
    },

    // Purchase details
    {
      key: "purchase.amount",
      type: "money",
      description: "Importe total de la compra.",
      questionId: "q-amount",
      required: true,
    },
    {
      key: "purchase.channel",
      type: "enum",
      description: "Canal de compra: online, tienda física, teléfono.",
      questionId: "q-channel",
      required: true,
      options: ["online", "tienda_fisica", "telefono"],
    },

    // Communication with trader
    {
      key: "communication.contacted_seller",
      type: "boolean",
      description: "¿Has contactado con el vendedor sobre el problema de entrega?",
      questionId: "q-contacted",
      required: true,
    },
    {
      key: "communication.seller_response",
      type: "string",
      description: "Respuesta recibida del vendedor (si la hubo).",
      questionId: "q-seller-response",
      required: false,
    },
    {
      key: "communication.seller_refused_delivery",
      type: "boolean",
      description:
        "¿El vendedor ha rechazado explícitamente entregar los bienes? " +
        "Art. 66 bis.3.a: si el empresario haya rechazado entregar, el consumidor puede resolver inmediatamente.",
      questionId: "q-seller-refused",
      required: false,
    },

    // Additional deadline (Art. 66 bis.2)
    {
      key: "communication.additional_deadline_granted",
      type: "boolean",
      description:
        "¿El consumidor emplazó al vendedor para que cumpla en un plazo adicional adecuado? " +
        "Art. 66 bis.2: el consumidor debe emplazar al empresario antes de resolver.",
      questionId: "q-additional-deadline",
      required: false,
    },
    {
      key: "communication.additional_deadline_days",
      type: "number",
      description: "Número de días del plazo adicional concedido.",
      questionId: "q-deadline-days",
      required: false,
    },
    {
      key: "communication.additional_deadline_expired",
      type: "boolean",
      description: "¿Ha expirado el plazo adicional sin que el vendedor haya entregado?",
      questionId: "q-deadline-expired",
      required: false,
    },

    // Essential date (Art. 66 bis.3.b)
    {
      key: "delivery.essential_date",
      type: "boolean",
      description:
        "¿Las partes acordaron, o se desprende claramente de las circunstancias, " +
        "que era esencial que la entrega se produjera en una fecha determinada o anterior? " +
        "Art. 66 bis.3.b: si es esencial, el consumidor puede resolver inmediatamente.",
      questionId: "q-essential-date",
      required: false,
    },

    // Resolution declaration
    {
      key: "resolution.declared",
      type: "boolean",
      description:
        "¿El consumidor ha declarado que resuelve el contrato? " +
        "Debe distinguirse de: contactar al vendedor, pedir información, " +
        "pedir que entregue el producto, pedir un reembolso.",
      questionId: "q-resolution-declared",
      required: false,
    },
    {
      key: "resolution.date",
      type: "date",
      description: "Fecha en que el consumidor declaró la resolución del contrato.",
      questionId: "q-resolution-date",
      required: false,
    },

    // Refund status
    {
      key: "refund.received",
      type: "boolean",
      description: "¿Se le ha devuelto ya el dinero al consumidor?",
      questionId: "q-refund-received",
      required: false,
    },

    // Product availability (Art. 110)
    {
      key: "product.available",
      type: "boolean",
      description:
        "¿El producto sigue estando disponible para entrega? " +
        "Art. 110: si el bien no está disponible, el empresario debe informar y reembolsar.",
      questionId: "q-product-available",
      required: false,
    },
    {
      key: "trader.informed_unavailability",
      type: "boolean",
      description: "¿El vendedor informó al consumidor de la falta de disponibilidad del bien?",
      questionId: "q-trader-informed",
      required: false,
    },
  ],

  // ── Adaptive intake ─────────────────────────────────────────────
  // Progressive, not all at once. Every question maps to a fact used by a rule.
  intake: [
    // Phase 1: What happened?
    {
      id: "q-purchase-date",
      text: "¿En qué fecha realizaste la compra?",
      type: "date",
      factKey: "purchase.date",
      required: true,
    },
    {
      id: "q-promised-date",
      text: "¿Qué fecha de entrega te prometieron o acordaron?",
      type: "date",
      factKey: "delivery.promised_date",
      required: false,
      // When absent, the 30-day legal default (Art. 66 bis.1) applies.
      // The system computes purchase.date + 30 days as the default
      // promised_date so that Rule 1 (DATE_BEFORE) can evaluate correctly.
    },
    {
      id: "q-received",
      text: "¿El producto ha sido finalmente entregado?",
      type: "boolean",
      factKey: "delivery.received",
      required: true,
    },
    {
      id: "q-actual-date",
      text: "¿En qué fecha se entregó? (si se entregó)",
      type: "date",
      factKey: "delivery.actual_date",
      required: false,
      askIf: [{ factKey: "delivery.received" as never, equals: true }],
    },

    // Phase 2: Purchase details
    {
      id: "q-amount",
      text: "¿Cuánto pagaste en total por la compra?",
      type: "money",
      factKey: "purchase.amount",
      required: true,
    },
    {
      id: "q-channel",
      text: "¿Cómo realizaste la compra?",
      type: "enum",
      factKey: "purchase.channel",
      required: true,
      options: ["online", "tienda_fisica", "telefono"],
    },

    // Phase 3: Communication
    {
      id: "q-contacted",
      text: "¿Has contactado con el vendedor sobre el problema de entrega?",
      type: "boolean",
      factKey: "communication.contacted_seller",
      required: true,
    },
    {
      id: "q-seller-response",
      text: "¿Qué te respondió el vendedor?",
      type: "string",
      factKey: "communication.seller_response",
      required: false,
    },
    {
      id: "q-seller-refused",
      text: "¿El vendedor ha rechazado explícitamente entregar los bienes?",
      type: "boolean",
      factKey: "communication.seller_refused_delivery",
      required: false,
    },

    // Phase 4: Additional deadline (Art. 66 bis.2)
    {
      id: "q-additional-deadline",
      text: "¿Has emplazado al vendedor para que entregue en un plazo adicional?",
      type: "boolean",
      factKey: "communication.additional_deadline_granted",
      required: false,
    },
    {
      id: "q-deadline-days",
      text: "¿Cuántos días de plazo adicional le concediste?",
      type: "number",
      factKey: "communication.additional_deadline_days",
      required: false,
      askIf: [{ factKey: "communication.additional_deadline_granted" as never, equals: true }],
    },
    {
      id: "q-deadline-expired",
      text: "¿Ha expirado ese plazo adicional sin que el vendedor haya entregado?",
      type: "boolean",
      factKey: "communication.additional_deadline_expired",
      required: false,
      askIf: [{ factKey: "communication.additional_deadline_granted" as never, equals: true }],
    },

    // Phase 5: Essential date (Art. 66 bis.3.b)
    {
      id: "q-essential-date",
      text: "¿Era esencial que el producto llegara en una fecha concreta? (por ejemplo, un regalo, un evento, una urgencia)",
      type: "boolean",
      factKey: "delivery.essential_date",
      required: false,
    },

    // Phase 6: Resolution and refund
    {
      id: "q-resolution-declared",
      text: "¿Has declarado formalmente al vendedor que quieres resolver el contrato?",
      type: "boolean",
      factKey: "resolution.declared",
      required: false,
    },
    {
      id: "q-resolution-date",
      text: "¿Cuándo comunicaste al vendedor que querías resolver el contrato?",
      type: "date",
      factKey: "resolution.date",
      required: false,
      askIf: [{ factKey: "resolution.declared" as never, equals: true }],
    },
    {
      id: "q-refund-received",
      text: "¿Se te ha devuelto ya el dinero?",
      type: "boolean",
      factKey: "refund.received",
      required: false,
    },

    // Phase 7: Availability (Art. 110)
    {
      id: "q-product-available",
      text: "¿El producto sigue estando disponible para entrega?",
      type: "boolean",
      factKey: "product.available",
      required: false,
    },
    {
      id: "q-trader-informed",
      text: "¿El vendedor te ha informado de que el producto no está disponible?",
      type: "boolean",
      factKey: "trader.informed_unavailability",
      required: false,
      askIf: [{ factKey: "product.available" as never, equals: false }],
    },
  ],

  // ── Rule keys ───────────────────────────────────────────────────
  ruleKeys: [
    "no-delivery-refund.delivery-deadline-exceeded",
    "no-delivery-refund.resolution-after-additional-deadline",
    "no-delivery-refund.immediate-resolution-refused-or-essential",
    "no-delivery-refund.refund-obligation-after-resolution",
    // DRAFT: requires more nuanced fact gathering
    // "no-delivery-refund.product-unavailability",
  ],

  relatedProblems: ["cancellation-charge"],
});
