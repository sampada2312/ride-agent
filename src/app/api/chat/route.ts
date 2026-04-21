import { NextResponse } from "next/server";
import { z } from "zod";
import { handleChat } from "@/server/agent/runtime";

const payloadSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1)
});

export async function POST(request: Request) {
  const json = await request.json();
  const payload = payloadSchema.parse(json);
  const response = await handleChat(payload);
  return NextResponse.json(response);
}
