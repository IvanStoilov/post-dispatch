export const site = {
  name: "PostDispatch",
  operator: "Growth Optimize SL",
  country: "Spain",
  email: "hello@growthlens.io",
  address:
    process.env.COMPANY_REGISTERED_ADDRESS ||
    "Av. de la Pineda 2, 08860 Castelldefels, Barcelona, Spain",
  taxId: process.env.COMPANY_TAX_ID || "B23991748",
  registry:
    process.env.COMPANY_REGISTRY_DETAILS || "Registro Mercantil de Barcelona",
  updated: "2026-10-07",
};
export const siteOrigin = () =>
  new URL(process.env.APP_URL || "http://localhost:8200").origin;
