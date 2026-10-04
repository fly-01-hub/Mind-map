import { create } from 'zustand'

interface FeedbackState { message: string; error: boolean; undo?: () => Promise<void>; busy: boolean }
export const useKnowledgeFeedbackStore = create<FeedbackState>(() => ({ message: '', error: false, busy: false }))
export async function knowledgeAction(action: () => Promise<unknown>, message: string, undo?: () => Promise<void>) {
  try {
    await action()
    useKnowledgeFeedbackStore.setState({ message, error: false, undo, busy: false })
  } catch (reason) {
    useKnowledgeFeedbackStore.setState({ message: reason instanceof Error ? reason.message : '操作失败，请重试。', error: true, undo: undefined, busy: false })
  }
}
