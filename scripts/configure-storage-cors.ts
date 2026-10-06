import { loadEnvConfig } from "@next/env";
import { GetBucketCorsCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { bucket, storage } from "../src/lib/storage";
loadEnvConfig(process.cwd());
async function main() {
  const origin = new URL(process.env.APP_URL || "http://localhost:8200").origin;
  const Bucket = await bucket();
  let rules: import("@aws-sdk/client-s3").CORSRule[];
  try {
    rules =
      (await storage().send(new GetBucketCorsCommand({ Bucket }))).CORSRules ||
      [];
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "NoSuchCORSConfiguration")
      throw error;
    rules = [];
  }
  // Preserve any existing rules belonging to other applications.
  const ID = "PostDispatchUploads";
  const old = rules.find((rule) => rule.ID === ID);
  const origins = [...new Set([...(old?.AllowedOrigins || []), origin])];
  await storage().send(
    new PutBucketCorsCommand({
      Bucket,
      CORSConfiguration: {
        CORSRules: [
          ...rules.filter((rule) => rule.ID !== ID),
          {
            ID,
            AllowedOrigins: origins,
            AllowedMethods: ["PUT", "GET", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 600,
          },
        ],
      },
    }),
  );
  console.log(`Private storage uploads enabled for ${origin}.`);
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Could not configure storage CORS",
  );
  process.exitCode = 1;
});
