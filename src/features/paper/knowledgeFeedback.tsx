import { useKnowledgeFeedbackStore as useFeedback, knowledgeAction } from '../../stores/knowledgeFeedbackStore'
export function KnowledgeFeedback() {
  const { message, error, undo, busy } = useFeedback()
  if (!message) return null
  return <div className={`knowledge-feedback ${error ? 'error' : ''}`} role="status"><span>{message}</span>
    {undo && <button disabled={busy} onClick={async () => {
      useFeedback.setState({ busy: true })
      await knowledgeAction(undo, '已撤销')
    }}>{busy ? '撤销中…' : '撤销'}</button>}
    <button aria-label="关闭提示" onClick={() => useFeedback.setState({ message: '', undo: undefined })}>×</button>
  </div>
}
