import { useEffect, useRef, type CSSProperties } from 'react'
import type { PaperAnnotation } from '../../types/annotation'

export function AnnotationLayer({ annotations, activeAnnotationId, onLocate }: { annotations: PaperAnnotation[]; activeAnnotationId?: string; onLocate?: (mark: HTMLElement, id: string) => void }) {
  const activeMarkRef = useRef<HTMLSpanElement>(null)
  const hasActiveMark = annotations.some(annotation => annotation.id === activeAnnotationId && annotation.positionData.rects.length > 0)

  useEffect(() => {
    if (!activeAnnotationId || !activeMarkRef.current) return
    const frame = requestAnimationFrame(() => {
      const mark = activeMarkRef.current
      if (!mark) return
      if (onLocate) onLocate(mark, activeAnnotationId)
      else mark.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [activeAnnotationId, hasActiveMark, onLocate])

  return (
    <div className="paper-annotation-layer" aria-hidden="true">
      {annotations.flatMap((annotation) => annotation.positionData.rects.map((rect, index) => (
        <span
          key={`${annotation.id}-${index}`}
          ref={annotation.id === activeAnnotationId && index === 0 ? activeMarkRef : undefined}
          data-annotation-id={annotation.id}
          className={`paper-annotation-mark ${annotation.annotationType}${annotation.areaStyle === 'highlight' ? ' region-highlight' : ''}${annotation.id === activeAnnotationId ? ' target' : ''}`} data-color={annotation.color ?? 'yellow'}
          style={{
            left: `${rect.x * 100}%`, top: `${(rect.y + (annotation.annotationType === 'area' ? 0 : rect.height * .08)) * 100}%`,
            width: `${rect.width * 100}%`, height: `${rect.height * (annotation.annotationType === 'area' ? 1 : .86) * 100}%`,
          } as CSSProperties}
        />
      )))}
    </div>
  )
}
