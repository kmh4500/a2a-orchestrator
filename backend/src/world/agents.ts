import { A2AClient } from "@a2a-js/sdk/client";
import { MessageSendParams, Message as A2AMessage } from "@a2a-js/sdk";
import { v4 as uuidv4 } from "uuid";
import { Message, AgentPersona } from "../types";

// Define 4 distinct agent personas with A2A URLs
export const AGENT_PERSONAS: AgentPersona[] = [
  {
    name: "류성룡",
    role: "영의정",
    a2aUrl: process.env.AGENT_RYU_SEONG_RYONG_URL || "https://example.com/agent/ryu-seong-ryong",
    color: "bg-blue-100 border-blue-400",
  },
  {
    name: "류운룡",
    role: "유학자",
    a2aUrl: process.env.AGENT_RYU_UN_RYONG_URL || "https://example.com/agent/ryu-un-ryong",
    color: "bg-purple-100 border-purple-400",
  },
  {
    name: "깨비",
    role: "도깨비",
    a2aUrl: process.env.AGENT_GGAEBI_URL || "https://example.com/agent/ggaebi",
    color: "bg-green-100 border-green-400",
  },
  {
    name: "호랭",
    role: "수호신",
    a2aUrl: process.env.AGENT_HORAENG_URL || "https://example.com/agent/horaeng",
    color: "bg-amber-100 border-amber-400",
  },
];

export class Agent {
  private persona: AgentPersona;
  private a2aClient: A2AClient | null = null;
  private contextId: string | undefined;

  constructor(persona: AgentPersona) {
    this.persona = persona;
  }

  getName(): string {
    return this.persona.name;
  }

  getPersona(): AgentPersona {
    return this.persona;
  }

  private async getClient(): Promise<A2AClient> {
    if (!this.a2aClient) {
      console.log(`[${this.persona.name}] Initializing A2A client from: ${this.persona.a2aUrl}`);
      this.a2aClient = await A2AClient.fromCardUrl(this.persona.a2aUrl);
    }
    return this.a2aClient;
  }

  async respond(history: Message[], recentMessage: Message, currentBlock: string = ""): Promise<string> {
    // Build user prompt with block and new message
    let userPrompt = "";

    if (currentBlock) {
      userPrompt += `[Conversation Summary So Far]:\n${currentBlock}\n\n`;
    }

    userPrompt += `[New Message]:\n${recentMessage.speaker}: ${recentMessage.content}\n\n`;
    userPrompt += `How would you respond in this situation?\n\n`;
    userPrompt += `Important: Only respond with your dialogue. Output only your own words.`;

    try {
      console.log(`\n[${this.persona.name}] Requesting response via A2A...`);

      const client = await this.getClient();

      // Prepare A2A message
      const a2aMessage: A2AMessage = {
        kind: "message",
        messageId: uuidv4(),
        role: "user",
        parts: [{ kind: "text", text: userPrompt }],
      };

      // Include contextId if available for conversation continuity
      if (this.contextId) {
        a2aMessage.contextId = this.contextId;
      }

      const sendParams: MessageSendParams = {
        message: a2aMessage,
      };

      // Send message via A2A protocol
      const response = await client.sendMessage(sendParams);

      console.log(`[${this.persona.name}] Raw A2A response:`, JSON.stringify(response, null, 2));

      let responseText = "Agent received your message but did not respond.";
      let responseMessage = null;

      // Parse response (handle different JSON-RPC formats)
      if (response && typeof response === "object") {
        if ("result" in response && response.result && typeof response.result === "object" && "kind" in response.result) {
          responseMessage = response.result;
        } else if ("result" in response && response.result && typeof response.result === "object" && "message" in response.result) {
          responseMessage = response.result.message;
        } else if ("message" in response) {
          responseMessage = response.message;
        }
      }

      // Extract response text and contextId
      if (responseMessage && typeof responseMessage === "object") {
        if ("contextId" in responseMessage && typeof responseMessage.contextId === "string") {
          this.contextId = responseMessage.contextId;
        }

        if ("parts" in responseMessage && Array.isArray(responseMessage.parts)) {
          const textParts = responseMessage.parts.filter((part: unknown) => {
            return part &&
                   typeof part === "object" &&
                   "kind" in part &&
                   part.kind === "text" &&
                   "text" in part;
          });
          if (textParts.length > 0) {
            responseText = textParts.map((part: unknown) => {
              const textPart = part as { text: string };
              return textPart.text || "";
            }).join(" ").trim();
          }
        } else if ("text" in responseMessage && typeof responseMessage.text === "string") {
          responseText = responseMessage.text;
        }
      }

      console.log(`\n=== ${this.persona.name} response ===`);
      console.log(responseText);
      console.log(`=== ${this.persona.name} done ===\n`);

      return responseText;
    } catch (error) {
      console.error(`Error generating response for ${this.persona.name}:`, error);
      throw error;
    }
  }
}
