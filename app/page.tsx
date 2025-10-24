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
  color: string;
}

interface BlockInfo {
  summary: string;
  next: { id: string; name: string };
  recommendation_reason?: string;
  stop_reason?: string;
  user_intent?: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [blockInfo, setBlockInfo] = useState<BlockInfo | null>(null);
  const [agents, setAgents] = useState<AgentPersona[]>([]);
  const [connected, setConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch agent info on mount
  useEffect(() => {
    fetch(`${backendUrl}/api/chat/agents`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.agents) {
          setAgents(data.agents);
        }
      })
      .catch(err => console.error("Error fetching agents:", err));
  }, [backendUrl]);

  // Connect to SSE stream
  useEffect(() => {
    const eventSource = new EventSource(`${backendUrl}/api/chat/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("SSE connection opened");
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connected") {
          console.log("Connected with client ID:", data.clientId);
        } else if (data.type === "message") {
          // Add message to UI
          setMessages(prev => [...prev, data.data]);
        } else if (data.type === "block") {
          // Update block info
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

    // Cleanup on unmount
    return () => {
      console.log("Closing SSE connection");
      eventSource.close();
    };
  }, [backendUrl]);

  const getAgentColor = (speaker: string) => {
    const agent = agents.find(a => a.name === speaker);
    return agent?.color || "bg-gray-100 border-gray-400";
  };

  const getAgentRole = (speaker: string) => {
    const agent = agents.find(a => a.name === speaker);
    return agent?.role || "";
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = input;
    setInput("");

    // Add user message directly to UI
    const userMsg: Message = {
      id: `user_${Date.now()}_${Math.random()}`,
      speaker: "User",
      content: userMessage,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    // Send to backend
    try {
      await fetch(`${backendUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
        }),
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleReset = async () => {
    if (!confirm("Are you sure you want to reset the conversation?")) return;

    try {
      const response = await fetch(`${backendUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "reset",
        }),
      });

      const data = await response.json();

      if (data.success) {
        setMessages([]);
        setBlockInfo(null);
      }
    } catch (error) {
      console.error("Error resetting conversation:", error);
      alert("Failed to reset conversation.");
    }
  };

  // All messages go to main thread (no more dropped messages)
  const mainThreadMessages = messages;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100">
      <div className="container mx-auto max-w-7xl h-screen flex flex-col p-4">
        {/* Header */}
        <div className="bg-white rounded-t-2xl shadow-lg p-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              하회마을 토론장
            </h1>
            <p className="text-sm text-gray-600">
              4명의 토론자 - 가장 빠른 응답이 메인 스레드에 표시됩니다
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <div className={`w-3 h-3 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}></div>
            <span className="text-xs text-gray-600">{connected ? "Connected" : "Disconnected"}</span>
            <button
              onClick={handleReset}
              className="ml-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Agent Legend */}
        <div className="bg-white px-4 py-2 shadow-sm">
          <div className="flex gap-4 flex-wrap">
            {agents.map((agent) => (
              <div key={agent.name} className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full border-2 ${agent.color}`}
                ></div>
                <span className="text-xs text-gray-600">
                  {agent.name} ({agent.role})
                </span>
              </div>
            ))}
          </div>
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
            <p className="text-sm text-gray-700 whitespace-pre-wrap mb-2">
              {blockInfo.summary}
            </p>
            {blockInfo.user_intent && (
              <div className="text-xs text-gray-600 bg-blue-50 rounded p-2 mb-1">
                <span className="font-semibold">🎯 유저 의도:</span> {blockInfo.user_intent}
              </div>
            )}
            {blockInfo.recommendation_reason && (
              <div className="text-xs text-gray-600 bg-white rounded p-2 mb-1">
                <span className="font-semibold">추천 사유:</span> {blockInfo.recommendation_reason}
              </div>
            )}
            {blockInfo.stop_reason && (
              <div className="text-xs text-gray-600 bg-red-50 rounded p-2 border border-red-200">
                <span className="font-semibold">🛑 대화 종료:</span> {blockInfo.stop_reason}
              </div>
            )}
          </div>
        )}

        {/* Message Display */}
        <div className="flex-1 bg-white shadow-lg overflow-hidden">
          <div className="overflow-y-auto p-6 space-y-4 h-full">
            <h2 className="text-lg font-bold text-gray-700 mb-4 sticky top-0 bg-white pb-2">
              대화 내용
            </h2>
            {mainThreadMessages.length === 0 ? (
              <div className="text-center text-gray-500 mt-8">
                <p className="text-lg">대화를 시작하세요!</p>
                <p className="text-sm mt-2">
                  질문을 하거나 주제를 공유하면 AI가 추천하는 순서대로 토론자들이 답변합니다.
                </p>
              </div>
            ) : (
              mainThreadMessages.map((message, index) => (
                <div
                  key={message.id}
                  className={`message-enter ${
                    message.speaker === "User" || message.speaker === "System" ? "ml-auto" : ""
                  } max-w-[80%]`}
                  style={{ animationDelay: `${index * 0.05}s` }}
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
                      <span className="font-semibold text-sm">
                        {message.speaker}
                      </span>
                      {message.speaker !== "User" && message.speaker !== "System" && (
                        <span className="text-xs opacity-70">
                          ({getAgentRole(message.speaker)})
                        </span>
                      )}
                      <span className="text-xs opacity-70 ml-auto">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">
                      {message.content}
                    </p>
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
              onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="메시지를 입력하세요..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || !connected}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
