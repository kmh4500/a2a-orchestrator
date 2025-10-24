"use client";

import { useState, useEffect, useRef } from "react";

interface Message {
  id: string;
  speaker: string;
  content: string;
  timestamp: number;
  replyTo?: string;
  status?: "accepted" | "dropped";
}

interface AgentPersona {
  name: string;
  role: string;
  a2aUrl: string;
  color: string;
}

interface Thread {
  id: string;
  name: string;
  agents: AgentPersona[];
  createdAt: number;
  updatedAt: number;
}

interface BlockInfo {
  summary: string;
  next: { id: string; name: string };
  recommendation_reason?: string;
  stop_reason?: string;
  user_intent?: string;
}

export default function Home() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThread, setCurrentThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [blockInfo, setBlockInfo] = useState<BlockInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [newThreadName, setNewThreadName] = useState("");
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [a2aUrlInput, setA2aUrlInput] = useState("");
  const [importedAgent, setImportedAgent] = useState<AgentPersona | null>(null);
  const [importing, setImporting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch threads on mount
  useEffect(() => {
    fetchThreads();
  }, []);

  // Connect to SSE stream when thread changes
  useEffect(() => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      setConnected(false);
    }

    if (!currentThread) {
      setMessages([]);
      setBlockInfo(null);
      return;
    }

    const eventSource = new EventSource(`${backendUrl}/api/threads/${currentThread.id}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("SSE connection opened for thread:", currentThread.id);
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connected") {
          console.log("Connected with client ID:", data.clientId);
        } else if (data.type === "message") {
          setMessages(prev => [...prev, data.data]);
        } else if (data.type === "block") {
          setBlockInfo(data.data);
        }
      } catch (error) {
        console.error("Error parsing SSE message:", error);
      }
    };

    eventSource.onerror = () => {
      console.log("SSE connection error");
      setConnected(false);
    };

    // Cleanup on unmount or thread change
    return () => {
      console.log("Closing SSE connection");
      eventSource.close();
    };
  }, [currentThread, backendUrl]);

  const fetchThreads = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/threads`);
      const data = await res.json();
      if (data.success) {
        setThreads(data.threads);
      }
    } catch (error) {
      console.error("Error fetching threads:", error);
    }
  };

  const createThread = async () => {
    if (!newThreadName.trim()) return;

    try {
      const res = await fetch(`${backendUrl}/api/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newThreadName }),
      });
      const data = await res.json();
      if (data.success) {
        setThreads(prev => [...prev, data.thread]);
        setNewThreadName("");
        setCurrentThread(data.thread);
      }
    } catch (error) {
      console.error("Error creating thread:", error);
    }
  };

  const deleteThread = async (threadId: string) => {
    if (!confirm("Are you sure you want to delete this thread?")) return;

    try {
      const res = await fetch(`${backendUrl}/api/threads/${threadId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setThreads(prev => prev.filter(t => t.id !== threadId));
        if (currentThread?.id === threadId) {
          setCurrentThread(null);
        }
      }
    } catch (error) {
      console.error("Error deleting thread:", error);
    }
  };

  const importAgent = async () => {
    if (!a2aUrlInput.trim()) {
      alert("Please enter an A2A URL.");
      return;
    }

    setImporting(true);
    try {
      const res = await fetch(`${backendUrl}/api/agents/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ a2aUrl: a2aUrlInput }),
      });
      const data = await res.json();
      if (data.success) {
        setImportedAgent(data.agent);
      } else {
        alert(data.error || "Failed to import agent.");
      }
    } catch (error) {
      console.error("Error importing agent:", error);
      alert("Failed to import agent.");
    } finally {
      setImporting(false);
    }
  };

  const addAgent = async () => {
    if (!currentThread || !importedAgent) {
      alert("Please import an agent first.");
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/api/threads/${currentThread.id}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(importedAgent),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentThread(data.thread);
        setThreads(prev => prev.map(t => t.id === data.thread.id ? data.thread : t));
        setShowAddAgent(false);
        setA2aUrlInput("");
        setImportedAgent(null);
      } else {
        alert(data.error || "Failed to add agent.");
      }
    } catch (error) {
      console.error("Error adding agent:", error);
      alert("Failed to add agent.");
    }
  };

  const removeAgent = async (agentName: string) => {
    if (!currentThread) return;
    if (!confirm(`Are you sure you want to remove agent "${agentName}"?`)) return;

    try {
      const res = await fetch(`${backendUrl}/api/threads/${currentThread.id}/agents/${agentName}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setCurrentThread(data.thread);
        setThreads(prev => prev.map(t => t.id === data.thread.id ? data.thread : t));
      }
    } catch (error) {
      console.error("Error removing agent:", error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !currentThread) return;

    const userMessage = input;
    setInput("");

    // Add user message to UI
    const userMsg: Message = {
      id: `user_${Date.now()}_${Math.random()}`,
      speaker: "User",
      content: userMessage,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    // Send to backend
    try {
      await fetch(`${backendUrl}/api/threads/${currentThread.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const resetThread = async () => {
    if (!currentThread) return;
    if (!confirm("Are you sure you want to reset the conversation?")) return;

    try {
      const res = await fetch(`${backendUrl}/api/threads/${currentThread.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages([]);
        setBlockInfo(null);
      }
    } catch (error) {
      console.error("Error resetting thread:", error);
    }
  };

  const getAgentColor = (speaker: string) => {
    if (!currentThread) return "bg-gray-100 border-gray-400";
    const agent = currentThread.agents.find(a => a.name === speaker);
    return agent?.color || "bg-gray-100 border-gray-400";
  };

  const getAgentRole = (speaker: string) => {
    if (!currentThread) return "";
    const agent = currentThread.agents.find(a => a.name === speaker);
    return agent?.role || "";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100">
      <div className="container mx-auto max-w-7xl h-screen flex p-4 gap-4">
        {/* Sidebar - Thread List */}
        <div className="w-64 bg-white rounded-2xl shadow-lg p-4 flex flex-col">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Threads</h2>

          {/* Create Thread */}
          <div className="mb-4">
            <input
              type="text"
              value={newThreadName}
              onChange={(e) => setNewThreadName(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && createThread()}
              placeholder="New thread name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2"
            />
            <button
              onClick={createThread}
              className="w-full px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
            >
              + Create Thread
            </button>
          </div>

          {/* Thread List */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {threads.map(thread => (
              <div
                key={thread.id}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  currentThread?.id === thread.id
                    ? "bg-indigo-100 border-2 border-indigo-500"
                    : "bg-gray-50 hover:bg-gray-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1" onClick={() => setCurrentThread(thread)}>
                    <div className="font-semibold text-sm text-gray-800">{thread.name}</div>
                    <div className="text-xs text-gray-500">{thread.agents.length} agents</div>
                  </div>
                  <button
                    onClick={() => deleteThread(thread.id)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {!currentThread ? (
            <div className="flex-1 bg-white rounded-2xl shadow-lg flex items-center justify-center">
              <div className="text-center text-gray-500">
                <p className="text-lg">Select or create a thread</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="bg-white rounded-t-2xl shadow-lg p-4 flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">{currentThread.name}</h1>
                  <p className="text-sm text-gray-600">
                    {currentThread.agents.length} Agent{currentThread.agents.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  <div className={`w-3 h-3 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}></div>
                  <span className="text-xs text-gray-600">{connected ? "Connected" : "Disconnected"}</span>
                  <button
                    onClick={resetThread}
                    className="ml-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Agent Management */}
              <div className="bg-white px-4 py-2 shadow-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-600 font-semibold">Agents:</span>
                  {currentThread.agents.map(agent => (
                    <div key={agent.name} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1">
                      <div className={`w-2 h-2 rounded-full border ${agent.color}`}></div>
                      <span className="text-xs text-gray-700">{agent.name}</span>
                      <button
                        onClick={() => removeAgent(agent.name)}
                        className="text-red-500 hover:text-red-700 text-xs ml-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setShowAddAgent(!showAddAgent)}
                    className="px-2 py-1 bg-indigo-500 text-white rounded text-xs hover:bg-indigo-600"
                  >
                    + Add Agent
                  </button>
                </div>

                {/* Add Agent Form */}
                {showAddAgent && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                    <div className="space-y-2">
                      {/* A2A URL Input */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Enter A2A URL"
                          value={a2aUrlInput}
                          onChange={(e) => setA2aUrlInput(e.target.value)}
                          onKeyPress={(e) => e.key === "Enter" && importAgent()}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                          disabled={importing}
                        />
                        <button
                          onClick={importAgent}
                          disabled={importing || !a2aUrlInput.trim()}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          {importing ? "..." : "Import"}
                        </button>
                      </div>

                      {/* Imported Agent Preview */}
                      {importedAgent && (
                        <div className="p-2 bg-white border border-gray-300 rounded">
                          <div className="text-xs text-gray-600 mb-1">Agent Info:</div>
                          <div className="grid grid-cols-2 gap-1 text-xs">
                            <div>
                              <span className="font-semibold">Name:</span> {importedAgent.name}
                            </div>
                            <div>
                              <span className="font-semibold">Role:</span> {importedAgent.role}
                            </div>
                            <div className="col-span-2">
                              <span className="font-semibold">URL:</span> {importedAgent.a2aUrl}
                            </div>
                            <div className="col-span-2 flex items-center gap-2">
                              <span className="font-semibold">Color:</span>
                              <div className={`w-4 h-4 rounded border ${importedAgent.color}`}></div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={addAgent}
                          disabled={!importedAgent}
                          className="flex-1 px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          Add to Thread
                        </button>
                        <button
                          onClick={() => {
                            setShowAddAgent(false);
                            setA2aUrlInput("");
                            setImportedAgent(null);
                          }}
                          className="flex-1 px-3 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Current Block */}
              {blockInfo && (
                <div className="bg-amber-50 border-l-4 border-amber-400 px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-bold text-amber-800">📦 Current Block</span>
                    <span className="ml-auto text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded">
                      💡 Next: {blockInfo.next.name}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap mb-2">{blockInfo.summary}</p>
                  {blockInfo.user_intent && (
                    <div className="text-xs text-gray-600 bg-blue-50 rounded p-2 mb-1">
                      <span className="font-semibold">🎯 User Intent:</span> {blockInfo.user_intent}
                    </div>
                  )}
                  {blockInfo.recommendation_reason && (
                    <div className="text-xs text-gray-600 bg-white rounded p-2 mb-1">
                      <span className="font-semibold">Reason:</span> {blockInfo.recommendation_reason}
                    </div>
                  )}
                  {blockInfo.stop_reason && (
                    <div className="text-xs text-gray-600 bg-red-50 rounded p-2 border border-red-200">
                      <span className="font-semibold">🛑 Conversation Ended:</span> {blockInfo.stop_reason}
                    </div>
                  )}
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 bg-white shadow-lg overflow-hidden">
                <div className="overflow-y-auto p-6 space-y-4 h-full">
                  {messages.length === 0 ? (
                    <div className="text-center text-gray-500 mt-8">
                      <p className="text-lg">Start a conversation!</p>
                    </div>
                  ) : (
                    messages.map(message => (
                      <div
                        key={message.id}
                        className={`${
                          message.speaker === "User" || message.speaker === "System" ? "ml-auto" : ""
                        } max-w-[80%]`}
                      >
                        <div
                          className={`rounded-lg p-4 relative ${
                            message.speaker === "User"
                              ? "bg-indigo-600 text-white ml-auto"
                              : message.speaker === "System"
                              ? "bg-gray-300 text-gray-700 ml-auto"
                              : `${getAgentColor(message.speaker)} border-l-4`
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">{message.speaker}</span>
                            {message.speaker !== "User" && message.speaker !== "System" && (
                              <span className="text-xs opacity-70">({getAgentRole(message.speaker)})</span>
                            )}
                            <span className="text-xs opacity-70 ml-auto">
                              {new Date(message.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Input */}
              <div className="bg-white rounded-b-2xl shadow-lg p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || !connected}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
