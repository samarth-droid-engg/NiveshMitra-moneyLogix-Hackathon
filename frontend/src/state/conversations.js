export function upsertConversation(conversations, conversation) {
  if (!conversation?._id) return conversations;
  const next = conversations.filter((item) => item._id !== conversation._id);
  return [conversation, ...next].sort(
    (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0),
  );
}

export function shouldApplyConversationResult(requestedId, activeId) {
  return Boolean(requestedId && requestedId === activeId);
}
