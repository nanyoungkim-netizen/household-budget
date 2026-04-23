'use client'

interface Props {
  message?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function DeleteConfirmModal({ message, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-xs p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-lg">🗑️</div>
          <h2 className="text-base font-bold text-gray-900">삭제 확인</h2>
        </div>
        <p className="text-sm text-gray-600 mb-5">
          {message ?? '정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.'}
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  )
}
