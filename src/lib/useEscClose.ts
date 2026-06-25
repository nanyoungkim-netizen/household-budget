import { useEffect, useRef } from 'react'

// 열려 있는 모달들의 닫기 콜백 스택. ESC를 누르면 "가장 위(나중에 열린)" 모달만 닫는다.
type Entry = { close: () => void }
const stack: Entry[] = []
let listening = false

function ensureListener() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' && e.key !== 'Esc') return
    const top = stack[stack.length - 1]
    if (top) {
      e.stopPropagation()
      top.close()
    }
  })
}

/**
 * 모달이 열려 있을 때(open=true) ESC 키로 onClose를 호출한다.
 * 여러 모달이 겹쳐 있어도 맨 위 모달만 닫힌다(전역 스택).
 */
export function useEscClose(open: boolean, onClose: () => void) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => {
    if (!open) return
    ensureListener()
    const entry: Entry = { close: () => ref.current() }
    stack.push(entry)
    return () => {
      const i = stack.lastIndexOf(entry)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [open])
}
