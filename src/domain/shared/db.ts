import "server-only";
import { getDb } from "@/db";

export type Db = ReturnType<typeof getDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
// Repository functions accept either, so services decide the transaction.
export type Executor = Db | Tx;
