export type ChatConversation = {
  id: string;
  title: string | null;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationGroup = {
  title: string;
  items: ChatConversation[];
};

export function groupConversationsByDate(conversations: ChatConversation[]): ConversationGroup[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const groups: ConversationGroup[] = [
    { title: "Today", items: [] },
    { title: "Yesterday", items: [] },
    { title: "This Week", items: [] },
    { title: "Older", items: [] },
  ];

  for (const conversation of conversations) {
    const date = new Date(conversation.updatedAt);
    date.setHours(0, 0, 0, 0);

    if (date >= today) {
      groups[0].items.push(conversation);
      continue;
    }

    if (date >= yesterday) {
      groups[1].items.push(conversation);
      continue;
    }

    if (date >= lastWeek) {
      groups[2].items.push(conversation);
      continue;
    }

    groups[3].items.push(conversation);
  }

  return groups.filter((group) => group.items.length > 0);
}
