export interface Message {
  id: string;
  speaker: string;
  content: string;
  timestamp: number;
  replyTo?: string;
  status?: "accepted" | "dropped";
}

export interface AgentPersona {
  name: string;
  role: string;
  a2aUrl: string;
  color: string;
}
