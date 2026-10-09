import { describe, expect, it } from "vitest";
import { formatBytes } from "./bytes";

describe("formatBytes", () => {
  it("no muestra nada mientras no hay medida", () => {
    // El visor distingue entre «aún no se ha descargado nada» y «se han
    // descargado 0 B». Devolver null permite esa distinción; devolver "0 B" la
    // borraría.
    expect(formatBytes(0)).toBeNull();
    expect(formatBytes(Number.NaN)).toBeNull();
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatBytes(-10)).toBeNull();
  });

  it("usa el separador decimal español, que es el motivo del módulo", () => {
    // El peso real del paquete publicado de Málaga. Con `.toFixed(2)` salía
    // «1.57 MB».
    expect(formatBytes(1_648_989)).toBe("1,57 MB");
  });

  it("cambia de unidad en 1024, como informa el navegador", () => {
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1 kB");
    // Descarga real de la primera vista del visor de Málaga.
    expect(formatBytes(319_443)).toBe("312 kB");
    expect(formatBytes(1024 * 1024)).toBe("1,00 MB");
  });

  it("no agrupa las cifras de cuatro dígitos, porque el español tampoco", () => {
    // Regla de CLDR para es-ES (`minimumGroupingDigits=2`): «1.023» es una
    // lectura inglesa, en español se escribe 1023. Se comprueba para que nadie
    // «arregle» este módulo añadiendo un separador que aquí sería un error.
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(9102)).toBe("9 kB");
  });
});
