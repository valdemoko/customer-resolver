/**
 * Problem Catalogue — single source of truth for public surface.
 *
 * Consumed by: homepage, SearchBar, /problemas, /problemas/[slug],
 * sitemap, and tests.
 *
 * Each entry maps a problem module to its public-facing representation.
 * The slug is the URL-safe identifier used in /problemas/[slug].
 */

export interface ProblemCatalogueEntry {
  /** Unique problem key (matches module key) */
  readonly key: string;
  /** URL slug for public pages */
  readonly slug: string;
  /** Public display title */
  readonly title: string;
  /** Short description for cards and metadata */
  readonly description: string;
  /** Category for grouping */
  readonly category: string;
  /** Whether a deterministic resolver exists */
  readonly available: boolean;
  /** Keywords for local search (SearchBar) */
  readonly keywords: readonly string[];
  /** Legal basis (abbreviated) */
  readonly legalBasis: readonly string[];
  /** What information the module needs (for landing pages) */
  readonly whatWeAnalyze: readonly string[];
  /** What the result includes */
  readonly whatYouGet: readonly string[];
  /** What the module cannot determine */
  readonly limitations: readonly string[];
  /** ISO date on which the public content of this entry was last reviewed. */
  readonly updatedAt: string;
  /** Other problem pages a reader of this one may also need. */
  readonly relatedSlugs: readonly string[];
  /** How to claim, in the order the steps have to happen. */
  readonly steps: readonly string[];
  /**
   * Worked example. Every outcome line is derived from the module's own rules
   * and the source text they cite — no invented amounts or deadlines.
   */
  readonly example: {
    readonly scenario: string;
    readonly outcome: readonly string[];
  };
  /** Questions the questionnaire itself raises, answered from the sources. */
  readonly faq: readonly {
    readonly question: string;
    readonly answer: string;
  }[];
  /** "Saber más" detailed information */
  readonly saberMas: {
    /** Key facts that matter for this problem */
    readonly keyFacts: readonly string[];
    /** Important dates to preserve */
    readonly importantDates: readonly string[];
    /** Useful evidence types */
    readonly evidenceTypes: readonly string[];
    /** Common mistakes users make */
    readonly commonMistakes: readonly string[];
    /** What Resolveo verifies */
    readonly whatWeVerify: readonly string[];
    /** What cannot be determined */
    readonly whatCannotBeDetermined: readonly string[];
  };
}

export const PROBLEM_CATALOGUE: readonly ProblemCatalogueEntry[] = [
  {
    key: "cancellation-charge",
    slug: "cancelacion-cargo-posterior",
    title: "Cancelación y cargo posterior",
    description:
      "Cancelaste un servicio y te han cobrado después. Analizamos las fechas, el contrato y la normativa aplicable.",
    category: "Pagos y facturas",
    available: true,
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
    legalBasis: [
      "TRLGDCU Art. 97 — Información precontractual",
      "TRLGDCU Art. 109 — Ejecución del contrato a distancia",
      "CC Art. 1124 — Resolución por incumplimiento",
    ],
    whatWeAnalyze: [
      "Fecha de cancelación del servicio",
      "Fecha y cuantía del cargo recibido",
      "Existencia de compromiso de permanencia",
      "Confirmación de la cancelación",
    ],
    whatYouGet: [
      "Evaluación de si el cargo es conforme a derecho",
      "Reglas aplicables con trazabilidad a fuentes",
      "Acciones recomendadas concretas",
    ],
    limitations: [
      "No sustituye asesoría legal profesional",
      "No resuelve litigios judiciales",
      "Se basa en la información que proporcionas",
    ],
    saberMas: {
      keyFacts: [
        "Fecha exacta en que solicitaste la cancelación (no la fecha efectiva)",
        "Fecha y cuantía del cargo recibido después de la cancelación", 
        "Si existía compromiso de permanencia en el contrato",
        "Si dispones de confirmación escrita de la cancelación",
      ],
      importantDates: [
        "Fecha de solicitud de cancelación — marca el inicio del plazo",
        "Fecha del cargo posterior — determina si está dentro del plazo de reclamación",
        "Fecha de inicio del contrato — relevante para compromisos de permanencia",
      ],
      evidenceTypes: [
        "Confirmación de cancelación (email, SMS, documento)",
        "Contrato o condiciones del servicio",
        "Factura o extracto con el cargo", 
        "Comunicaciones con el proveedor",
      ],
      commonMistakes: [
        "Confundir la fecha de solicitud de cancelación con la fecha de efectividad",
        "No conservar la confirmación de cancelación",
        "No revisar si el contrato tenía compromiso de permanencia",
        "Presentar reclamación sin documentar primero el cargo",
      ],
      whatWeVerify: [
        "Si el cargo es conforme a la normativa vigente",
        "Si existía compromiso de permanencia y si era legal",
        "Si la cancelación fue correctamente notificada",
        "Si el plazo de reclamación sigue abierto",
      ],
      whatCannotBeDetermined: [
        "Si el proveedor aceptará la reclamación sin recurso",
        "Si hay cláusulas específicas en tu contrato que puedan afectar",
        "Si existen reclamaciones previas del mismo tipo",
      ],
    },
    updatedAt: "2026-09-22",
    relatedSlugs: ["pedido-no-llega", "garantia-rechazada"],
    steps: [
      "Reúne las dos fechas que deciden el caso: cuándo pediste la cancelación y cuándo se te cobró. Lo que cuenta es la fecha de la solicitud, no la de efectos.",
      "Conserva la confirmación de la baja (correo, SMS o número de referencia). Si no la tienes, pide por escrito el histórico de gestiones.",
      "Reclama al proveedor por su canal oficial: pide la devolución del cargo y la razón concreta del cobro. Añade la fecha de inicio del contrato, porque de ahí depende si la vigencia superaba los 24 meses.",
      "Si el contrato se había prorrogado automáticamente, el art. 67.7 de la Ley 11/2022 reconoce el derecho a rescindirlo en cualquier momento con un preaviso máximo de un mes sin coste, salvo el servicio recibido durante ese preaviso.",
      "Si el proveedor mantiene el cargo, pide la hoja de reclamaciones y presenta reclamación ante la autoridad de consumo de tu comunidad. En servicios de telecomunicaciones puedes acudir además a la Oficina de Atención al Usuario de Telecomunicaciones (SETELECO).",
    ],
    example: {
      scenario:
        "Contrato de fibra con compromiso de 18 meses firmado el 2 de enero de 2025. Pides la baja el 10 de junio de 2026 y la operadora te cobra 90 EUR en la factura del 1 de julio por «baja anticipada».",
      outcome: [
        "La fecha del cargo es posterior a la fecha de baja que declaras: la regla de cargo posterior a la cancelación se cumple.",
        "Si conservas la confirmación de la baja, el informe lo registra como cargo posterior a una cancelación confirmada, lo que refuerza la reclamación.",
        "El compromiso pactado no superaba los 24 meses, así que el contrato no entraba en el supuesto de vigencia excesiva del art. 67.7 de la Ley 11/2022.",
        "El informe no concluye por sí solo que el cargo sea ilegal. Si el cobro se apoya en una penalización por ejercer un desistimiento, la referencia aplicable es el art. 102.2 del TRLGDCU, que declara nulas esas cláusulas; ese supuesto exige revisión caso a caso y el sistema lo declara en lugar de darlo por hecho.",
      ],
    },
    faq: [
      {
        question: "¿Por qué me cobran después de haber cancelado?",
        answer:
          "Las causas habituales son una supuesta permanencia, un preaviso insuficiente o una facturación desfasada. El análisis pide las dos fechas precisamente para distinguir si el cobro corresponde al periodo de preaviso o a un periodo en el que el contrato ya había terminado.",
      },
      {
        question: "Me han cobrado la permanencia por irme antes, ¿es legal?",
        answer:
          "Depende del caso y de cómo se contrató, y son dos supuestos distintos que no conviene mezclar. La Ley 11/2022 (art. 67.7) limita la vigencia del contrato a 24 meses y, tras la prórroga automática, reconoce el derecho a rescindir en cualquier momento con un preaviso máximo de un mes sin coste. Para las penalizaciones cobradas por ejercer un desistimiento, el art. 102.2 del TRLGDCU declara nulas esas cláusulas.",
      },
      {
        question: "¿Qué documentos necesito?",
        answer:
          "La confirmación de la baja (o prueba de la solicitud) y la factura con el cargo. Con esas dos fechas el análisis puede situar el cobro respecto a la cancelación.",
      },
      {
        question: "¿Cuánto puedo reclamar?",
        answer:
          "La devolución del importe cobrado después de la cancelación. El sistema no calcula indemnizaciones adicionales para este supuesto porque ninguna fuente oficial las cuantifica; si tienes gastos accesorios, se documentan aparte.",
      },
      {
        question: "El contrato era de dos años o más, ¿cambia algo?",
        answer:
          "Sí. Entonces entra en juego el otro supuesto: si la diferencia entre las fechas del contrato supera los 24 meses, el análisis lo comprueba contra el límite de vigencia del art. 67.7 de la Ley 11/2022.",
      },
    ],
  },
  {
    key: "no-delivery-refund",
    slug: "pedido-no-llega",
    title: "Pedido no llega o no se reembolsa",
    description:
      "Realizaste un pedido que no llegó o no se entregó correctamente y necesitas saber qué puedes hacer.",
    category: "Compras",
    available: true,
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
    legalBasis: [
      "TRLGDCU Art. 66 bis — Entrega de bienes y plazos",
      "TRLGDCU Art. 109 — Ejecución del contrato a distancia",
      "CC Art. 1124 — Resolución por incumplimiento recíproco",
    ],
    whatWeAnalyze: [
      "Fecha de compra y fecha prometida de entrega",
      "Si el producto fue finalmente entregado",
      "Comunicaciones con el vendedor",
      "Plazos adicionales concedidos",
      "Declaración de resolución del contrato",
    ],
    whatYouGet: [
      "Evaluación de plazos de entrega conforme a normativa",
      "Determinación de si procede la resolución",
      "Obligación de reembolso del vendedor",
      "Acciones recomendadas concretas",
    ],
    limitations: [
      "No sustituye asesoría legal profesional",
      "No puede ejecutar resoluciones judiciales",
      "Requiere información veraz del consumidor",
    ],
    saberMas: {
      keyFacts: [
        "Fecha de compra del producto",
        "Fecha de entrega efectiva (no la de compra)",
        "Si has comunicado la falta de conformidad al vendedor",
        "Si el vendedor ha respondido y cómo",
      ],
      importantDates: [
        "Fecha de compra — punto de partida del plazo de entrega: treinta días naturales si no se pactó otro (art. 66 bis.1)",
        "Fecha de entrega comprometida — la que anunció el vendedor o la acordada expresamente",
        "Fecha del emplazamiento por escrito — abre el plazo adicional para entregar antes de resolver",
      ],
      evidenceTypes: [
        "Factura o ticket de compra",
        "Comprobante de entrega (tracking, albarán)",
        "Comunicaciones con el vendedor",
        "Informe técnico si lo tienes",
      ],
      commonMistakes: [
        "Pedir la resolución sin haber emplazado antes al vendedor, salvo que se haya negado a entregar o la fecha fuera esencial",
        "No dejar por escrito el emplazamiento: sin fecha no se puede acreditar el plazo adicional",
        "Confundir el plazo prometido en la web con el plazo legal de treinta días naturales",
        "Aceptar un vale en lugar de la devolución del importe",
      ],
      whatWeVerify: [
        "Si estás dentro del plazo de garantía legal",
        "Si el rechazo del vendedor es conforme a la normativa",
        "Si procede la resolución, reparación o sustitución",
        "Si tienes derecho a reducción del precio",
      ],
      whatCannotBeDetermined: [
        "Si el defecto es imputable al fabricante o al usuario",
        "Si existe una causa de exclusión de la garantía",
        "Si el vendedor puede demostrar que el defecto no existía",
      ],
    },
    updatedAt: "2026-09-22",
    relatedSlugs: ["garantia-rechazada", "cancelacion-cargo-posterior"],
    steps: [
      "Comprueba la fecha de entrega comprometida. Si no pactasteis otra, el plazo legal es de treinta días naturales desde la celebración del contrato (arts. 66 bis.1 y 109 del TRLGDCU).",
      "Si el plazo ha pasado, exige la entrega por escrito fijando un plazo adicional adecuado a las circunstancias (art. 66 bis.2). Esa comunicación es la que habilita resolver después.",
      "Si sigue sin entregarse, comunica la resolución del contrato y pide la devolución del importe. No necesitas esperar si el vendedor se negó a entregar o si acordasteis que la fecha era esencial (art. 66 bis.3).",
      "Si el bien ya no está disponible, el vendedor debe informarte y devolverte lo abonado sin demora indebida; si el retraso en la devolución es injustificado, el art. 110 permite reclamar el doble del importe adeudado.",
      "Si no hay respuesta, pide la hoja de reclamaciones y presenta reclamación ante la autoridad de consumo de tu comunidad o la oficina municipal de información al consumidor.",
    ],
    example: {
      scenario:
        "Pedido de 89 EUR realizado el 3 de abril con entrega prometida «en 48 horas». A 20 de mayo no ha llegado nada y el vendedor no responde a los mensajes.",
      outcome: [
        "Tanto el plazo pactado como el plazo legal de treinta días naturales están superados (art. 66 bis.1).",
        "Al no haber respuesta ni entrega, procede la resolución del contrato: el art. 66 bis.2 la permite cuando el vendedor sigue sin entregar tras el emplazamiento, y el art. 1124 del Código Civil añade el resarcimiento de daños por incumplimiento.",
        "Procede la devolución de los 89 EUR sin demora indebida (art. 110).",
        "Si esa devolución se retrasa de forma injustificada, el art. 110 habilita a reclamar el doble del importe adeudado.",
      ],
    },
    faq: [
      {
        question: "¿Cuánto tiempo tiene el vendedor para entregar?",
        answer:
          "Si no habéis acordado otra cosa, treinta días naturales desde la celebración del contrato (art. 66 bis.1; en contratos a distancia, art. 109). Muchas tiendas prometen plazos más cortos: el plazo prometido también cuenta.",
      },
      {
        question: "¿Puedo cancelar directamente o tengo que esperar más?",
        answer:
          "Como regla general debes emplazar al vendedor para que entregue en un plazo adicional adecuado y, si sigue sin hacerlo, tienes derecho a resolver (art. 66 bis.2). Ese paso no hace falta si se ha negado a entregar o si acordasteis que la fecha era esencial para ti (art. 66 bis.3).",
      },
      {
        question: "¿Y si ya no tienen el producto?",
        answer:
          "Deben informarte de la falta de disponibilidad y devolverte las sumas abonadas sin demora indebida (art. 110). No pueden ofrecerte un vale como única alternativa a la devolución del dinero.",
      },
      {
        question: "¿Puedo reclamar algo más que el importe pagado?",
        answer:
          "Sí. Si el retraso en la devolución es injustificado, el art. 110 permite reclamar que se te pague el doble del importe adeudado, y la resolución por incumplimiento abre la puerta al resarcimiento de daños (art. 1124 del Código Civil).",
      },
      {
        question: "Figura como entregado pero no lo tengo, ¿es el mismo caso?",
        answer:
          "Cambia el punto que hay que probar. Este módulo analiza la falta de entrega del vendedor; si el envío consta como entregado, lo discutido es si la entrega se hizo correctamente y conviene reunir la información de la transportista antes de reclamar.",
      },
    ],
  },
  {
    key: "warranty-rejection",
    slug: "garantia-rechazada",
    title: "Garantía rechazada",
    description:
      "El vendedor ha rechazado tu solicitud relacionada con una falta de conformidad. Analizamos plazos, respuestas y vías de actuación.",
    category: "Compras",
    available: true,
    keywords: [
      "garantía",
      "rechazado",
      "reparación",
      "producto",
      "defectuoso",
      "sustitución",
      "técnico",
      "conformidad",
      "devolver",
      "reembolso",
    ],
    legalBasis: [
      "TRLGDCU Arts. 114-125 — Conformidad de bienes",
      "TRLGDCU Art. 121 — Carga de la prueba (2 años)",
      "TRLGDCU Art. 118 — Puesta en conformidad",
      "TRLGDCU Art. 119 — Reducción del precio y resolución",
    ],
    whatWeAnalyze: [
      "Descripción de la falta de conformidad",
      "Respuesta del vendedor al reclamación",
      "Plazos desde la compra y desde la entrega",
      "Historial de reparaciones",
      "Alegaciones del vendedor (desgaste, uso indebido, plazo)",
      "Garantía comercial si existe",
    ],
    whatYouGet: [
      "Evaluación de si el rechazo es conforme a normativa",
      "Plazos de responsabilidad y presunción",
      "Vías de actuación disponibles",
      "Acciones recomendadas concretas",
    ],
    limitations: [
      "No sustituye asesoría legal profesional",
      "La evaluación depende de la información proporcionada",
      "No determina valoración pericial de defectos",
    ],
    saberMas: {
      keyFacts: [
        "Fecha de compra del producto",
        "Fecha de entrega efectiva",
        "Descripción del defecto de conformidad",
        "Respuesta del vendedor a tu reclamación",
      ],
      importantDates: [
        "Fecha de entrega — desde aquí se cuentan los tres años de responsabilidad (art. 120.1) y los dos años de presunción (art. 121.1)",
        "Fecha de compra — identifica el contrato y el precio abonado",
        "Fecha de comunicación al vendedor — acredita cuándo pusiste la falta de conformidad en su conocimiento",
      ],
      evidenceTypes: [
        "Factura o ticket de compra",
        "Comprobante de entrega",
        "Comunicaciones con el vendedor",
        "Informe técnico o pericial si existe",
      ],
      commonMistakes: [
        "No distinguir entre garantía legal y garantía comercial",
        "Dejar pasar el tiempo sin reclamar por escrito pese a estar dentro de los plazos legales",
        "No conservar el comprobante de compra",
        "Aceptar el rechazo sin verificar si el vendedor cumple la normativa",
      ],
      whatWeVerify: [
        "Si estás dentro del plazo de garantía legal",
        "Si el rechazo del vendedor es conforme a la normativa",
        "Si procede la resolución, reparación o sustitución",
        "Si tienes derecho a reducción del precio",
      ],
      whatCannotBeDetermined: [
        "Si el defecto es imputable al fabricante o al usuario",
        "Si existe una causa de exclusión de la garantía",
        "Si el vendedor puede demostrar que el defecto no existía en el momento de la entrega",
      ],
    },
    updatedAt: "2026-09-22",
    relatedSlugs: ["pedido-no-llega", "cancelacion-cargo-posterior"],
    steps: [
      "Dirígete al vendedor, es decir, al empresario con quien contrataste, no al fabricante: es quien responde de la falta de conformidad (art. 117.1 del TRLGDCU).",
      "Comunícalo por escrito (correo o formulario) y pide acuse o número de referencia. La fecha de esa comunicación sitúa el problema en el tiempo.",
      "Elige la medida: reparación o sustitución (art. 118.1). La reducción del precio o la resolución entran cuando la puesta en conformidad es imposible o desproporcionada (art. 118.3 y 119).",
      "Guarda la factura o el ticket y el comprobante de entrega: de esas fechas depende todo el análisis de plazos.",
      "Si el vendedor rechaza, pide la hoja de reclamaciones y presenta reclamación ante la autoridad de consumo de tu comunidad o la oficina municipal de información al consumidor.",
    ],
    example: {
      scenario:
        "Lavadora de 499 EUR comprada el 12 de marzo de 2025 y entregada el 20 de marzo de 2025. En enero de 2026 falla el motor y el vendedor responde que «la garantía de un año ya ha caducado».",
      outcome: [
        "El defecto se manifiesta dentro de los dos años siguientes a la entrega, así que se presume que ya existía cuando se entregó (art. 121.1); quien tendría que aportar prueba en contrario es el vendedor.",
        "La responsabilidad del vendedor alcanza las faltas de conformidad que se manifiesten en los tres años siguientes a la entrega (art. 120.1), de modo que el caso sigue dentro de plazo.",
        "Puedes exigir reparación o sustitución a tu elección, salvo que una de las dos sea imposible o suponga costes desproporcionados (art. 118.1 y 118.3).",
        "El «año de garantía» que invoca el vendedor correspondería como mucho a una garantía comercial, que no puede recortar los derechos de la garantía legal.",
      ],
    },
    faq: [
      {
        question: "¿Cuánto dura la garantía legal?",
        answer:
          "En bienes, el vendedor responde de las faltas de conformidad que se manifiesten en los tres años siguientes a la entrega; en bienes de segunda mano puede pactarse un plazo menor, nunca inferior a un año (art. 120.1). La presunción de que el defecto ya existía al entregarse alcanza los dos años (art. 121.1).",
      },
      {
        question: "¿Es lo mismo la garantía legal que la comercial?",
        answer:
          "No. La garantía legal nace de la ley y se aplica siempre; la comercial es la que añade el vendedor o el fabricante y no puede reducir ni sustituir los derechos que reconoce la legal.",
      },
      {
        question: "¿Quién tiene que demostrar que el producto estaba bien?",
        answer:
          "Dentro de los dos años siguientes a la entrega se presume que la falta de conformidad ya existía (art. 121.1). Por tanto, es el vendedor quien tendría que aportar prueba en contrario, no tú.",
      },
      {
        question: "¿Puedo exigir directamente que me devuelvan el dinero?",
        answer:
          "El primer escalón son la reparación o la sustitución, a tu elección (art. 118.1). La reducción del precio o la resolución del contrato (con devolución) entran cuando la puesta en conformidad es imposible o desproporcionada, cuando el vendedor anuncia que no la hará en un plazo razonable o sin mayores inconvenientes, o cuando el defecto reaparece después de la reparación (art. 119).",
      },
      {
        question: "Lo repararon y ha vuelto a fallar, ¿qué pasa?",
        answer:
          "Durante el año siguiente a recibir el bien ya conforme, el vendedor responde de las faltas de conformidad que motivaron la reparación, presumiéndose que se trata de la misma cuando se reproducen defectos del mismo origen (art. 122.3).",
      },
    ],
  },
  {
    key: "flight-cancel",
    slug: "vuelo-cancelado",
    title: "Vuelo cancelado por la aerolínea",
    description:
      "La aerolínea canceló tu vuelo. Analizamos plazos de aviso, distancia, transporte alternativo y derecho a compensación.",
    category: "Transporte",
    available: true,
    keywords: [
      "vuelo",
      "cancelado",
      "aerolínea",
      "compensación",
      "retraso",
      "billete",
      "avión",
      "aeropuerto",
      "alternativo",
      "reembolso",
    ],
    legalBasis: [
      "Reglamento (CE) 261/2004 — Derechos de pasajeros aéreos",
      "Art. 5 — Cancelación y excepciones",
      "Art. 7 — Compensación (250/400/600 EUR)",
      "Art. 8 — Reembolso y transporte alternativo",
      "Art. 9 — Derecho a asistencia",
    ],
    whatWeAnalyze: [
      "Aeropuertos de salida y llegada (distancia)",
      "Fecha de cancelación y plazo de aviso",
      "Oferta de transporte alternativo y su conformidad",
      "Circunstancias alegadas por la aerolínea",
      "Gastos adicionales incurridos",
      "Estado de reclamación y reembolso",
    ],
    whatYouGet: [
      "Compensación base según distancia (250/400/600 EUR)",
      "Exención por transporte alternativo conforme",
      "Reducción del 50% cuando corresponde (Art. 7.2)",
      "Derecho a reembolso y asistencia",
      "Acciones recomendadas concretas",
    ],
    limitations: [
      "No sustituye asesoría legal profesional",
      "La distancia se calcula entre aeropuertos (no conexión)",
      "No cubre viajes combinados",
      "Circunstancias extraordinarias requieren verificación del transportista",
    ],
    saberMas: {
      keyFacts: [
        "Fecha de cancelación del vuelo",
        "Plazo de aviso de la aerolínea",
        "Aeropuertos de salida y llegada (distancia)",
        "Si te ofrecieron transporte alternativo",
      ],
      importantDates: [
        "Fecha de cancelación — determina si estás dentro del plazo de reclamación",
        "Fecha del vuelo original — referencia para cálculo de compensación",
        "Fecha de notificación — el Reglamento no fija un plazo propio: reclama por escrito cuanto antes y conserva el acuse",
      ],
      evidenceTypes: [
        "Confirmación de reserva",
        "Comunicación de cancelación de la aerolínea",
        "Billete de vuelo alternativo si lo tomaste",
        "Gastos adicionales (hotel, transporte, comidas)",
      ],
      commonMistakes: [
        "No conservar la confirmación de cancelación",
        "Aceptar transporte alternativo sin verificar si cumple condiciones",
        "No registrar gastos adicionales incurridos",
        "Dejar pasar el tiempo sin reclamar por escrito y sin conservar el acuse",
      ],
      whatWeVerify: [
        "Si la cancelación cumple condiciones del Art. 5 del Reglamento 261/2004",
        "Si procede compensación de 250/400/600 EUR",
        "Si la aerolínea tiene derecho a exención",
        "Si te corresponde transporte alternativo o reembolso",
      ],
      whatCannotBeDetermined: [
        "Si las circunstancias extraordinarias alegadas son ciertas",
        "Si la aerolínea cumple con la asistencia durante la espera",
        "Si existen acuerdos específicos con la aerolínea",
      ],
    },
    updatedAt: "2026-09-22",
    relatedSlugs: ["pedido-no-llega", "cancelacion-cargo-posterior"],
    steps: [
      "Reclama primero a la aerolínea por su canal oficial, indicando número de vuelo, fechas y qué pides: compensación (art. 7), reembolso del billete (art. 8) y gastos de asistencia que no te cubrió (art. 9).",
      "Guarda el acuse o el número de referencia de esa reclamación: es el punto de partida si después tienes que acudir a la autoridad.",
      "Si no responde en un plazo razonable o rechaza, presenta reclamación ante la Agencia Estatal de Seguridad Aérea (AESA), el organismo que vela por el cumplimiento del Reglamento 261/2004 en España (art. 16).",
      "Adjunta reserva confirmada, la comunicación de la cancelación y los justificantes de los gastos que reclamas (alojamiento, transporte, comidas).",
      "Ten en cuenta la forma de pago: la compensación se abona en metálico, transferencia o cheque y, solo con tu acuerdo firmado, en bonos de viaje u otros servicios (art. 7.3).",
    ],
    example: {
      scenario:
        "Vuelo Madrid–Londres (unos 1.250 km) el 10 de mayo. La aerolínea avisa el 7 de mayo, tres días antes, de que el vuelo se cancela, y no ofrece otro vuelo. El pasajero paga 120 EUR de hotel esa noche.",
      outcome: [
        "Compensación de 250 EUR: la distancia es de hasta 1.500 km, el primer tramo del art. 7.1.",
        "No se aplica la excepción por preaviso: el aviso fue de tres días, muy por debajo de las dos semanas del art. 5.1.c.i, y tampoco hubo transporte alternativo que cumpliera los umbrales del art. 5.1.c.ii y iii.",
        "Reembolso del coste íntegro del billete no utilizado (art. 8.1).",
        "Los 120 EUR de hotel se documentan aparte, como gasto de la asistencia que la aerolínea debía haber cubierto (art. 9.1): el informe los recoge como importe a reclamar y no los suma automáticamente a la compensación.",
      ],
    },
    faq: [
      {
        question: "¿Cuánta compensación me corresponde?",
        answer:
          "Depende de la distancia: 250 EUR para vuelos de hasta 1.500 km; 400 EUR para vuelos intracomunitarios de más de 1.500 km y para los demás vuelos de entre 1.500 y 3.500 km; 600 EUR para el resto (art. 7.1). La distancia se calcula por la ruta ortodrómica entre aeropuertos (art. 7.4), no por el trayecto con escalas.",
      },
      {
        question: "Me avisaron con dos semanas de antelación, ¿me corresponde compensación?",
        answer:
          "Con carácter general no: el art. 5.1.c exceptúa la compensación cuando te informan de la cancelación al menos con dos semanas respecto a la salida prevista. Si el aviso llega entre dos semanas y siete días antes, la excepción exige además que el transporte alternativo te permita salir con no más de dos horas de antelación y llegar con menos de cuatro horas de retraso.",
      },
      {
        question: "¿Y si acepté el vuelo alternativo que me ofrecieron?",
        answer:
          "Hay que distinguir dos supuestos distintos. La excepción del art. 5.1.c deja a la aerolínea sin obligación de compensar cuando el alternativo cumple los umbrales anteriores; la reducción del art. 7.2 rebaja la compensación a la mitad cuando el alternativo llega con un retraso no superior a 2, 3 o 4 horas según el tramo de distancia. Uno excluye el pago y el otro solo lo reduce.",
      },
      {
        question: "Alegan circunstancias extraordinarias, ¿puedo reclamar igual?",
        answer:
          "Sí puedes reclamar. El art. 5.3 exime de compensación solo si el transportista prueba que la cancelación se debió a circunstancias extraordinarias que no podían evitarse; la carga de esa prueba es de la aerolínea. Además, el art. 5.4 le atribuye también la carga de probar cuándo y cómo te informó de la cancelación.",
      },
      {
        question: "¿Hasta cuándo puedo reclamar?",
        answer:
          "El Reglamento no fija un plazo propio: se aplican los plazos de prescripción de la ley nacional. Reclama por escrito cuanto antes y conserva el acuse, porque la reclamación fechada es la mejor prueba de que actuaste a tiempo.",
      },
    ],
  },
] as const;

/** Get a problem by its slug */
export function getProblemBySlug(
  slug: string,
): ProblemCatalogueEntry | undefined {
  return PROBLEM_CATALOGUE.find((p) => p.slug === slug);
}

/** Get a problem by its module key */
export function getProblemByKey(
  key: string,
): ProblemCatalogueEntry | undefined {
  return PROBLEM_CATALOGUE.find((p) => p.key === key);
}

/** Get only available problems */
export function getAvailableProblems(): readonly ProblemCatalogueEntry[] {
  return PROBLEM_CATALOGUE.filter((p) => p.available);
}

/** Search problems by query (local, for SearchBar) */
export function searchProblems(query: string): readonly ProblemCatalogueEntry[] {
  if (!query.trim()) return [];
  const terms = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const scored = PROBLEM_CATALOGUE.map((problem) => {
    let score = 0;
    const titleLower = problem.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const categoryLower = problem.category
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    for (const term of terms) {
      if (titleLower.includes(term)) score += 10;
      if (categoryLower.includes(term)) score += 5;
      for (const kw of problem.keywords) {
        const kwNorm = kw
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        if (kwNorm === term) score += 8;
        else if (kwNorm.includes(term) || term.includes(kwNorm)) score += 4;
      }
    }
    return { problem, score };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.problem);
}
