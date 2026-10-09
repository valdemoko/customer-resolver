import { describe, expect, it } from "vitest";
import {
  MoneyError,
  centsToDecimalString,
  formatCents,
  nextPriceCents,
  priceLadderCents,
  roundHalfUpDiv,
  stripeFeeCents,
  sumCents,
} from "./money";

describe("roundHalfUpDiv", () => {
  it("redondea 0,5 siempre hacia arriba", () => {
    expect(roundHalfUpDiv(1, 2)).toBe(1);
    expect(roundHalfUpDiv(3, 2)).toBe(2);
    expect(roundHalfUpDiv(10, 4)).toBe(3);
    expect(roundHalfUpDiv(6, 4)).toBe(2);
  });

  it("es exacto con los casos que más se rompen en coma flotante", () => {
    // Sin enteros, 156 * 1.25 da 195.00000000000003 en coma flotante.
    expect(roundHalfUpDiv(156 * 125, 100)).toBe(195);
    expect(roundHalfUpDiv(244 * 125, 100)).toBe(305);
  });

  it("rechaza denominadores impares, porque el half-up dejaría de ser exacto", () => {
    expect(() => roundHalfUpDiv(1, 3)).toThrow(MoneyError);
  });
});

describe("nextPriceCents", () => {
  it("sigue la serie canónica del pliego: 100 → 125 → 156 → 195", () => {
    expect(nextPriceCents(100)).toBe(125);
    expect(nextPriceCents(125)).toBe(156);
    expect(nextPriceCents(156)).toBe(195);
  });

  it("equivale a round_half_up(actual × 125 / 100) en el rango de precios real", () => {
    for (const value of [4, 99, 100, 137, 1000, 12_345, 999_999]) {
      const expected = Math.round((value * 125) / 100 + Number.EPSILON);
      expect(nextPriceCents(value)).toBe(expected);
    }
  });

  it("aplica un suelo de +1 céntimo cuando el 25 % redondearía al mismo valor", () => {
    // Regresión: sin el suelo, 1 → 1 y el precio quedaría congelado.
    expect(nextPriceCents(1)).toBe(2);
    expect(nextPriceCents(2)).toBe(3);
    expect(nextPriceCents(3)).toBe(4);
    // A partir de 4 el 25 % ya supera el céntimo entero.
    expect(nextPriceCents(4)).toBe(5);
  });

  it("siempre devuelve un entero de céntimos estrictamente mayor", () => {
    let current = 1;
    // 100 reventas encadenadas: ~4,9e9 céntimos, todavía dentro del rango
    // entero seguro de JavaScript.
    for (let i = 0; i < 100; i += 1) {
      const next = nextPriceCents(current);
      expect(Number.isInteger(next)).toBe(true);
      expect(next).toBeGreaterThan(current);
      current = next;
    }
  });

  it("rechaza el desbordamiento en lugar de devolver un número impreciso", () => {
    let current = 1;
    let overflowed = false;
    for (let i = 0; i < 500; i += 1) {
      try {
        current = nextPriceCents(current);
      } catch (error) {
        overflowed = true;
        expect(error).toBeInstanceOf(MoneyError);
        break;
      }
    }
    expect(overflowed).toBe(true);
  });

  it("nunca devuelve un valor con decimales", () => {
    for (let value = 1; value <= 5000; value += 7) {
      expect(Number.isInteger(nextPriceCents(value))).toBe(true);
    }
  });

  it("rechaza entradas que no son enteros de céntimos", () => {
    expect(() => nextPriceCents(100.5)).toThrow(MoneyError);
    expect(() => nextPriceCents(-1)).toThrow(MoneyError);
    expect(() => nextPriceCents(0)).toThrow(MoneyError);
    expect(() => nextPriceCents(Number.NaN)).toThrow(MoneyError);
    expect(() => nextPriceCents(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });
});

describe("priceLadderCents", () => {
  it("devuelve la escalera completa con el precio base incluido", () => {
    expect(priceLadderCents(100, 4)).toEqual([100, 125, 156, 195]);
  });

  it("con count = 1 devuelve solo el precio base", () => {
    expect(priceLadderCents(250, 1)).toEqual([250]);
  });

  it("es estrictamente creciente", () => {
    const ladder = priceLadderCents(80, 25);
    for (let i = 1; i < ladder.length; i += 1) {
      expect(ladder[i]!).toBeGreaterThan(ladder[i - 1]!);
    }
  });

  it("rechaza un recuento inválido", () => {
    expect(() => priceLadderCents(100, 0)).toThrow(MoneyError);
    expect(() => priceLadderCents(100, 2.5)).toThrow(MoneyError);
  });
});

describe("sumCents", () => {
  it("suma sin perder céntimos", () => {
    expect(sumCents([100, 125, 156])).toBe(381);
    expect(sumCents([])).toBe(0);
  });

  it("rechaza importes no enteros", () => {
    expect(() => sumCents([100, 0.5])).toThrow(MoneyError);
  });
});

describe("presentación", () => {
  it("formatCents usa el separador del idioma indicado", () => {
    // Se normaliza el espacio duro que inserta Intl en es-ES.
    expect(formatCents(1250, "es-ES").replace(/\u00a0/g, " ")).toBe("12,50 €");
  });

  it("centsToDecimalString es canónico y sin símbolo", () => {
    expect(centsToDecimalString(1250)).toBe("12.50");
    expect(centsToDecimalString(105)).toBe("1.05");
    expect(centsToDecimalString(100)).toBe("1.00");
  });
});

describe("stripeFeeCents", () => {
  it("aplica 1,5 % + 0,25 € por defecto", () => {
    expect(stripeFeeCents(1000)).toBe(40); // 15 + 25
    expect(stripeFeeCents(10_000)).toBe(175); // 150 + 25
  });

  it("permite tarifas distintas para el informe de viabilidad", () => {
    // 2,90 % de 100,00 € = 2,90 € más 0,30 € fijos.
    expect(stripeFeeCents(10_000, 290, 30)).toBe(320);
  });
});
