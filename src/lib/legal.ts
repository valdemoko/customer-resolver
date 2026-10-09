/**
 * BORRADORES LEGALES.
 *
 * Este contenido NO es asesoramiento jurídico y no debe publicarse sin la
 * revisión de un profesional. Cada documento declara explícitamente que es un
 * borrador. Se han redactado para que la revisión sea concreta (puntos
 * señalados con [REVISAR]) en lugar de partir de cero.
 *
 * Marco considerado: RGPD (UE 2016/679), LOPDGDD 3/2018, LSSI-CE 34/2002,
 * TRLGDCU (RDL 1/2007) y Reglamento (UE) 2022/2065 de Servicios Digitales.
 */

export type LegalDoc = {
  slug: string;
  title: string;
  summary: string;
  sections: { heading: string; body: string[] }[];
  openQuestions: string[];
};

export const legalDocs: LegalDoc[] = [
  {
    slug: "aviso-legal",
    title: "Aviso legal",
    summary:
      "Identificación del titular del servicio y condiciones de acceso al sitio.",
    sections: [
      {
        heading: "Titular",
        body: [
          "Denominación social: [REVISAR — pendiente de constitución o datos registrales]",
          "NIF: [REVISAR]",
          "Domicilio: [REVISAR]",
          "Correo de contacto: [REVISAR]",
        ],
      },
      {
        heading: "Objeto del servicio",
        body: [
          "El servicio permite explorar reproducciones tridimensionales de espacios urbanos y contratar la exhibición de contenidos publicitarios virtuales sobre dichos espacios.",
          "Las ubicaciones publicitarias son virtuales. El contrato no constituye arrendamiento, compraventa ni derecho real sobre ningún inmueble, y no genera expectativa de revalorización.",
        ],
      },
      {
        heading: "Condiciones de uso",
        body: [
          "[REVISAR] Uso permitido, prohibición de extracción masiva de datos y de ingeniería inversa sobre los datos geográficos.",
          "[REVISAR] Régimen de responsabilidad por indisponibilidad del servicio.",
        ],
      },
    ],
    openQuestions: [
      "¿Qué forma jurídica tendrá el titular y en qué registro se inscribe?",
      "¿Se quiere incluir una cláusula de resolución de conflictos con arbitraje de consumo?",
    ],
  },
  {
    slug: "privacidad",
    title: "Política de privacidad",
    summary:
      "Información sobre el tratamiento de datos personales conforme al RGPD y la LOPDGDD.",
    sections: [
      {
        heading: "Responsable del tratamiento",
        body: ["[REVISAR] Identidad y datos de contacto del responsable y del delegado de protección de datos, si procede."],
      },
      {
        heading: "Datos que se tratan",
        body: [
          "Cuenta: dirección de correo electrónico e identificador de la cuenta creada al iniciar sesión con enlace mágico o con Google.",
          "Favoritos: identificadores de ciudad. Mientras no exista sesión, se guardan únicamente en el navegador del usuario y no se envían al servidor.",
          "Facturación: datos necesarios para emitir la factura, tratados por el proveedor de pagos. Los datos completos de tarjeta no llegan a nuestros servidores.",
          "[REVISAR] Registros técnicos: dirección IP y datos de diagnóstico, con su plazo de conservación.",
        ],
      },
      {
        heading: "Finalidades y bases jurídicas",
        body: [
          "Ejecución del contrato: gestionar la cuenta, la reserva y la publicación del anuncio.",
          "Consentimiento: cookies no esenciales y comunicaciones comerciales.",
          "Interés legítimo: seguridad, prevención de fraude y mejora del servicio. [REVISAR: ponderación documentada]",
        ],
      },
      {
        heading: "Conservación",
        body: [
          "[REVISAR] Plazos por categoría. Como mínimo: historial de titularidad de una ubicación mientras exista la relación y durante los plazos de prescripción; documentación contable durante los plazos fiscales.",
        ],
      },
      {
        heading: "Destinatarios y transferencias",
        body: [
          "[REVISAR] Encargados: alojamiento, base de datos, correo transaccional, pagos y observabilidad, con indicación del país de tratamiento y de las garantías aplicables en caso de transferencia internacional.",
        ],
      },
      {
        heading: "Derechos",
        body: [
          "Acceso, rectificación, supresión, oposición, limitación y portabilidad, así como el derecho a reclamar ante la Agencia Española de Protección de Datos.",
          "[REVISAR] Procedimiento interno de atención de derechos y plazo comprometido.",
        ],
      },
      {
        heading: "Moderación y contenido de terceros",
        body: [
          "Los anuncios se revisan antes de publicarse. Cualquier persona puede reportar un anuncio; [REVISAR] procedimiento, plazos y criterios de retirada conforme al Reglamento de Servicios Digitales.",
        ],
      },
    ],
    openQuestions: [
      "¿Se tratarán datos de menores de 14 años? (afectaría a la base jurídica del consentimiento)",
      "¿Se van a usar datos de localización del dispositivo? Hoy el visor no solicita geolocalización.",
      "¿Qué proveedor de correo transaccional se usará, y en qué país trata los datos?",
    ],
  },
  {
    slug: "cookies",
    title: "Política de cookies",
    summary:
      "Cookies y almacenamiento local utilizados por el servicio.",
    sections: [
      {
        heading: "Qué se usa hoy",
        body: [
          "Almacenamiento local del navegador (localStorage) con la clave `alzado.catalog.v1`: guarda las ciudades marcadas como favoritas y el orden del catálogo. No identifica a la persona y no se envía al servidor. Es almacenamiento técnico necesario para recordar una preferencia explícita.",
          "No hay, a fecha de este borrador, cookies de analítica ni de publicidad de terceros.",
        ],
      },
      {
        heading: "Si se añaden cookies no esenciales",
        body: [
          "[REVISAR] Se deberá incorporar un gestor de consentimiento previo con rechazo tan accesible como la aceptación, y actualizar esta política con nombre, finalidad, duración y tercero de cada cookie.",
        ],
      },
      {
        heading: "Cómo borrarlas",
        body: [
          "El usuario puede borrar el almacenamiento local desde los ajustes de su navegador sin que ello impida usar el catálogo.",
        ],
      },
    ],
    openQuestions: [
      "¿Se instalará analítica? Si es así, ¿se optará por una solución sin cookies y con anonimización?",
    ],
  },
  {
    slug: "condiciones",
    title: "Condiciones de contratación",
    summary:
      "Términos de la contratación de ubicaciones publicitarias virtuales. Borrador: las compras están desactivadas.",
    sections: [
      {
        heading: "Estado actual",
        body: [
          "La contratación está desactivada. No es posible completar ninguna compra en este momento y no existe un modo de prueba que aparente una compra real.",
        ],
      },
      {
        heading: "Objeto",
        body: [
          "El contrato tiene por objeto la exhibición de un contenido publicitario en una ubicación virtual concreta durante un periodo determinado. La ubicación se identifica por su identificador y por su geometría publicada.",
          "[REVISAR] Duración del derecho: ¿temporal con fecha de fin, o permanente mientras el servicio exista? Ver docs/ownership-rules.md.",
        ],
      },
      {
        heading: "Precio, IVA y factura",
        body: [
          "Los precios se expresan en euros con dos decimales. [REVISAR] Indicar si los precios mostrados incluyen o excluyen el IVA aplicable y el tipo vigente en cada momento.",
          "El precio de una ubicación puede aumentar cuando se revende; el precio aplicable es siempre el que se muestra en pantalla antes de confirmar el pago.",
        ],
      },
      {
        heading: "Derecho de desistimiento",
        body: [
          "[REVISAR] Para consumidores de la UE: análisis de la excepción al desistimiento por contenido digital ejecutado inmediatamente con consentimiento previo y renuncia expresa, o del plazo de 14 días. Es una decisión jurídica, no de producto.",
        ],
      },
      {
        heading: "Moderación, retirada y reembolso",
        body: [
          "Ningún anuncio se publica sin revisión previa.",
          "[REVISAR] Causas de rechazo, política de reembolso y qué ocurre con el contenido de un anunciante cuando la ubicación cambia de titular.",
        ],
      },
      {
        heading: "Reclamaciones",
        body: [
          "[REVISAR] Vía de reclamación previa, hojas de reclamaciones y acceso a mediación o arbitraje de consumo.",
        ],
      },
    ],
    openQuestions: [
      "¿Derecho temporal o permanente sobre la ubicación? Es la decisión que abre docs/ownership-rules.md.",
      "¿Los precios se muestran con IVA incluido o excluido?",
      "¿Se aplicará el régimen de desistimiento o la excepción por contenido digital inmediato?",
    ],
  },
];

export function getLegalDoc(slug: string): LegalDoc | undefined {
  return legalDocs.find((doc) => doc.slug === slug);
}
