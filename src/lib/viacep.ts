export type CepInfo = { city: string; state: string; street: string; district: string };

/** Looks up a CEP (8 digits) on ViaCEP. Resolves to null when unknown; rejects on network errors. */
export async function lookupCep(cep: string, signal?: AbortSignal): Promise<CepInfo | null> {
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    erro?: boolean;
    localidade?: string;
    uf?: string;
    logradouro?: string;
    bairro?: string;
  };
  if (data.erro || !data.localidade || !data.uf) return null;
  // CEPs of whole cities have no street or district; the form then asks for them.
  return { city: data.localidade, state: data.uf, street: data.logradouro ?? "", district: data.bairro ?? "" };
}
