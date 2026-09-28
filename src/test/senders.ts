/** Fictitious senders for tests; same shape as the SENDERS_JSON environment variable. */
const base = {
  name: "Empresa Ficticia LTDA",
  phone: "5133334444",
  email: "expedicao@example.com",
  companyDocument: "46867029000176",
  stateRegister: "1234567890",
  economicActivityCode: "4687701",
  stateAbbr: "RS",
};

export const TEST_SENDERS = {
  poa: { ...base, address: "Rua do Remetente", number: "81", district: "Medianeira", city: "Porto Alegre", postalCode: "90660130" },
  scs: { ...base, address: "Travessa Ficticia", number: "39", district: "Centro", city: "Santa Cruz do Sul", postalCode: "96810400" },
};

export const TEST_SENDERS_JSON = JSON.stringify(TEST_SENDERS);
