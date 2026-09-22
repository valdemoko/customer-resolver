/**
 * Airport resolution for distance-based rights (Art. 7 Reglamento 261/2004).
 *
 * Why this exists: the flight questionnaire asks for the airport and accepts what
 * a passenger actually knows — "Madrid", "Barajas", "MAD". The analysis, however,
 * needs coordinates to compute the great-circle distance that decides the
 * compensation tier. With a raw lookup by IATA code, an answer written as a city
 * resolved to nothing: no distance ⇒ no tier ⇒ the report asked the user for a
 * fact (`flight.compensation_tier`) they could not possibly answer, forever.
 *
 * So resolution is now explicit and testable: normalise the answer (case,
 * accents, punctuation, airport name or city) and map it onto one of the
 * coordinates below. Unresolvable input returns null — the caller reports it
 * honestly instead of guessing a distance.
 *
 * Coordinates are the published airport reference points, rounded to 4 decimals
 * (≈11 m), which is far below the 1500/3500 km tier thresholds they feed.
 *
 * PURE data + pure functions: no I/O, no clock.
 */

export interface AirportCoordinate {
  /** Canonical IATA code of the airport the answer resolved to. */
  readonly code: string;
  readonly lat: number;
  readonly lon: number;
}

interface AirportEntry {
  readonly code: string;
  readonly lat: number;
  readonly lon: number;
  /** Extra spellings accepted for this airport: city, airport name, aliases. */
  readonly aliases: readonly string[];
}

/**
 * Airports covered by name resolution. Spanish airports first (the market this
 * service resolves cases for), then the European and long-haul destinations that
 * appear in real consumer claims.
 */
const AIRPORTS: readonly AirportEntry[] = [
  // ── España ────────────────────────────────────────────────────────
  { code: "MAD", lat: 40.4983, lon: -3.5676, aliases: ["madrid", "barajas", "madrid barajas", "adolfo suarez madrid barajas", "adolfo suarez"] },
  { code: "BCN", lat: 41.2974, lon: 2.0833, aliases: ["barcelona", "el prat", "barcelona el prat", "josep tarradellas"] },
  { code: "VLC", lat: 39.4914, lon: -0.4732, aliases: ["valencia", "manises"] },
  { code: "SVQ", lat: 37.3902, lon: -5.8765, aliases: ["sevilla", "seville", "san pablo"] },
  { code: "AGP", lat: 36.6749, lon: -4.4991, aliases: ["malaga", "costa del sol"] },
  { code: "PMI", lat: 39.5517, lon: 2.7388, aliases: ["palma", "palma de mallorca", "mallorca", "son sant joan"] },
  { code: "IBZ", lat: 38.8729, lon: 1.3731, aliases: ["ibiza", "eivissa"] },
  { code: "LPA", lat: 27.9319, lon: -15.3866, aliases: ["gran canaria", "las palmas", "las palmas de gran canaria"] },
  { code: "TFN", lat: 28.4827, lon: -16.3415, aliases: ["tenerife norte", "tenerife", "los rodeos"] },
  { code: "TFS", lat: 28.0443, lon: -16.5725, aliases: ["tenerife sur", "tenerife sur reina sofia"] },
  { code: "ACE", lat: 28.9455, lon: -13.6052, aliases: ["lanzarote", "arrecife"] },
  { code: "FUE", lat: 28.4527, lon: -13.8638, aliases: ["fuerteventura", "el mattoral", "puerto del rosario"] },
  { code: "BIO", lat: 43.3011, lon: -2.9106, aliases: ["bilbao", "lujua", "sondika"] },
  { code: "SCQ", lat: 42.8963, lon: -8.4151, aliases: ["santiago", "santiago de compostela", "lavacolla"] },
  { code: "VGO", lat: 42.2318, lon: -8.6268, aliases: ["vigo", "peinador"] },
  { code: "OVD", lat: 43.5636, lon: -6.0346, aliases: ["asturias", "oviedo", "asturias oviedo"] },
  { code: "SDR", lat: 43.4271, lon: -3.82, aliases: ["santander", "parayas"] },
  { code: "ZAZ", lat: 41.6662, lon: -1.0416, aliases: ["zaragoza"] },
  { code: "PNA", lat: 42.77, lon: -1.6463, aliases: ["pamplona", "noain"] },
  { code: "LEN", lat: 42.5896, lon: -5.6557, aliases: ["leon", "virgen del camino"] },
  { code: "VLL", lat: 41.7061, lon: -4.8519, aliases: ["valladolid", "villanubla"] },
  { code: "ABC", lat: 38.9485, lon: -1.8635, aliases: ["albacete", "los llanos"] },
  { code: "GRX", lat: 37.1887, lon: -3.7774, aliases: ["granada", "granada jaen"] },
  { code: "XRY", lat: 36.7446, lon: -6.0601, aliases: ["jerez", "jerez de la frontera", "la parra"] },
  { code: "ALC", lat: 38.2822, lon: -0.5582, aliases: ["alicante", "elche", "el altet", "alicante elche"] },
  { code: "RMU", lat: 37.803, lon: -1.1252, aliases: ["murcia", "corvera", "murcia corvera", "san javier"] },
  { code: "MJV", lat: 37.775, lon: -0.8124, aliases: ["cartagena", "marcos"] },
  { code: "LEI", lat: 36.8439, lon: -2.3701, aliases: ["almeria"] },
  { code: "LCG", lat: 43.3021, lon: -8.3772, aliases: ["a coruna", "coruna", "la coruna", "alvedro"] },
  { code: "REU", lat: 41.1474, lon: 1.1672, aliases: ["reus", "tarragona"] },
  { code: "GRO", lat: 41.901, lon: 2.7606, aliases: ["girona", "girona costa brava"] },

  // ── Europa ────────────────────────────────────────────────────────
  { code: "CDG", lat: 49.0097, lon: 2.5479, aliases: ["paris", "paris charles de gaulle", "charles de gaulle", "roissy"] },
  { code: "ORY", lat: 48.7262, lon: 2.3652, aliases: ["paris orly", "orly"] },
  { code: "FCO", lat: 41.8003, lon: 12.2389, aliases: ["roma", "rome", "fiumicino", "roma fiumicino"] },
  { code: "MXP", lat: 45.63, lon: 8.7231, aliases: ["milan", "milano", "malpensa"] },
  { code: "FRA", lat: 50.0379, lon: 8.5622, aliases: ["frankfurt", "francfurt"] },
  { code: "MUC", lat: 48.3537, lon: 11.775, aliases: ["munich", "muenchen", "munchen"] },
  { code: "BER", lat: 52.3667, lon: 13.5033, aliases: ["berlin", "berlin brandeburgo"] },
  { code: "AMS", lat: 52.3105, lon: 4.7683, aliases: ["amsterdam", "schiphol", "amsterdam schiphol"] },
  { code: "LHR", lat: 51.47, lon: -0.4543, aliases: ["londres", "london", "heathrow", "londres heathrow"] },
  { code: "LGW", lat: 51.1537, lon: -0.1821, aliases: ["gatwick", "londres gatwick"] },
  { code: "STN", lat: 51.885, lon: 0.235, aliases: ["stansted", "londres stansted"] },
  { code: "LTN", lat: 51.8747, lon: -0.3683, aliases: ["luton", "londres luton"] },
  { code: "LIS", lat: 38.7756, lon: -9.1354, aliases: ["lisboa", "lisbon"] },
  { code: "OPO", lat: 41.2481, lon: -8.6814, aliases: ["oporto", "porto", "francisco sa carneiro"] },
  { code: "FAO", lat: 37.0144, lon: -7.9659, aliases: ["faro", "algarve"] },
  { code: "ZRH", lat: 47.4647, lon: 8.5492, aliases: ["zurich", "zuerich"] },
  { code: "GVA", lat: 46.2381, lon: 6.109, aliases: ["ginebra", "geneva", "geneve"] },
  { code: "VIE", lat: 48.1103, lon: 16.5697, aliases: ["viena", "vienna", "wien"] },
  { code: "BRU", lat: 50.9014, lon: 4.4844, aliases: ["bruselas", "brussels", "bruxelles"] },
  { code: "CPH", lat: 55.618, lon: 12.6508, aliases: ["copenhague", "copenhagen", "kastrup"] },
  { code: "ARN", lat: 59.6519, lon: 17.9186, aliases: ["estocolmo", "stockholm", "arlanda"] },
  { code: "OSL", lat: 60.1939, lon: 11.1004, aliases: ["oslo", "gardermoen"] },
  { code: "HEL", lat: 60.3172, lon: 24.9633, aliases: ["helsinki", "vantaa"] },
  { code: "DUB", lat: 53.4264, lon: -6.2499, aliases: ["dublin"] },
  { code: "ATH", lat: 37.9364, lon: 23.9475, aliases: ["atenas", "athens", "eleftherios venizelos"] },
  { code: "WAW", lat: 52.1657, lon: 20.9671, aliases: ["varsovia", "warsaw", "warszawa", "chopin"] },
  { code: "PRG", lat: 50.1008, lon: 14.26, aliases: ["praga", "prague", "praha", "vaclav havel"] },
  { code: "BUD", lat: 47.4369, lon: 19.2556, aliases: ["budapest", "ferenc liszt"] },
  { code: "OTP", lat: 44.5722, lon: 26.1022, aliases: ["bucarest", "bucharest", "henri coanda"] },
  { code: "IST", lat: 41.2753, lon: 28.7519, aliases: ["estambul", "istanbul", "ataturk"] },
  { code: "SAW", lat: 40.8986, lon: 29.3092, aliases: ["sabiha gokcen", "estambul sabiha"] },

  // ── Latinoamérica y largo radio ───────────────────────────────────
  { code: "JFK", lat: 40.6413, lon: -73.7781, aliases: ["nueva york", "new york", "john f kennedy"] },
  { code: "EWR", lat: 40.6895, lon: -74.1745, aliases: ["newark", "nueva york newark"] },
  { code: "MIA", lat: 25.7959, lon: -80.287, aliases: ["miami"] },
  { code: "LAX", lat: 33.9416, lon: -118.4085, aliases: ["los angeles"] },
  { code: "YYZ", lat: 43.6777, lon: -79.6248, aliases: ["toronto", "pearson"] },
  { code: "MEX", lat: 19.4363, lon: -99.0721, aliases: ["ciudad de mexico", "mexico df", "benito juarez"] },
  { code: "CUN", lat: 21.0365, lon: -86.8771, aliases: ["cancun"] },
  { code: "BOG", lat: 4.7016, lon: -74.1469, aliases: ["bogota", "el dorado"] },
  { code: "LIM", lat: -12.0219, lon: -77.1143, aliases: ["lima", "jorge chavez"] },
  { code: "EZE", lat: -34.8222, lon: -58.5358, aliases: ["buenos aires", "ezeiza"] },
  { code: "SCL", lat: -33.393, lon: -70.7858, aliases: ["santiago de chile", "arturo merino benitez"] },
  { code: "GRU", lat: -23.4356, lon: -46.4731, aliases: ["sao paulo", "guarulhos"] },
  { code: "DOH", lat: 25.2731, lon: 51.6081, aliases: ["doha", "hamad"] },
  { code: "DXB", lat: 25.2532, lon: 55.3657, aliases: ["dubai"] },
  { code: "NRT", lat: 35.7647, lon: 140.3864, aliases: ["tokio", "tokyo", "narita"] },
];

/**
 * Normalise a free-text answer: uppercase, no accents, single spaces, and only
 * letters/digits/spaces left (so "MAD-Barajas, T4" → "MAD BARAJAS T4").
 */
export function normalizeAirportInput(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Resolve a user-written airport into coordinates, or null when it cannot be
 * recognised. Accepts an IATA code (exact) or a known airport/city name.
 */
export function resolveAirport(input: string): AirportCoordinate | null {
  const normalized = normalizeAirportInput(input);
  if (normalized.length === 0) return null;

  for (const airport of AIRPORTS) {
    if (normalizeAirportInput(airport.code) === normalized) return toCoordinate(airport);
  }
  for (const airport of AIRPORTS) {
    for (const alias of airport.aliases) {
      if (normalizeAirportInput(alias) === normalized) return toCoordinate(airport);
    }
  }
  // A code used together with other words ("MAD, terminal 4", "MAD - Madrid",
  // the suggestions this module offers): the leading IATA token decides.
  const leadingCode = normalized.split(" ")[0] ?? "";
  if (leadingCode.length === 3) {
    for (const airport of AIRPORTS) {
      if (airport.code === leadingCode) return toCoordinate(airport);
    }
  }

  // "MADRID BARAJAS T4" → also accept when the answer *contains* the airport
  // name, but only for names long enough not to collide by accident.
  for (const airport of AIRPORTS) {
    for (const alias of airport.aliases) {
      const a = normalizeAirportInput(alias);
      if (a.length >= 5 && normalized.includes(a)) return toCoordinate(airport);
    }
  }

  return null;
}

function toCoordinate(entry: AirportEntry): AirportCoordinate {
  return { code: entry.code, lat: entry.lat, lon: entry.lon };
}

/**
 * Suggestions for the airport question: the code plus the name people know,
 * written the way it is displayed ("MAD — Madrid"). They are suggestions, not a
 * closed list: the answer is resolved by code, city or airport name.
 */
export function airportOptions(): readonly string[] {
  const options = new Set<string>();
  for (const airport of AIRPORTS) {
    const name = airport.aliases[0] ?? airport.code;
    const display = name.charAt(0).toUpperCase() + name.slice(1);
    options.add(`${airport.code} — ${display}`);
  }
  return [...options];
}
