export type Sender = "user" | "ai";

export interface ChatMessage {
  id: string;
  sender: Sender;
  text: string;
  createdAt: string;
}

export interface ChatHistoryItem {
  id: string;
  title: string;
  updatedAt: string;
}
