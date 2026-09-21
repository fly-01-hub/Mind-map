import { useEffect, useRef } from 'react'
import type { PaperAnnotation } from '../../types/annotation'

export function AnnotationLayer({ annotations, activeAnnotationId }: { annotations: PaperAnnotation[]; activeAnnotationId?: string }) {
  const activeMarkRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!activeAnnotationId || !activeMarkRef.current) return
    const frame = requestAnimationFrame(() => activeMarkRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }))
    return () => cancelAnimationFrame(frame)
  }, [activeAnnotationId, annotations])

  return (
    <div className="paper-annotation-layer" aria-hidden="true">
      {annotations.flatMap((annotation) => annotation.positionData.rects.map((rect, index) => (
        <span
          key={`${annotation.id}-${index}`}
          ref={annotation.id === activeAnnotationId && index === 0 ? activeMarkRef : undefined}
          data-annotation-id={annotation.id}
          className={`paper-annotation-mark ${annotation.annotationType}${annotation.id === activeAnnotationId ? ' target' : ''}`}
          style={{
            left: `${rect.x * 100}%`, top: `${rect.y * 100}%`,
            width: `${rect.width * 100}%`, height: `${rect.height * 100}%`,
          }}
        />
      )))}
    </div>
  )
}
