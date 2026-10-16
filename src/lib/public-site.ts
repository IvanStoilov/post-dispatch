import { brand } from "./brand";
import { config } from "./config";
import { publicOrigin } from "./origins";

export const site = {
  name: brand.name,
  operator: "Ivan Sashov Stoilov",
  country: "Spain",
  email: brand.email,
  address: config.COMPANY_REGISTERED_ADDRESS,
  taxId: config.COMPANY_TAX_ID,
  registry: config.COMPANY_REGISTRY_DETAILS,
  updated: "2026-10-15",
};
export const siteOrigin = publicOrigin;
