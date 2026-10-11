import { config } from "./config";
export const site = {
  name: "PostDispatch",
  operator: "Growth Optimize SL",
  country: "Spain",
  email: "hello@growthlens.io",
  address: config.COMPANY_REGISTERED_ADDRESS,
  taxId: config.COMPANY_TAX_ID,
  registry: config.COMPANY_REGISTRY_DETAILS,
  updated: "2026-10-07",
};
export const siteOrigin = () => config.APP_URL;
