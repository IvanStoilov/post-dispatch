import { loggedOperation } from "../logger";
import type { ConnectorRow } from "../../db/schema";
import type { PublishState } from "./types";
import { metaRequest } from "../meta-client";

// An exact ID can be checked safely. Caption/time matching cannot establish
// identity and must never authorize a second publish after a lost response.
export async function reconcileSubmission(
  connection: ConnectorRow,
  state: PublishState,
  signal: AbortSignal,
): Promise<string> {
  return loggedOperation(
    "lib.connectors.reconcile.reconcileSubmission",
    {},
    async () => {
      if (connection.provider === "instagram" && state.containerId) {
        const host =
          connection.metadata.apiHost === "graph.instagram.com"
            ? "graph.instagram.com"
            : "graph.facebook.com";
        const { response, data } = await metaRequest(
          `https://${host}/${process.env.META_API_VERSION || "v25.0"}/${state.containerId}?fields=status_code,status`,
          connection.accessToken,
          signal,
        );
        if (!response.ok || data.error)
          throw new Error("Could not reconcile Instagram container");
        if (data.status_code === "PUBLISHED")
          return "Instagram confirms this container was published, but the post ID was not saved. Check the account; do not resubmit.";
        return `Instagram container status: ${data.status_code || "unknown"}. The submission outcome remains uncertain. Check the account before taking further action.`;
      }
      return "The provider did not return a saved post ID. Automatic reconciliation cannot establish the outcome safely. Check the account; do not resubmit automatically.";
    },
  );
}
