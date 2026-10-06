export async function POST() {
  return Response.json(
    { error: "Use /api/mcp/<projectId> from your project settings" },
    { status: 400 },
  );
}
