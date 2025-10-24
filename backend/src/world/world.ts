import { Agent, AGENT_PERSONAS } from "./agents";
import { Message } from "../types";
import https from "https";
import RequestManager from "./requestManager";
import { MessageDAG } from "./messageDAG";
import { Verifier } from "./verifier";

// Create a custom agent that allows self-signed certificates
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

export class World {
  private agents: Agent[];
  private messageDAG: MessageDAG;
  private verifier: Verifier;
  private apiUrl: string;
  private model: string;
  private messageIdCounter: number;
  private onMessageCallbacks: Map<string, (message: Message) => void> = new Map();
  private onBlockCallbacks: Map<string, (block: { summary: string; next: { id: string; name: string }; stop_reason?: string; user_intent?: string }) => void> = new Map();
  private currentBlock: string = "";
  private nextSpeaker: { id: string; name: string } = { id: "user", name: "User" };
  private firstResponseReceived: Map<string, boolean> = new Map(); // Track first response per user message
  private initialUserMessage: string = ""; // Initial user message for current conversation
  private shouldStopConversation: boolean = false; // Flag to stop conversation
  private stopReason: string = "";
  private userIntent: string = "";

  constructor(apiUrl: string, model: string) {
    this.apiUrl = apiUrl;
    this.model = model;
    this.agents = AGENT_PERSONAS.map(persona => new Agent(persona));
    this.messageDAG = new MessageDAG();
    this.verifier = new Verifier(apiUrl, model);
    this.messageIdCounter = 0;
  }

  addMessageCallback(id: string, callback: (message: Message) => void) {
    this.onMessageCallbacks.set(id, callback);
  }

  removeMessageCallback(id: string) {
    this.onMessageCallbacks.delete(id);
  }

  addBlockCallback(id: string, callback: (block: { summary: string; next: { id: string; name: string }; stop_reason?: string; user_intent?: string }) => void) {
    this.onBlockCallbacks.set(id, callback);
  }

  removeBlockCallback(id: string) {
    this.onBlockCallbacks.delete(id);
  }

  private notifyMessage(message: Message) {
    this.onMessageCallbacks.forEach(callback => {
      try {
        callback(message);
      } catch (error) {
        console.error("Error in message callback:", error);
      }
    });
  }

  private notifyBlock(block: { summary: string; next: { id: string; name: string }; stop_reason?: string; user_intent?: string }) {
    this.onBlockCallbacks.forEach(callback => {
      try {
        callback(block);
      } catch (error) {
        console.error("Error in block callback:", error);
      }
    });
  }

  getCurrentBlock(): string {
    return this.currentBlock;
  }

  getNextSpeaker(): { id: string; name: string } {
    return this.nextSpeaker;
  }

  private generateMessageId(): string {
    return `msg_${++this.messageIdCounter}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Summarize the current block with new accepted message and recommend next speaker
   */
  private async summarizeBlock(newMessage: Message): Promise<{
    summary: string;
    next: { id: string; name: string };
    recommendation_reason: string;
  }> {
    // Build agent information for prompt
    const agentInfo = AGENT_PERSONAS.map(p =>
      `- ID: ${p.name}, Name: ${p.name}, Role: ${p.role}, Description: ${p.systemPrompt.split('\n')[0]}`
    ).join('\n');

    const availableSpeakers = [
      ...AGENT_PERSONAS.map(p => ({ id: p.name, name: p.name })),
      { id: "user", name: "User" }
    ];

    const agentsList = availableSpeakers.map(s => s.name).join(", ");

    // Use stored initial user message
    const userMessageContent = this.initialUserMessage || "(없음)";

    const prompt = `다음은 이전 블록 요약과 새로운 메시지입니다.

이전 블록:
${this.currentBlock || "(없음)"}

최초 유저 메시지:
${userMessageContent}

최근 메시지:
${newMessage.speaker}: ${newMessage.content}

사용 가능한 Agents:
${agentInfo}
- ID: user, Name: User, Role: 사용자, Description: 질문하거나 의견을 제시하는 사용자

다음 작업을 수행해주세요:
1. 이전 블록과 새 메시지를 합쳐서 500자 이내로 요약
2. 대화 맥락을 고려하여 다음으로 응답하면 가장 적합한 speaker를 추천 (${agentsList} 중 선택)
3. 최근 메세지를 쓴 사람을 또 추천할 수는 없음

JSON 형태로만 응답해주세요:
{
  "summary": "500자 이내 요약 내용",
  "next": {
    "id": "agent_id",
    "name": "agent_name"
  },
  "recommendation_reason": "추천 사유 설명"
}`;

    try {
      console.log(`\n[Block] Requesting summary...`);
      console.log(`[Block] Full prompt:\n${prompt}\n`);

      const requestManager = RequestManager.getInstance();
      const response = await requestManager.request(
        this.apiUrl,
        this.model,
        [{ role: "user", content: prompt }],
        600,
        0.3
      );

      // Parse JSON response - remove markdown code blocks if present
      let jsonStr = response.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/```\s*/g, "");
      }

      const parsed = JSON.parse(jsonStr);

      // Validate next speaker
      let validSpeaker = availableSpeakers.find(s =>
        s.id === parsed.next?.id || s.name === parsed.next?.name
      );

      return {
        summary: parsed.summary || response.substring(0, 500),
        next: validSpeaker || { id: "user", name: "User" },
        recommendation_reason: parsed.recommendation_reason || ""
      };
    } catch (error) {
      console.error("Error summarizing block:", error);
      // On error, just append the new message
      return {
        summary: `${this.currentBlock}\n\n${newMessage.speaker}: ${newMessage.content}`.substring(0, 500),
        next: { id: "user", name: "User" },
        recommendation_reason: ""
      };
    }
  }

  /**
   * Add user message to the thread (without processing agents)
   */
  async addUserMessage(content: string) {
    // Set new initial user message and reset flags
    this.initialUserMessage = content;
    this.verifier.reset();
    this.shouldStopConversation = false;
    this.stopReason = "";
    this.userIntent = "";

    const message: Message = {
      id: this.generateMessageId(),
      speaker: "User",
      content,
      timestamp: Date.now(),
    };
    this.messageDAG.addMessage(message);

    // Generate block for user message and get next speaker recommendation
    const blockResult = await this.summarizeBlock(message);
    this.currentBlock = blockResult.summary;
    this.nextSpeaker = blockResult.next;
    console.log(`[USER MESSAGE BLOCK] ${this.currentBlock.substring(0, 100)}...`);
    console.log(`[NEXT SPEAKER RECOMMENDED] ${blockResult.next.name} (${blockResult.next.id})`);

    // Send block update to UI
    this.notifyBlock(blockResult);

    // Start verification in background (non-blocking)
    this.verifier.verify(
      this.initialUserMessage,
      this.currentBlock,
      message.content,
      message.speaker
    ).then(verification => {
      this.userIntent = verification.user_intent;
      if (verification.should_stop) {
        this.shouldStopConversation = true;
        this.stopReason = verification.stop_reason;
        this.nextSpeaker = { id: "user", name: "User" };
        console.log(`[Verifier] STOP flag set: ${this.stopReason}`);

        // Notify UI about the stop
        this.notifyBlock({
          summary: this.currentBlock,
          next: this.nextSpeaker,
          stop_reason: this.stopReason,
          user_intent: this.userIntent
        });
      }
    }).catch(error => {
      console.error("Error in verification:", error);
    });

    return message.id;
  }

  /**
   * Process sequential agent responses based on next speaker recommendation
   * No broadcast - only the recommended agent responds
   */
  async processAgentResponsesQueue(initialMessage: Message) {
    console.log(`\n[AUTO] Starting sequential conversation from ${initialMessage.speaker}`);

    let lastMessage = initialMessage;
    const maxRounds = 10;

    for (let round = 0; round < maxRounds; round++) {
      // Check if verifier flagged to stop
      if (this.shouldStopConversation) {
        console.log(`[AUTO] Stopping due to verifier: ${this.stopReason}`);
        break;
      }

      // Check if next speaker is user or same as last speaker
      if (this.nextSpeaker.id === "user" || this.nextSpeaker.name === lastMessage.speaker) {
        console.log(`[AUTO] Stopping (next: ${this.nextSpeaker.name}, last: ${lastMessage.speaker})`);
        break;
      }

      // Find the recommended agent
      const nextAgent = this.agents.find(a => a.getName() === this.nextSpeaker.name);
      if (!nextAgent) {
        console.log(`[AUTO] Agent ${this.nextSpeaker.name} not found`);
        break;
      }

      console.log(`[AUTO] Round ${round + 1}/${maxRounds}: ${this.nextSpeaker.name} responding...`);

      try {
        const mainHistory = this.messageDAG.getMainHistory();
        const content = await nextAgent.respond(mainHistory, lastMessage, this.currentBlock);
        const timestamp = Date.now();

        const agentMessage: Message = {
          id: this.generateMessageId(),
          speaker: nextAgent.getName(),
          content: content,
          timestamp: timestamp,
          replyTo: lastMessage.id,
          status: "accepted",
        };

        this.messageDAG.addMessage(agentMessage);
        this.notifyMessage(agentMessage);

        // Generate block and get next speaker recommendation
        const blockResult = await this.summarizeBlock(agentMessage);
        this.currentBlock = blockResult.summary;
        this.nextSpeaker = blockResult.next;
        this.notifyBlock(blockResult);

        console.log(`[AUTO] ${nextAgent.getName()} responded. Next: ${this.nextSpeaker.name}`);

        // Run verification in background (non-blocking)
        this.verifier.verify(
          this.initialUserMessage,
          this.currentBlock,
          agentMessage.content,
          agentMessage.speaker
        ).then(verification => {
          this.userIntent = verification.user_intent;
          if (verification.should_stop) {
            this.shouldStopConversation = true;
            this.stopReason = verification.stop_reason;
            this.nextSpeaker = { id: "user", name: "User" };
            console.log(`[Verifier] STOP flag set: ${this.stopReason}`);

            // Notify UI about the stop
            this.notifyBlock({
              summary: this.currentBlock,
              next: this.nextSpeaker,
              stop_reason: this.stopReason,
              user_intent: this.userIntent
            });
          }
        }).catch(error => {
          console.error("Error in verification:", error);
        });

        // Update for next iteration
        lastMessage = agentMessage;
      } catch (error) {
        console.error(`[AUTO] Error in round ${round + 1}:`, error);
        break;
      }
    }

    console.log(`[AUTO] Conversation ended`);
  }

  getHistory(): Message[] {
    return this.messageDAG.getAllMessages();
  }

  getMainHistory(): Message[] {
    return this.messageDAG.getMainHistory();
  }

  getAgents(): Agent[] {
    return this.agents;
  }

  clearHistory(): void {
    this.messageDAG.clear();
    this.messageIdCounter = 0;
    this.currentBlock = "";
    this.nextSpeaker = { id: "user", name: "User" };
    this.firstResponseReceived.clear();
    this.initialUserMessage = "";
    this.shouldStopConversation = false;
    this.stopReason = "";
    this.userIntent = "";
  }

  /**
   * Process a specific agent's response to a message
   */
  async processSpecificAgent(messageContent: string, agentName: string) {
    // Find the message by content (assume it's already added)
    const allMessages = this.messageDAG.getAllMessages();
    const userMessage = allMessages.filter(m => m.speaker === "User" && m.content === messageContent).pop();

    if (!userMessage) {
      console.error(`User message not found: ${messageContent}`);
      return;
    }

    // Find the specified agent
    const agent = this.agents.find(a => a.getName() === agentName);
    if (!agent) {
      console.error(`Agent not found: ${agentName}`);
      return;
    }

    try {
      const mainHistory = this.messageDAG.getMainHistory();
      const content = await agent.respond(mainHistory, userMessage, this.currentBlock);
      const timestamp = Date.now();

      // Check if this is the first response for this user message
      const isFirst = !this.firstResponseReceived.get(userMessage.id);
      if (isFirst) {
        this.firstResponseReceived.set(userMessage.id, true);
      }

      console.log(`${agent.getName()} ${isFirst ? '[FIRST]' : '[OTHER]'}: "${content.substring(0, 50)}..."`);

      const message: Message = {
        id: this.generateMessageId(),
        speaker: agent.getName(),
        content: content,
        timestamp: timestamp,
        replyTo: userMessage.id,
        status: isFirst ? "accepted" : "dropped",
      };

      this.messageDAG.addMessage(message);

      // Send to UI immediately (don't wait for block generation)
      this.notifyMessage(message);
    } catch (error) {
      console.error(`Error getting response from ${agent.getName()}:`, error);
      throw error;
    }
  }

  /**
   * Generate block summary for a message
   */
  async generateBlockForMessage(messageId: string) {
    const message = this.messageDAG.getMessage(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    const blockResult = await this.summarizeBlock(message);
    this.currentBlock = blockResult.summary;
    this.nextSpeaker = blockResult.next;
    console.log(`[BLOCK UPDATED] ${this.currentBlock.substring(0, 100)}...`);
    console.log(`[NEXT SPEAKER RECOMMENDED] ${blockResult.next.name} (${blockResult.next.id})`);

    return blockResult;
  }
}
