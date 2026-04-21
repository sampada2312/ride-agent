import { NextResponse } from "next/server";
import { getSessionState } from "@/server/agent/runtime";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const session = getSessionState(params.id);
  return NextResponse.json(session);
}
