/**
 * NF-e access key: 44 digits, the last one a mod-11 check digit over the first 43.
 * Positions 21-22 are the fiscal document model; Melhor Envio only accepts model 55.
 */
export function isValidNfeKey(value: string): boolean {
  const key = value.replace(/\D/g, "");
  if (key.length !== 44 || key.slice(20, 22) !== "55") return false;
  let weight = 2;
  let sum = 0;
  for (let i = 42; i >= 0; i--) {
    sum += Number(key[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return (rest < 2 ? 0 : 11 - rest) === Number(key[43]);
}
