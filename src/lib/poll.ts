import { MarketError, getMarketStore } from "@/lib/market/service";
import type { PollTally, PollVoteResult } from "@/lib/market/store";

/**
 * Encuesta de la próxima ciudad. Una persona, un voto (puede cambiarlo): quien ha iniciado sesión vota
 * con su cuenta; el resto, con un identificador aleatorio en una cookie. Para que no se pueda inflar
 * borrando cookies, cada origen (huella de la IP, nunca la IP) admite como mucho 5 votantes distintos al día.
 */

export type PollView = {
  options: Array<{ id: string; label: string; votes: number }>;
  total: number;
  /** Opción elegida por quien consulta, o `null`. */
  mine: string | null;
};

let tallyCache: { at: number; value: PollTally } | null = null;
export const invalidatePoll = (): void => {
  tallyCache = null;
};

/** Resultados con las opciones visibles (la lectura se guarda 5 s en memoria; votar la vacía). */
export async function getPoll(voterKey: string | null): Promise<PollView> {
  const store = await getMarketStore();
  if (!tallyCache || Date.now() - tallyCache.at > 5_000) tallyCache = { at: Date.now(), value: await store.pollTally() };
  const visible = tallyCache.value.options.filter((option) => option.active);
  return {
    options: visible.map(({ id, label, votes }) => ({ id, label, votes })),
    total: visible.reduce((sum, option) => sum + option.votes, 0),
    mine: voterKey ? await store.myVote(voterKey) : null,
  };
}

export async function castPollVote(voterKey: string, optionId: string, ipHash: string): Promise<PollVoteResult> {
  const store = await getMarketStore();
  const result = await store.castVote(voterKey, optionId, ipHash);
  invalidatePoll();
  return result;
}

export function pollError(result: PollVoteResult): MarketError | null {
  if (result === "unknown") return new MarketError("Esa ciudad no está en la encuesta.", 404);
  if (result === "limit") return new MarketError("Se han registrado demasiados votos desde esta conexión hoy. Inténtalo mañana.", 429);
  return null;
}
