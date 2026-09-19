/**
 * Produtos com embalagem conhecida: o usuário informa só a quantidade e o app
 * monta os volumes. As unidades são empilhadas na altura, sobre uma base fixa.
 */
export type ProductPreset = {
  id: string;
  name: string;
  /** Base fixa do pacote, em cm. */
  width: number;
  length: number;
  /** Quanto uma unidade acrescenta na altura, em cm. */
  unitHeight: number;
  /** Peso de uma unidade, em kg. */
  unitWeight: number;
  /** Valor declarado de uma unidade, em R$. */
  unitPrice: number;
  /** Quantas unidades cabem em um único volume. */
  maxPerVolume: number;
};

export const TRIBAND: ProductPreset = {
  id: "triband",
  name: "Triband",
  width: 22,
  length: 32,
  unitHeight: 2.4,
  unitWeight: 1.05,
  unitPrice: 135,
  maxPerVolume: 15,
};

export const PRODUCT_PRESETS: readonly ProductPreset[] = [TRIBAND];
