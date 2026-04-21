import OpenAI from "openai";
import { z } from "zod";
import { AgentBrain, AgentContext } from "@/server/agent/types";
import { deterministicRideBrain } from "@/server/agent/deterministic-brain";

const actionSchema = z.object({
  response: z.string().min(1)
});

export class OpenAIRideBrain implements AgentBrain {
  private client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  async reply(input: string, context: AgentContext) {
    if (!process.env.OPENAI_API_KEY) {
      return deterministicRideBrain.reply(input, context);
    }

    const currentOptions = context.session.rideOptions
      .map((option) => `${option.productName} $${(option.priceCents / 100).toFixed(2)}`)
      .join(", ");

    const response = await this.client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You are an Uber-like ride booking assistant. Never say a ride is booked unless the external confirmation gate executes it. Keep answers concise and safe."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `User message: ${input}\nKnown ride options: ${currentOptions || "none"}\nPending proposal: ${
                context.session.pendingProposal?.summary ?? "none"
              }\nReturn a short natural-language response only.`
            }
          ]
        }
      ]
    });

    const parsed = actionSchema.safeParse({
      response: response.output_text?.trim() || ""
    });

    if (!parsed.success) {
      return deterministicRideBrain.reply(input, context);
    }

    return deterministicRideBrain.reply(`${input}\n${parsed.data.response}`, context);
  }
}

export function getAgentBrain() {
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIRideBrain();
  }

  return deterministicRideBrain;
}
