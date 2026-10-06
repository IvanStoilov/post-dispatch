import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { createPost, listPosts } from "@/lib/store";
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (
    !process.env.MCP_TOKEN ||
    req.headers.get("authorization") !== `Bearer ${process.env.MCP_TOKEN}`
  )
    return Response.json(
      { error: "A valid MCP bearer token is required" },
      { status: 401 },
    );
  const server = new McpServer({ name: "post-dispatch", version: "0.1.0" });
  server.registerTool(
    "create_draft",
    {
      description:
        "Submit a draft to PostDispatch for human review. Never publishes automatically.",
      inputSchema: {
        title: z.string(),
        caption: z.string(),
        imageUrl: z.string().optional(),
        platforms: z.array(z.enum(["instagram", "facebook"])),
        source: z.string().optional(),
      },
    },
    async (input) => {
      try {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await createPost({
                  ...input,
                  source: input.source || "AI assistant",
                }),
              ),
            },
          ],
        };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: e instanceof Error ? e.message : "Invalid draft",
            },
          ],
        };
      }
    },
  );
  server.registerTool(
    "list_posts",
    {
      description: "List saved posts and publishing status",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(await listPosts()) }],
    }),
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
