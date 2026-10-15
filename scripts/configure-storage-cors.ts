import { appOrigin } from "../src/lib/origins";
import { loadEnvConfig } from "@next/env";
import { GetBucketCorsCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../src/lib/storage/providers/s3";
import { requireConfig } from "../src/lib/config";

loadEnvConfig(process.cwd());

async function main() {
  const origin = new URL(appOrigin()).origin;
  const Bucket = requireConfig("AWS_S3_BUCKET");
  let rules: import("@aws-sdk/client-s3").CORSRule[];
  try {
    rules =
      (await s3Client().send(new GetBucketCorsCommand({ Bucket }))).CORSRules ||
      [];
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "NoSuchCORSConfiguration")
      throw error;
    rules = [];
  }
  // Preserve any existing rules belonging to other applications.
  // Existing rule ID must stay stable to update its allowed origins in place.
  const ID = "PostDispatchUploads";
  const old = rules.find((rule) => rule.ID === ID);
  const origins = [...new Set([...(old?.AllowedOrigins || []), origin])];
  await s3Client().send(
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
