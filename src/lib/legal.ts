import { contactLabel, legalEntity } from "./legal-entity";

/**
 * Textos legales de Resolveo. Marco considerado: RGPD (UE 2016/679), LOPDGDD
 * 3/2018, LSSI-CE 34/2002, TRLGDCU (RD Leg. 1/2007) y Reglamento (UE) 2022/2065.
 * Los datos del titular salen de `legal-entity.ts`.
 */

export type LegalDoc = {
  slug: string;
  title: string;
  summary: string;
  sections: { heading: string; body: string[] }[];
};

const holder = (): string[] => {
  const lines = [
    legalEntity.name && `Titular: ${legalEntity.name}`,
    legalEntity.taxId && `NIF: ${legalEntity.taxId}`,
    legalEntity.address && `Domicilio: ${legalEntity.address}`,
    legalEntity.email && `Correo de contacto: ${legalEntity.email}`,
    "Sitio web: https://resolveo.site",
  ].filter((line): line is string => Boolean(line));
  return lines;
};

export const legalDocs: LegalDoc[] = [
  {
    slug: "aviso-legal",
    title: "Aviso legal",
    summary: "Quién está detrás de Resolveo, qué es el servicio y cómo se usa el sitio.",
    sections: [
      { heading: "Titular del sitio", body: holder() },
      {
        heading: "Qué es Resolveo",
        body: [
          "Resolveo es un sitio web que muestra ciudades reconstruidas en 3D a partir de cartografía pública y permite contratar espacios publicitarios virtuales sobre esas reproducciones: edificios, locales, tramos de muralla, paneles de barcos, velas, camiones, aviones y otros elementos del mapa.",
          "Los espacios son virtuales. Comprar uno no supone comprar, alquilar ni adquirir ningún derecho sobre un inmueble o un elemento real, ni genera expectativa de revalorización o de rentabilidad. El mapa es una representación aproximada: no es un plano oficial ni sustituye a la cartografía del Catastro.",
        ],
      },
      {
        heading: "Condiciones de uso del sitio",
        body: [
          "Puedes navegar por el sitio y por el mapa libremente. No está permitido extraer los datos de forma masiva, automatizar compras, eludir los límites técnicos del servicio, intentar acceder a áreas privadas ni usar el sitio para actividades ilícitas.",
          "El titular puede suspender o modificar el servicio, total o parcialmente, por razones técnicas, legales o de seguridad.",
        ],
      },
      {
        heading: "Propiedad intelectual e industrial",
        body: [
          "El diseño, el código, los textos y la marca Resolveo pertenecen a su titular. Los datos cartográficos proceden de fuentes de terceros con sus propias licencias (OpenStreetMap, Catastro, entre otras) y se detallan, con su atribución obligatoria, en la página de atribuciones y datos.",
          "Los contenidos que publica cada anunciante (nombre, texto, web e imágenes) pertenecen a su autor o a quien le haya cedido los derechos. Al comprar un espacio, el anunciante concede a Resolveo una licencia gratuita, no exclusiva y mundial para mostrar ese contenido en el mapa mientras esté activo y para conservar un registro histórico de la compra.",
        ],
      },
      {
        heading: "Enlaces",
        body: [
          "Los anuncios pueden enlazar a webs de terceros marcadas como patrocinadas. Resolveo no controla esas webs ni responde de su contenido, de sus productos o de su política de privacidad.",
        ],
      },
      {
        heading: "Responsabilidad",
        body: [
          "Se procura que el sitio esté disponible y que la información sea correcta, pero se ofrece «tal cual». Resolveo no garantiza la ausencia de interrupciones ni de errores en los datos del mapa y no responde de los daños derivados de ellos salvo que la ley lo imponga.",
          "Resolveo no revisa los anuncios antes de publicarlos y no responde de su contenido. Cada anunciante es responsable del suyo. Puede retirarse cualquier contenido que incumpla las normas de contenido o la ley (véase la página «Normas de contenido»).",
        ],
      },
      {
        heading: "Ley aplicable y jurisdicción",
        body: [
          "Este aviso se rige por la ley española. Si eres consumidor, para cualquier conflicto serán competentes los juzgados y tribunales de tu domicilio, conforme a la normativa de consumidores. En los demás casos, los de la ciudad del domicilio del titular.",
        ],
      },
    ],
  },
  {
    slug: "privacidad",
    title: "Política de privacidad",
    summary: "Qué datos personales se tratan, para qué, durante cuánto tiempo y qué derechos tienes.",
    sections: [
      { heading: "Responsable del tratamiento", body: holder() },
      {
        heading: "Qué datos se tratan",
        body: [
          "Navegación: al visitar el sitio los servidores reciben datos técnicos inevitables (dirección IP, navegador, fecha y página solicitada). No usamos herramientas de analítica ni de publicidad de terceros.",
          "Registro de administración: las acciones del equipo sobre anuncios y cuentas (retirar un anuncio, bloquear a una persona, devolver un pago) quedan anotadas con su motivo. Si una cuenta se bloquea por incumplir las normas, se guarda su correo en la lista de bloqueos.",
          "Cuenta (opcional): si entras con Google recibimos tu identificador de Google, tu correo, tu nombre y tu foto de perfil. No recibimos ni guardamos ninguna contraseña. Estos datos se guardan en una cookie de sesión y el identificador se asocia a tus compras.",
          "Compras: nombre del anunciante, descripción, web e imágenes que subes (son públicos en el mapa), el espacio comprado, el importe y la fecha. El pago lo procesa Stripe: nunca vemos ni guardamos los datos de tu tarjeta. Stripe nos facilita el correo con el que pagas y lo guardamos junto a la compra para asociarla a tu cuenta si luego entras con Google con ese mismo correo, y para verificar que eres el dueño cuando editas tu anuncio.",
          "Encuesta de la próxima ciudad: tu voto y un identificador (tu cuenta, o una cookie aleatoria si votas sin iniciar sesión) para que cada persona vote una vez, y una huella con sal de tu conexión, que no permite recuperar tu IP, para limitar los votos masivos desde un mismo origen. El voto es anónimo para el público.",
          "Tus contenidos públicos: lo que escribas en el nombre, la descripción y la web, y las fotos que subas, serán visibles para cualquier visitante. No incluyas datos personales de terceros ni tuyos que no quieras hacer públicos.",
        ],
      },
      {
        heading: "Para qué y con qué base jurídica",
        body: [
          "Prestar el servicio y gestionar tu compra: ejecución del contrato (art. 6.1.b RGPD).",
          "Mantener la sesión y el acceso a tu cuenta si decides entrar con Google: ejecución del contrato y tu consentimiento al pulsar «Continuar con Google» (art. 6.1.a y 6.1.b).",
          "Seguridad del sitio, prevención del fraude y atención de reclamaciones: interés legítimo (art. 6.1.f).",
          "Cumplir obligaciones fiscales y contables sobre las compras: obligación legal (art. 6.1.c).",
        ],
      },
      {
        heading: "Cuánto tiempo se conservan",
        body: [
          "Los datos de las compras (espacio, importe, fecha y contenido publicado) se conservan mientras dure la relación y, después, durante los plazos legales aplicables a las obligaciones fiscales y mercantiles, que pueden llegar a seis años.",
          "Los datos de la sesión caducan a los 30 días o cuando cierras sesión. El enlace privado de edición de tu anuncio se guarda en tu navegador (almacenamiento local) y vale hasta que otra persona compre ese espacio. Puedes pedir el borrado de tu cuenta en cualquier momento, salvo lo que debamos conservar por ley.",
        ],
      },
      {
        heading: "Quién más accede a los datos",
        body: [
          "Encargados del tratamiento que prestan el servicio técnico: Cloudflare, Inc. (alojamiento y red), Neon, Inc. (base de datos), Stripe Payments Europe, Ltd. (pagos) y Google Ireland Limited (inicio de sesión, solo si lo usas).",
          "Algunos de estos proveedores pueden tratar datos fuera del Espacio Económico Europeo. En esos casos se apoyan en garantías adecuadas: decisión de adecuación (Marco de Privacidad de Datos UE-EEUU) o cláusulas contractuales tipo.",
          "No vendemos tus datos ni los cedemos a terceros con fines publicitarios. Solo los comunicaremos a autoridades cuando una ley nos obligue.",
        ],
      },
      {
        heading: "Tus derechos",
        body: [
          `Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a ${contactLabel}, indicando qué derecho quieres ejercer y adjuntando un dato que permita identificarte.`,
          "Si consideras que no hemos tratado tus datos correctamente, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).",
        ],
      },
      {
        heading: "Menores",
        body: ["El servicio está dirigido a mayores de 18 años. No se recogen conscientemente datos de menores."],
      },
      {
        heading: "Seguridad",
        body: [
          "Las comunicaciones van cifradas (HTTPS), las sesiones se guardan en cookies firmadas y de solo lectura para el navegador, y las claves de servicio no se almacenan en el código. Ningún sistema es infalible: si hubiera una brecha que te afectara, te lo comunicaremos conforme a la ley.",
        ],
      },
      {
        heading: "Cambios",
        body: ["Si esta política cambia de forma relevante, se indicará en esta página con la nueva fecha de actualización."],
      },
    ],
  },
  {
    slug: "cookies",
    title: "Política de cookies",
    summary: "Qué se guarda en tu navegador y por qué. Hoy solo se usa almacenamiento técnico.",
    sections: [
      {
        heading: "Qué usa hoy el sitio",
        body: [
          "Resolveo no usa cookies de analítica, de publicidad ni de seguimiento. Solo se usa almacenamiento estrictamente necesario, que no requiere tu consentimiento (art. 22.2 LSSI):",
          "rs_session (cookie, 30 días): mantiene tu sesión si entras con Google. Solo existe si inicias sesión.",
          "rs_oauth (cookie, 10 minutos): protege el paso de inicio de sesión con Google frente a falsificaciones. Se borra al terminar.",
          "rs_voter (cookie, 1 año): un identificador aleatorio que recuerda que ya has votado en la encuesta de la próxima ciudad. Solo existe si votas sin haber iniciado sesión.",
          "Ciudades guardadas y enlaces de edición (almacenamiento local del navegador): recuerdan las ciudades que marcas como guardadas y, si compras como invitado, el enlace privado para editar tu anuncio. No salen de tu navegador.",
        ],
      },
      {
        heading: "Servicios de terceros",
        body: [
          "Al pagar, Stripe te lleva a su página de pago y puede usar sus propias cookies para prevenir el fraude. Si entras con Google, Google puede usar las suyas en su página de acceso. Esas cookies las controlan ellos; consulta sus políticas.",
        ],
      },
      {
        heading: "Cómo borrarlas",
        body: [
          "Puedes borrar las cookies y los datos del sitio desde la configuración de tu navegador, o cerrando sesión en tu cuenta. Si las bloqueas, el sitio sigue funcionando, pero no podrás mantener la sesión.",
        ],
      },
      {
        heading: "Si esto cambia",
        body: ["Si en el futuro se añadiera una herramienta de analítica o publicidad, se pediría tu consentimiento antes de activarla y se actualizaría esta página."],
      },
    ],
  },
  {
    slug: "condiciones",
    title: "Condiciones de contratación",
    summary: "Qué compras, cómo funciona el precio, la protección de cinco días y que no hay devoluciones.",
    sections: [
      {
        heading: "Qué estás comprando",
        body: [
          "Compras el derecho a mostrar tu anuncio (nombre, texto, web e imagen) en un espacio virtual concreto del mapa de Resolveo, hasta que otra persona lo compre. No compras un inmueble, ni un derecho sobre él, ni un derecho de exclusiva más allá de lo descrito aquí.",
          "Solo se aceptan compras de personas mayores de 18 años o de empresas con capacidad para contratar.",
        ],
      },
      {
        heading: "Precio",
        body: [
          "La primera compra de un espacio cuesta 1,00 €. Cada vez que alguien compra un espacio, el precio de la siguiente compra de ese mismo espacio sube un 25 %.",
          "El precio que ves antes de pagar es el que pagas. Lo calcula siempre el servidor en el momento de iniciar el pago. El importe total, con los impuestos que correspondan ya incluidos, se muestra en la pantalla de pago de Stripe antes de confirmar.",
        ],
      },
      {
        heading: "Protección de cinco días",
        body: [
          "Desde el momento en que se completa una compra, ese espacio queda protegido durante cinco días: nadie puede comprarlo ni quitarte el anuncio. Pasados los cinco días, cualquiera puede comprarlo por el precio siguiente y su anuncio sustituirá al tuyo.",
          "Si dos personas están pagando el mismo espacio a la vez, solo se aplica la compra que se complete primero. A la otra se le devuelve el importe íntegro de forma automática.",
        ],
      },
      {
        heading: "Duración del anuncio",
        body: [
          "No se garantiza ninguna duración mínima más allá de los cinco días de protección. Tu anuncio permanece visible mientras nadie compre el espacio y el servicio esté activo. Resolveo puede modificar, suspender o cerrar el servicio o una ciudad; en ese caso no se genera derecho a compensación.",
        ],
      },
      {
        heading: "Sin devoluciones",
        body: [
          "Todas las compras son definitivas. No hay devoluciones ni reembolsos, ni siquiera si tu anuncio es sustituido pasados los cinco días de protección, si cambias de opinión o si te equivocas al elegir el espacio o el contenido. Revisa la vista previa antes de pagar.",
          "Los casos en los que sí se devuelve el pago son los que impone la ley, un cobro duplicado o erróneo atribuible a un fallo técnico y el pago que no pudo aplicarse porque otra persona compró el espacio antes (véase «Pagos y sin devoluciones»).",
        ],
      },
      {
        heading: "Derecho de desistimiento",
        body: [
          "Si eres consumidor, la ley te reconoce con carácter general 14 días para desistir de una compra a distancia. Sin embargo, este servicio es un contenido digital y un servicio que se presta de forma inmediata al completar el pago. Al marcar la casilla de aceptación antes de pagar, solicitas expresamente que la prestación empiece de inmediato y reconoces que, una vez prestado, pierdes el derecho de desistimiento (art. 103 m) del texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios).",
          "Esto no afecta a los demás derechos que la ley reconoce a los consumidores, como los derechos por falta de conformidad.",
        ],
      },
      {
        heading: "Tus contenidos",
        body: [
          "Eres responsable de lo que publicas. Garantizas que tienes derechos sobre el nombre, el texto, las imágenes y los enlaces que subes, que no infringen derechos de terceros y que cumplen las normas de contenido. Resolveo puede retirar sin previo aviso y sin reembolso cualquier contenido que las incumpla o que reciba una reclamación fundada.",
          "Concedes a Resolveo una licencia gratuita, no exclusiva y mundial para mostrar tu contenido en el mapa mientras esté activo, comprimirlo y adaptarlo técnicamente para su visualización y conservar un registro histórico de la compra.",
        ],
      },
      {
        heading: "Pagos",
        body: [
          "Los pagos se procesan con Stripe. Resolveo no recibe ni guarda los datos de tu tarjeta. Si inicias una disputa o un contracargo con tu banco por una compra válida, Resolveo podrá retirar el anuncio asociado y cerrar tu cuenta.",
        ],
      },
      {
        heading: "Responsabilidad",
        body: [
          "Resolveo no garantiza visitas, clics, ventas ni ningún resultado comercial por mostrar tu anuncio. Salvo dolo o negligencia grave, la responsabilidad máxima de Resolveo frente a ti se limita al importe que pagaste por el espacio afectado.",
        ],
      },
      {
        heading: "Cambios en estas condiciones",
        body: [
          "Las condiciones aplicables a una compra son las vigentes en el momento de pagarla. Los cambios futuros no afectan a las compras ya completadas.",
        ],
      },
      {
        heading: "Ley aplicable y reclamaciones",
        body: [
          `Estas condiciones se rigen por la ley española. Para cualquier duda o reclamación escribe a ${contactLabel}. Si eres consumidor, son competentes los tribunales de tu domicilio.`,
        ],
      },
    ],
  },
  {
    slug: "pagos-y-devoluciones",
    title: "Pagos y sin devoluciones",
    summary: "Cómo se paga, qué se devuelve y qué no. Léelo antes de comprar.",
    sections: [
      {
        heading: "Cómo se paga",
        body: [
          "El pago se hace con tarjeta y otros métodos que ofrece Stripe en su página de pago segura. El cargo se realiza en euros. Recibirás el recibo por correo si Stripe te lo solicita.",
          "El espacio solo cambia de dueño cuando Stripe confirma el pago. Si cierras la ventana antes de pagar, no se cobra nada y el espacio no se reserva.",
        ],
      },
      {
        heading: "No hay devoluciones",
        body: [
          "Las compras son definitivas. No se devuelve el dinero por cambiar de opinión, por equivocarte de espacio, de imagen o de texto, ni porque otra persona compre el espacio pasados los cinco días de protección.",
          "Antes de pagar puedes comprobar la vista previa 3D de tu anuncio y modificarlo todo lo que quieras. Una vez pagado, ya no.",
        ],
      },
      {
        heading: "Cuándo sí se devuelve el pago",
        body: [
          "Si dos personas pagan el mismo espacio a la vez, se aplica la compra que se completó primero y a la otra se le devuelve el importe completo de forma automática.",
          "Si se produce un cobro duplicado o un cobro sin que se aplique la compra por un fallo técnico, se devuelve el importe. Escríbenos con el recibo.",
          "Los demás casos que imponga la ley.",
        ],
      },
      {
        heading: "Cómo pedir una devolución de los casos anteriores",
        body: [
          `Escribe a ${contactLabel} indicando el correo con el que pagaste, el espacio y la fecha. Si procede, la devolución se hace al mismo método de pago y puede tardar hasta 10 días laborables en reflejarse según tu banco.`,
        ],
      },
      {
        heading: "Contracargos",
        body: [
          "Antes de abrir una disputa con tu banco, escríbenos: lo solucionamos antes. Una disputa por una compra válida puede llevar a retirar el anuncio y a cerrar la cuenta.",
        ],
      },
    ],
  },
  {
    slug: "normas-de-contenido",
    title: "Normas de contenido",
    summary: "Qué se puede y qué no se puede publicar en un espacio. Aplica a nombres, textos, enlaces e imágenes.",
    sections: [
      {
        heading: "Qué no se puede publicar",
        body: [
          "Contenido ilegal o que incite a cometer delitos, incluida la apología del terrorismo, el odio o la violencia contra personas o grupos.",
          "Contenido sexual explícito, desnudos o contenido que explote a menores.",
          "Violencia gráfica, autolesiones o contenido que fomente conductas peligrosas.",
          "Fraude, suplantación de identidad, estafas, falsificaciones, esquemas piramidales y productos o servicios ilegales.",
          "Material con derechos de autor, marcas o imágenes de terceros usadas sin permiso, y datos personales de otras personas sin su consentimiento.",
          "Malware, enlaces a webs que intenten engañar o descargar software sin tu permiso.",
          "Mensajes políticos de partidos o candidatos en periodo electoral, si la ley lo prohíbe, y publicidad de productos regulados (juegos de azar, tabaco, medicamentos…) sin cumplir la normativa aplicable.",
        ],
      },
      {
        heading: "Qué ocurre si se incumplen",
        body: [
          "Resolveo puede retirar o sustituir el contenido, bloquear el espacio o cerrar la cuenta sin previo aviso y sin devolver el importe pagado. Si lo exige una autoridad, también se le comunicarán los datos necesarios.",
        ],
      },
      {
        heading: "Cómo avisar de un contenido",
        body: [
          `Si ves un anuncio que incumple estas normas o vulnera tus derechos, escribe a ${contactLabel} con el espacio (puedes copiar su enlace con «Copiar enlace»), qué incumple y, si es una cuestión de derechos, quién eres y qué derecho te asiste. Lo revisaremos con prontitud y te contestaremos.`,
        ],
      },
      {
        heading: "Enlaces patrocinados",
        body: ["Los enlaces de los anuncios se marcan como patrocinados y se abren en una pestaña nueva. Resolveo no controla las webs enlazadas."],
      },
    ],
  },
];

export function getLegalDoc(slug: string): LegalDoc | undefined {
  return legalDocs.find((doc) => doc.slug === slug);
}
