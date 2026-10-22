import { useRef, useState } from 'react'

export function DocumentTitleInput({ value, onCommit, ...props }: {
  value: string; onCommit: (title: string) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value)
  const [previous, setPrevious] = useState(value)
  const cancelled = useRef(false)
  if (previous !== value) { setPrevious(value); setDraft(value) }
  return <input {...props} value={draft} onChange={(event) => setDraft(event.target.value)}
    onBlur={(event) => {
      if (!cancelled.current) onCommit(draft)
      // A synchronous rename has now either committed or been rejected (for
      // example, a duplicate name). Do not replay that rejected input later.
      event.currentTarget.dispatchEvent(new Event('researchmind:draft-settled', { bubbles: true }))
      cancelled.current = false
      setDraft(value)
    }}
    onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
      if (event.key === 'Escape') { event.preventDefault(); cancelled.current = true; event.currentTarget.dataset.draftCancelled = 'true'; setDraft(value); event.currentTarget.blur() }
    }} />
}
