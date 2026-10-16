import { z } from "zod";
import { platforms } from "@/shared/platforms";
import { assetInputSchema, openaiFileSchema } from "@/shared/schemas/asset";

// Tool input schemas. The MCP SDK validates arguments against them and
// advertises them as JSON Schema, so they avoid transforms; tools normalize
// with the shared input schemas before calling the domain.

export const projectFields = {
  projectId: z
    .uuid()
    .optional()
    .describe(
      "Destination project ID. Optional only when this account has exactly one project; otherwise required. Discover IDs with list_projects.",
    ),
};

const draftFields = {
  title: z.string().trim().min(1).max(120),
  caption: z.string().trim().min(1).max(2200),
  platforms: z.array(z.enum(platforms)).min(1).max(platforms.length),
  source: z
    .string()
    .describe("ChatGPT for ChatGPT agent, Claude for Claude, etc.")
    .trim()
    .min(1)
    .max(60)
    .optional(),
};
export const mcpDraftSchema = z
  .object({
    ...draftFields,
    assets: z.array(assetInputSchema).min(1).max(10).optional(),
  })
  .strict()
  .refine(
    (v) => !v.assets?.some((a) => a.kind === "VIDEO") || v.assets.length === 1,
    "Provide multiple images or one video",
  );
export const filesDraftSchema = z
  .object({ ...draftFields, assets: z.array(openaiFileSchema).min(1).max(10) })
  .strict();
