import { NextResponse } from "next/server";
import { z } from "zod";
import { handleConfirmation } from "@/server/agent/runtime";

const payloadSchema = z.object({
  sessionId: z.string().min(1),
  proposalId: z.string().min(1),
  approved: z.boolean()
});

export async function POST(request: Request) {
  const json = await request.json();
  const payload = payloadSchema.parse(json);
  const response = await handleConfirmation(payload);
  return NextResponse.json(response);
}
