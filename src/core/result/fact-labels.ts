/**
 * Human wording for facts that are not answered by an intake question.
 *
 * Why this exists: `buildMissingInformation` describes a missing fact with the
 * intake question that collects it. For a *derived* fact whose inputs were
 * answered but whose computation failed (e.g. the airports could not be
 * resolved, so no distance ⇒ no compensation tier), there is no question to
 * reuse. Falling back to the raw key (`flight.compensation_tier`) told the user
 * nothing; falling back to the catalogue description repeated the module's
 * internal jargon.
 *
 * So every such fact gets an explicit, actionable explanation here: what we
 * could not compute, and what the user can do about it. PURE data — no I/O.
 */

/** Facts derived by the analysis whose inputs are answered but unreadable. */
export const DERIVED_FACT_HINTS: Readonly<Record<string, string>> = {
  "flight.distance_km":
    "No hemos podido calcular la distancia del vuelo. Revisa los aeropuertos: usa su código IATA (por ejemplo MAD para Madrid, BCN para Barcelona) o una ciudad conocida.",
  "flight.compensation_tier":
    "No hemos podido calcular el importe de la compensación porque no reconocemos los aeropuertos del vuelo. Corrige el aeropuerto de salida o de llegada con su código IATA (MAD, BCN, PMI…) y volveremos a calcularlo.",
  "cancellation.notice_days":
    "No hemos podido calcular los días de antelación del aviso. Revisa la fecha programada del vuelo y la fecha en que te comunicaron la cancelación.",
  "compliance.responsibility_deadline":
    "No hemos podido calcular el plazo de responsabilidad del vendedor. Necesitamos la fecha de entrega del producto.",
  "compliance.presumption_deadline":
    "No hemos podido calcular el plazo de presunción de falta de conformidad. Necesitamos la fecha de entrega del producto.",
  "compliance.after_repair_deadline":
    "No hemos podido calcular el plazo posterior a la reparación. Necesitamos la fecha de entrega tras la reparación.",
  "delivery.applicable_deadline":
    "No hemos podido calcular el plazo de entrega aplicable. Necesitamos la fecha de compra o la fecha de entrega prometida.",
  "passenger.compensation_reduction_eligible":
    "No hemos podido determinar si procede la reducción del 50% de la compensación. Necesitamos saber si aceptaste el vuelo alternativo y cuánto se retrasó su llegada.",
};

/** Last-resort wording. Never a raw key, never a silent gap. */
export const GENERIC_MISSING_HINT =
  "Este dato es necesario para completar la evaluación, pero el sistema no puede calcularlo por sí solo. Revisa los datos que ya indicaste.";
