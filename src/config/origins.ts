export const ORIGIN_IDS = ["poa", "scs"] as const;

export type OriginId = (typeof ORIGIN_IDS)[number];

export type Origin = {
  id: OriginId;
  name: string;
  /** CEP with digits only. */
  cep: string;
};

export const ORIGINS: readonly Origin[] = [
  { id: "poa", name: "Porto Alegre", cep: "90660130" },
  { id: "scs", name: "Santa Cruz do Sul", cep: "96810400" },
];

export function getOrigin(id: OriginId): Origin {
  const origin = ORIGINS.find((o) => o.id === id);
  if (!origin) throw new Error(`Origem desconhecida: ${id}`);
  return origin;
}
