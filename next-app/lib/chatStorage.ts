/**
 * Chat Storage Utilities for AI Assistant
 * Handles local storage persistence of chat conversations
 */

export type ChatMessage = {
    id: string;
    sender: "ai" | "user";
    text: string;
    createdAt: string;
};

export type ChatConversation = {
    id: string;
    title: string;
    messages: ChatMessage[];
    projectId?: string;
    createdAt: string;
    updatedAt: string;
};

const STORAGE_KEY = "litrev_ai_chats";

/**
 * Load all conversations from local storage
 */
export function loadConversations(): ChatConversation[] {
    if (typeof window === "undefined") return [];
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];
        return JSON.parse(stored);
    } catch {
        return [];
    }
}

/**
 * Save all conversations to local storage
 */
export function saveConversations(conversations: ChatConversation[]): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch {
        console.error("Failed to save conversations");
    }
}

/**
 * Get a single conversation by ID
 */
export function getConversation(id: string): ChatConversation | undefined {
    const conversations = loadConversations();
    return conversations.find((c) => c.id === id);
}

/**
 * Create a new conversation
 */
export function createConversation(projectId?: string): ChatConversation {
    const now = new Date().toISOString();
    const conversation: ChatConversation = {
        id: `chat-${Date.now()}`,
        title: "New Chat",
        messages: [],
        projectId,
        createdAt: now,
        updatedAt: now,
    };

    const conversations = loadConversations();
    conversations.unshift(conversation);
    saveConversations(conversations);

    return conversation;
}

/**
 * Update a conversation (add message, change title, etc.)
 */
export function updateConversation(
    id: string,
    updates: Partial<Omit<ChatConversation, "id" | "createdAt">>
): ChatConversation | undefined {
    const conversations = loadConversations();
    const index = conversations.findIndex((c) => c.id === id);
    if (index === -1) return undefined;

    const updated = {
        ...conversations[index],
        ...updates,
        updatedAt: new Date().toISOString(),
    };
    conversations[index] = updated;
    saveConversations(conversations);

    return updated;
}

/**
 * Add a message to a conversation
 */
export function addMessage(
    conversationId: string,
    message: Omit<ChatMessage, "id" | "createdAt">
): ChatMessage | undefined {
    const conversations = loadConversations();
    const conversation = conversations.find((c) => c.id === conversationId);
    if (!conversation) return undefined;

    const newMessage: ChatMessage = {
        ...message,
        id: `msg-${Date.now()}`,
        createdAt: new Date().toISOString(),
    };

    conversation.messages.push(newMessage);
    conversation.updatedAt = new Date().toISOString();

    // Auto-generate title from first user message
    if (conversation.title === "New Chat" && message.sender === "user") {
        conversation.title = message.text.slice(0, 40) + (message.text.length > 40 ? "..." : "");
    }

    saveConversations(conversations);
    return newMessage;
}

/**
 * Delete a conversation
 */
export function deleteConversation(id: string): void {
    const conversations = loadConversations();
    const filtered = conversations.filter((c) => c.id !== id);
    saveConversations(filtered);
}

/**
 * Group conversations by date for display
 */
export function groupConversationsByDate(conversations: ChatConversation[]): {
    title: string;
    items: ChatConversation[];
}[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups: { title: string; items: ChatConversation[] }[] = [
        { title: "Today", items: [] },
        { title: "Yesterday", items: [] },
        { title: "This Week", items: [] },
        { title: "Older", items: [] },
    ];

    for (const conv of conversations) {
        const date = new Date(conv.updatedAt);
        date.setHours(0, 0, 0, 0);

        if (date >= today) {
            groups[0].items.push(conv);
        } else if (date >= yesterday) {
            groups[1].items.push(conv);
        } else if (date >= lastWeek) {
            groups[2].items.push(conv);
        } else {
            groups[3].items.push(conv);
        }
    }

    return groups.filter((g) => g.items.length > 0);
}
