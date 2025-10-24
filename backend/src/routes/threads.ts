import { Router, Request, Response } from "express";
import ThreadManager from "../world/threadManager";
import { AgentPersona } from "../types";

const router = Router();

// Get all threads
router.get("/", (req: Request, res: Response) => {
  try {
    const threadManager = ThreadManager.getInstance();
    const threads = threadManager.getAllThreads();

    res.json({
      success: true,
      threads
    });
  } catch (error: any) {
    console.error("Error getting threads:", error);
    res.status(500).json({
      error: error.message || "Internal server error"
    });
  }
});

// Create a new thread
router.post("/", (req: Request, res: Response) => {
  try {
    const { name, agents } = req.body;

    if (!name) {
      return res.status(400).json({
        error: "Thread name is required"
      });
    }

    const threadManager = ThreadManager.getInstance();
    const thread = threadManager.createThread(name, agents || []);

    res.json({
      success: true,
      thread
    });
  } catch (error: any) {
    console.error("Error creating thread:", error);
    res.status(500).json({
      error: error.message || "Internal server error"
    });
  }
});

// Get a specific thread
router.get("/:threadId", (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const threadManager = ThreadManager.getInstance();
    const thread = threadManager.getThread(threadId);

    if (!thread) {
      return res.status(404).json({
        error: "Thread not found"
      });
    }

    res.json({
      success: true,
      thread
    });
  } catch (error: any) {
    console.error("Error getting thread:", error);
    res.status(500).json({
      error: error.message || "Internal server error"
    });
  }
});

// Delete a thread
router.delete("/:threadId", async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const threadManager = ThreadManager.getInstance();
    const deleted = await threadManager.deleteThread(threadId);

    if (!deleted) {
      return res.status(404).json({
        error: "Thread not found"
      });
    }

    res.json({
      success: true
    });
  } catch (error: any) {
    console.error("Error deleting thread:", error);
    res.status(500).json({
      error: error.message || "Internal server error"
    });
  }
});

// Update thread name
router.patch("/:threadId", (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        error: "Thread name is required"
      });
    }

    const threadManager = ThreadManager.getInstance();
    const updated = threadManager.updateThreadName(threadId, name);

    if (!updated) {
      return res.status(404).json({
        error: "Thread not found"
      });
    }

    const thread = threadManager.getThread(threadId);
    res.json({
      success: true,
      thread
    });
  } catch (error: any) {
    console.error("Error updating thread:", error);
    res.status(500).json({
      error: error.message || "Internal server error"
    });
  }
});

// Add an agent to a thread
router.post("/:threadId/agents", (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const agent: AgentPersona = req.body;

    if (!agent.name || !agent.role || !agent.a2aUrl) {
      return res.status(400).json({
        error: "Agent name, role, and a2aUrl are required"
      });
    }

    // Set default color if not provided
    if (!agent.color) {
      agent.color = "bg-gray-100 border-gray-400";
    }

    const threadManager = ThreadManager.getInstance();
    const added = threadManager.addAgent(threadId, agent);

    if (!added) {
      return res.status(400).json({
        error: "Failed to add agent (thread not found or agent already exists)"
      });
    }

    const thread = threadManager.getThread(threadId);
    res.json({
      success: true,
      thread
    });
  } catch (error: any) {
    console.error("Error adding agent:", error);
    res.status(500).json({
      error: error.message || "Internal server error"
    });
  }
});

// Remove an agent from a thread
router.delete("/:threadId/agents/:agentId", (req: Request, res: Response) => {
  try {
    const { threadId, agentId } = req.params;
    const threadManager = ThreadManager.getInstance();
    const removed = threadManager.removeAgent(threadId, agentId);

    if (!removed) {
      return res.status(404).json({
        error: "Thread or agent not found"
      });
    }

    const thread = threadManager.getThread(threadId);
    res.json({
      success: true,
      thread
    });
  } catch (error: any) {
    console.error("Error removing agent:", error);
    res.status(500).json({
      error: error.message || "Internal server error"
    });
  }
});

// Send a message in a thread
router.post("/:threadId/messages", async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const { message, action } = req.body;

    const threadManager = ThreadManager.getInstance();
    const world = threadManager.getWorld(threadId);

    if (!world) {
      return res.status(404).json({
        error: "Thread not found"
      });
    }

    // Handle reset action
    if (action === "reset") {
      world.clearHistory();
      return res.json({
        success: true
      });
    }

    // Handle message
    if (!message || message.trim() === "") {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    // Add user message
    const userMessageId = await world.addUserMessage(message);

    // Get the user message object
    const userMessage = world.getHistory().find(m => m.id === userMessageId);

    if (userMessage) {
      // Broadcast to all agents and start sequential conversation (non-blocking)
      (async () => {
        try {
          // Broadcast user message to all agents in parallel
          const acceptedMessage = await world.broadcastToAgents(userMessage);

          // If there's an accepted response, continue with sequential conversation
          if (acceptedMessage) {
            await world.processAgentResponsesQueue(acceptedMessage);
          }
        } catch (error) {
          console.error("Error processing agents:", error);
        }
      })();
    }

    return res.json({
      success: true,
      messageId: userMessageId
    });
  } catch (error: any) {
    console.error("Error in thread message API:", error);
    return res.status(500).json({
      error: error.message || "Internal server error"
    });
  }
});

// SSE endpoint for a specific thread
router.get("/:threadId/stream", (req: Request, res: Response) => {
  // Set headers for SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const { threadId } = req.params;

  try {
    const threadManager = ThreadManager.getInstance();
    const world = threadManager.getWorld(threadId);

    if (!world) {
      res.write(`data: ${JSON.stringify({ error: "Thread not found" })}\n\n`);
      res.end();
      return;
    }

    const clientId = `client_${Date.now()}_${Math.random()}`;

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: "connected", clientId, threadId })}\n\n`);

    // Set up callbacks for this client
    world.addMessageCallback(clientId, (message) => {
      res.write(`data: ${JSON.stringify({ type: "message", data: message })}\n\n`);
    });

    world.addBlockCallback(clientId, (block) => {
      res.write(`data: ${JSON.stringify({ type: "block", data: block })}\n\n`);
    });

    // Clean up on client disconnect
    req.on("close", () => {
      console.log(`Client ${clientId} disconnected from thread ${threadId}`);
      world?.removeMessageCallback(clientId);
      world?.removeBlockCallback(clientId);
      res.end();
    });
  } catch (error) {
    console.error("Error in thread stream:", error);
    res.write(`data: ${JSON.stringify({ error: "Server error" })}\n\n`);
    res.end();
  }
});

export default router;
