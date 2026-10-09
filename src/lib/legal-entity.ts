/**
 * Datos del titular del servicio. Son datos reales de una persona o empresa: no
 * se inventan. Rellénalos cuando los tengas y todas las páginas legales, el
 * footer y la página de contacto los muestran solos. Los campos vacíos no se
 * enseñan.
 *
 *  · name     Nombre completo o razón social.
 *  · taxId    NIF / CIF.
 *  · address  Domicilio postal (calle, número, código postal, ciudad, país).
 *  · email    Correo de contacto (el que recibe avisos, reclamaciones y derechos RGPD).
 */
export const legalEntity: { name: string; taxId: string; address: string; email: string } = {
  name: "",
  taxId: "",
  address: "",
  email: "contacto.webproyectos@gmail.com",
};

/** Fecha de la última revisión de los textos legales. */
export const LEGAL_UPDATED = "10 de octubre de 2026";

export const hasContactEmail = legalEntity.email !== "";

/** Correo al que escribir, o una frase neutra mientras no esté definido. */
export const contactLabel = legalEntity.email || "el correo de contacto indicado en el aviso legal";
