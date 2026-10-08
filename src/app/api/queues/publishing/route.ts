import { publishingQueue } from "@/lib/publish-jobs";
export const runtime = "nodejs";
export const maxDuration = 300;
export const POST = publishingQueue.handleCallback();
