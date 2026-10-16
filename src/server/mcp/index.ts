import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticate } from "./context";
import { registerPostTools } from "./tools/posts";
import { registerProjectTools } from "./tools/projects";
import { registerUploadTools } from "./tools/uploads";
import { oauthChallenge } from "@/lib/oauth";
import { withLogContext } from "@/lib/logger";
import { brand } from "@/lib/brand";

// The MCP endpoint (/api/mcp): authenticates the assistant, then serves
// tools that call the domain as that user. Stateless: one server per
// request.
export async function handleMcpRequest(req: Request) {
  const context = await authenticate(req);
  if (!context) {
    return oauthChallenge();
  }
  return withLogContext(context.actor, async () => {
    const server = new McpServer(
      { name: brand.name.toLowerCase(), version: "0.5.0" },
      {
        instructions:
          "You are connected to a Ramblo account. Call list_projects to discover project IDs and available channels. If there is exactly one project, tools select it automatically when projectId is omitted. If there are multiple projects, every project-specific tool requires projectId. Confirm the intended project with the user when unclear; never choose the first project. Each call checks ownership. Create drafts for human approval; do not publish. For ChatGPT files use create_draft_from_files. Use assets arrays for up to 10 images or one video.",
      },
    );
    registerProjectTools(server, context);
    registerPostTools(server, context);
    registerUploadTools(server, context);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: 1024 * 1024,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(req);
    } finally {
      await server.close();
    }
  });
}
