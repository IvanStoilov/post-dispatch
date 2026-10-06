import { connections } from "@/lib/meta";
export async function GET() {
  return Response.json({ ...connections(), mcp: !!process.env.MCP_TOKEN });
}
