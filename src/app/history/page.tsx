'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useApp } from '@/lib/AppContext'
import { supabase } from '@/lib/supabase'

const BUCKET = 'history-files'

interface StoredFile {
  name: string
  id: string | null
  created_at: string | null
  metadata: { size?: number } | null
}

// 원래 파일명(한글·공백·특수문자 포함)을 스토리지 키에 쓸 수 있도록 ASCII(base64url)로 인코딩
function encodeName(name: string): string {
  const bytes = new TextEncoder().encode(name)
  let bin = ''
  bytes.forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function decodeName(seg: string): string {
  try {
    const b64 = seg.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch { return seg }
}

// 스토리지 키 → 표시용 원래 파일명
//   새 방식: {타임스탬프}.{base64url}  /  옛 방식 호환: {타임스탬프}_{원본명}
function displayName(name: string): string {
  const m = name.match(/^\d+\.(.+)$/)
  if (m) return decodeName(m[1])
  return name.replace(/^\d+_/, '')
}

function fmtSize(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtDate(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}.${m}.${day} ${hh}:${mm}`
}

export default function HistoryPage() {
  const { user } = useApp()
  const [files, setFiles] = useState<StoredFile[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyName, setBusyName] = useState<string | null>(null)     // 다운로드/삭제 진행 중인 파일
  const [confirmDelete, setConfirmDelete] = useState<StoredFile | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadFiles = useCallback(async () => {
    if (!user || !supabase) { setFiles([]); return }
    const { data, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list(user.id, { sortBy: { column: 'created_at', order: 'desc' }, limit: 200 })
    if (listErr) {
      setError('파일 목록을 불러오지 못했어요. 저장소 설정(버킷)이 되어 있는지 확인해주세요.')
      setFiles([])
      return
    }
    setFiles(((data ?? []) as StoredFile[]).filter(f => f.name !== '.emptyFolderPlaceholder'))
  }, [user])

  useEffect(() => {
    if (!user || !supabase) return
    let cancelled = false
    supabase.storage
      .from(BUCKET)
      .list(user.id, { sortBy: { column: 'created_at', order: 'desc' }, limit: 200 })
      .then(({ data, error: listErr }) => {
        if (cancelled) return
        if (listErr) {
          setError('파일 목록을 불러오지 못했어요. 저장소 설정(버킷)이 되어 있는지 확인해주세요.')
          setFiles([])
          return
        }
        setFiles(((data ?? []) as StoredFile[]).filter(f => f.name !== '.emptyFolderPlaceholder'))
      })
    return () => { cancelled = true }
  }, [user])

  async function uploadFile(file: File) {
    if (!user || !supabase) return
    setError(null)
    setUploading(true)
    try {
      // 스토리지 키엔 ASCII만 허용 → 원본 파일명은 base64url로 인코딩해 보관 (표시는 displayName으로 복원)
      const path = `${user.id}/${Date.now()}.${encodeName(file.name)}`
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || undefined })
      if (upErr) {
        setError(`업로드에 실패했어요: ${upErr.message}`)
        return
      }
      await loadFiles()
    } catch (e) {
      setError(`업로드 중 오류가 발생했어요: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setUploading(false)
    }
  }

  async function downloadFile(f: StoredFile) {
    if (!user || !supabase) return
    setBusyName(f.name)
    setError(null)
    try {
      const { data, error: dlErr } = await supabase.storage
        .from(BUCKET)
        .download(`${user.id}/${f.name}`)
      if (dlErr || !data) {
        setError('다운로드에 실패했어요. 잠시 후 다시 시도해주세요.')
        return
      }
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = displayName(f.name)
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
    } finally {
      setBusyName(null)
    }
  }

  async function deleteFile() {
    if (!user || !supabase || !confirmDelete) return
    const target = confirmDelete
    setConfirmDelete(null)
    setBusyName(target.name)
    setError(null)
    try {
      const { error: rmErr } = await supabase.storage
        .from(BUCKET)
        .remove([`${user.id}/${target.name}`])
      if (rmErr) {
        setError('삭제에 실패했어요. 잠시 후 다시 시도해주세요.')
        return
      }
      await loadFiles()
    } finally {
      setBusyName(null)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">이전 가계부</h1>
        <p className="text-sm text-gray-500 mt-1">예전 가계부 파일을 보관하고 언제든 다시 내려받을 수 있어요.</p>
      </div>

      {!user ? (
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-sm text-gray-500">
          로그인하면 파일을 보관하고 다운로드할 수 있어요.
        </div>
      ) : (
        <>
          {/* 업로드 영역 */}
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onClick={() => !uploading && inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all mb-4 ${
              dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'
            }`}
          >
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
            {uploading ? (
              <div>
                <div className="w-9 h-9 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-600">업로드 중...</p>
              </div>
            ) : (
              <div>
                <div className="text-4xl mb-3">📂</div>
                <p className="text-base font-semibold text-gray-700 mb-1">파일을 드래그하거나 클릭해서 보관</p>
                <p className="text-sm text-gray-400">.xlsx, .xls, .csv 파일</p>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-600 mb-4">⚠️ {error}</div>
          )}

          {/* 보관된 파일 목록 */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="text-base font-bold text-gray-800 mb-3">보관된 파일</h2>
            {files === null ? (
              <div className="text-center py-8 text-sm text-gray-400">목록을 불러오는 중…</div>
            ) : files.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">
                <div className="text-3xl mb-2">📭</div>
                아직 보관된 파일이 없어요. 위에서 파일을 올려보세요.
              </div>
            ) : (
              <div className="space-y-2">
                {files.map(f => (
                  <div key={f.id ?? f.name} className="flex items-center justify-between gap-2 border border-gray-100 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl shrink-0">📄</span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{displayName(f.name)}</div>
                        <div className="text-xs text-gray-400">
                          {fmtDate(f.created_at)}{f.metadata?.size ? ` · ${fmtSize(f.metadata.size)}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => downloadFile(f)}
                        disabled={busyName === f.name}
                        className="text-xs font-medium text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors disabled:opacity-50">
                        {busyName === f.name ? '처리 중…' : '다운로드'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(f)}
                        disabled={busyName === f.name}
                        className="text-xs font-medium text-gray-400 hover:text-red-500 border border-transparent hover:border-red-200 rounded-lg px-2 py-1.5 transition-colors disabled:opacity-50">
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* 삭제 확인 창 */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="text-base font-bold text-gray-900 mb-2">이 파일을 삭제할까요?</div>
            <p className="text-sm text-gray-600 mb-4">
              <span className="font-semibold">{displayName(confirmDelete.name)}</span> 파일이 영구 삭제됩니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                취소
              </button>
              <button
                onClick={deleteFile}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors">
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
