import { useRef, useState } from 'react'

export function DocumentTitleInput({ value, onCommit, ...props }: {
  value: string; onCommit: (title: string) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value)
  const [previous, setPrevious] = useState(value)
  const cancelled = useRef(false)
  if (previous !== value) { setPrevious(value); setDraft(value) }
  return <input {...props} value={draft} onChange={(event) => setDraft(event.target.value)}
    onBlur={() => { if (!cancelled.current) onCommit(draft); cancelled.current = false; setDraft(value) }}
    onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
      if (event.key === 'Escape') { event.preventDefault(); cancelled.current = true; event.currentTarget.dataset.draftCancelled = 'true'; setDraft(value); event.currentTarget.blur() }
    }} />
}
