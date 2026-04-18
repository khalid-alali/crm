'use client'

import { useEffect, type ReactNode } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Bold, Italic, Link2, List, ListOrdered } from 'lucide-react'

type Props = {
  value: string
  onChange: (html: string) => void
  /** Shorter min height for follow-up style emails */
  compact?: boolean
}

export function EmailBodyEditor({ value, onChange, compact }: Props) {
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

  if (!editor) {
    return (
      <div
        className={`rounded border border-arctic-200 bg-arctic-50 ${compact ? 'min-h-32' : 'min-h-[280px]'}`}
        aria-hidden
      />
    )
  }

  const minH = compact ? 'min-h-32' : 'min-h-[280px]'

  return (
    <div className="email-tiptap-editor overflow-hidden rounded border border-arctic-200">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-arctic-200 bg-arctic-50 px-1.5 py-1">
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
          active={editor.isActive('link')}
          onClick={() => {
            const prev = editor.getAttributes('link').href as string | undefined
            const url = window.prompt('Link URL', prev ?? 'https://')
            if (url === null) return
            const trimmed = url.trim()
            if (trimmed === '') {
              editor.chain().focus().extendMarkRange('link').unsetLink().run()
              return
            }
            editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run()
          }}
        >
          <Link2 className="h-4 w-4" />
        </ToolbarIcon>
      </div>
      <EditorContent editor={editor} className={`email-tiptap-editor__content ${minH} overflow-y-auto bg-white`} />
    </div>
  )
}

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
