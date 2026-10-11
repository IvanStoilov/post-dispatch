import { config } from "./config";
import { applicationPath } from "./route-paths";

export const appOrigin = () =>
  config.VERCEL_ENV === "production" ? config.APPLICATION_URL : config.APP_URL;
export const publicOrigin = () =>
  config.VERCEL_ENV === "production" ? config.PUBLIC_URL : config.APP_URL;
export const isCleanAppHost = (host: string | null) =>
  host === new URL(config.APPLICATION_URL).host;
export const appPagePath = (path = "/") =>
  applicationPath(path, isCleanAppHost(new URL(appOrigin()).host));
export const appPageUrl = (path = "/") =>
  new URL(appPagePath(path), appOrigin()).toString();
