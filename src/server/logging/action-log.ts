import { promises as fs } from "fs";
import path from "path";
import { ActionLogEntry } from "@/server/domain/types";

const runtimeDir = path.join(process.cwd(), ".runtime", "action-logs");

export async function appendActionLog(entry: ActionLogEntry) {
  await fs.mkdir(runtimeDir, { recursive: true });
  const filePath = path.join(runtimeDir, `${entry.sessionId}.jsonl`);
  await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}
