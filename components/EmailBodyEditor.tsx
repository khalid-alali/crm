'use client'

import type { Editor } from '@tiptap/core'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Bold, Italic, Link2, List, ListOrdered } from 'lucide-react'
import {
  CAPABILITIES_LINK_PLACEHOLDER,
  ENROLLMENT_PORTAL_LINK_PLACEHOLDER,
  EXPERT_ASSIST_LINK_PLACEHOLDER,
} from '@/lib/email-template-placeholder-tokens'

export type EmailBodyEditorHandle = {
  insertText: (text: string) => void
}

type Props = {
  value: string
  onChange: (html: string) => void
  /** Shorter min height for follow-up style emails */
  compact?: boolean
}

function EmailEditorToolbar({ editor }: { editor: Editor }) {
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [selectFirstHint, setSelectFirstHint] = useState(false)
  const savedRangeRef = useRef<{ from: number; to: number } | null>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const toolbarWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!linkPopoverOpen) return
    const t = requestAnimationFrame(() => {
      urlInputRef.current?.focus()
      urlInputRef.current?.select()
    })
    return () => cancelAnimationFrame(t)
  }, [linkPopoverOpen])

  useEffect(() => {
    if (!linkPopoverOpen) return
    const onDocMouseDown = (e: MouseEvent) => {
      const el = toolbarWrapRef.current
      if (el && !el.contains(e.target as Node)) {
        setLinkPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [linkPopoverOpen])

  useEffect(() => {
    if (!linkPopoverOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setLinkPopoverOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [linkPopoverOpen])

  useEffect(() => {
    const clearHint = () => {
      if (!editor.state.selection.empty) setSelectFirstHint(false)
    }
    editor.on('selectionUpdate', clearHint)
    return () => {
      editor.off('selectionUpdate', clearHint)
    }
  }, [editor])

  function openLinkPopover() {
    if (editor.state.selection.empty) {
      setSelectFirstHint(true)
      setLinkPopoverOpen(false)
      return
    }
    setSelectFirstHint(false)
    const { from, to } = editor.state.selection
    savedRangeRef.current = { from, to }
    const href = editor.getAttributes('link').href as string | undefined
    setLinkUrl(typeof href === 'string' ? href : '')
    setLinkPopoverOpen(true)
  }

  function closeLinkPopover() {
    setLinkPopoverOpen(false)
  }

  function applyLink() {
    const r = savedRangeRef.current
    if (!r) {
      closeLinkPopover()
      return
    }
    const trimmed = linkUrl.trim()
    const chain = editor.chain().focus().setTextSelection({ from: r.from, to: r.to })
    if (trimmed === '') {
      chain.unsetLink().run()
    } else {
      chain.setLink({ href: trimmed }).run()
    }
    closeLinkPopover()
  }

  return (
    <div ref={toolbarWrapRef} className="sticky top-0 z-10 border-b border-arctic-200 bg-arctic-50">
      <div className="relative flex flex-wrap items-center gap-0.5 px-1.5 py-1">
        <ToolbarIcon
          label="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolbarIcon>
        <ToolbarIcon
          label="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolbarIcon>
        <span className="mx-0.5 h-5 w-px bg-arctic-300" aria-hidden />
        <ToolbarIcon
          label="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarIcon>
        <ToolbarIcon
          label="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarIcon>
        <span className="mx-0.5 h-5 w-px bg-arctic-300" aria-hidden />
        <ToolbarIcon
          label="Link"
          active={editor.isActive('link') || linkPopoverOpen}
          onClick={openLinkPopover}
        >
          <Link2 className="h-4 w-4" />
        </ToolbarIcon>
      </div>
      {selectFirstHint && (
        <p className="border-t border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          Select text first to add a link
        </p>
      )}
      {linkPopoverOpen && (
        <div className="absolute left-2 right-2 top-full z-20 mt-1 rounded-lg border border-arctic-200 bg-white p-3 shadow-lg">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-onix-500">
            Link URL
          </label>
          <input
            ref={urlInputRef}
            type="text"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-arctic-300 px-2 py-1.5 font-mono text-sm text-onix-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="https://…"
          />
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-onix-500">
            Or insert a placeholder
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setLinkUrl(CAPABILITIES_LINK_PLACEHOLDER)}
              className="rounded-full bg-emerald-50 px-2.5 py-1 font-mono text-[11px] text-emerald-900 hover:bg-emerald-100"
            >
              {CAPABILITIES_LINK_PLACEHOLDER}
            </button>
            <button
              type="button"
              onClick={() => setLinkUrl(EXPERT_ASSIST_LINK_PLACEHOLDER)}
              className="rounded-full bg-sky-50 px-2.5 py-1 font-mono text-[11px] text-sky-900 hover:bg-sky-100"
            >
              {EXPERT_ASSIST_LINK_PLACEHOLDER}
            </button>
            <button
              type="button"
              onClick={() => setLinkUrl(ENROLLMENT_PORTAL_LINK_PLACEHOLDER)}
              className="rounded-full bg-violet-50 px-2.5 py-1 font-mono text-[11px] text-violet-900 hover:bg-violet-100"
            >
              {ENROLLMENT_PORTAL_LINK_PLACEHOLDER}
            </button>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeLinkPopover}
              className="rounded-md border border-arctic-300 bg-white px-3 py-1.5 text-sm text-onix-700 hover:bg-arctic-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => applyLink()}
              className="rounded-md bg-onix-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-onix-900"
            >
              Add link
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export const EmailBodyEditor = forwardRef<EmailBodyEditorHandle, Props>(function EmailBodyEditor(
  { value, onChange, compact },
  ref,
) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({ openOnClick: false, autolink: false }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) return
    const cur = editor.getHTML()
    if (cur === value) return
    editor.commands.setContent(value, { emitUpdate: false })
  }, [editor, value])

  useImperativeHandle(
    ref,
    () => ({
      insertText: (text: string) => {
        if (!editor) return
        editor.chain().focus().insertContent(text).run()
      },
    }),
    [editor],
  )

  if (!editor) {
    return (
      <div
        className={`rounded border border-arctic-200 bg-arctic-50 ${compact ? 'min-h-32' : 'h-[min(78vh,880px)] min-h-[640px]'}`}
        aria-hidden
      />
    )
  }

  if (compact) {
    return (
      <div className="email-tiptap-editor overflow-hidden rounded border border-arctic-200">
        <EmailEditorToolbar editor={editor} />
        <EditorContent
          editor={editor}
          className="email-tiptap-editor__content min-h-32 overflow-y-auto bg-white"
        />
      </div>
    )
  }

  return (
    <div className="email-tiptap-editor flex h-[min(78vh,880px)] min-h-[640px] flex-col overflow-hidden rounded border border-arctic-200 bg-white">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white">
        <div className="shrink-0">
          <EmailEditorToolbar editor={editor} />
        </div>
        <div className="min-h-0 flex-1 bg-white">
          <EditorContent
            editor={editor}
            className="email-tiptap-editor__content h-full min-h-[28rem] bg-white"
          />
        </div>
      </div>
    </div>
  )
})

function ToolbarIcon({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`rounded p-1.5 ${active ? 'bg-brand-100 text-brand-800' : 'text-onix-600 hover:bg-arctic-100'}`}
    >
      {children}
    </button>
  )
}
