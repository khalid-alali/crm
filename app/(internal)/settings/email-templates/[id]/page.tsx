'use client'

import { useParams } from 'next/navigation'
import EmailTemplateForm from '@/components/email-templates/EmailTemplateForm'

export default function EditEmailTemplatePage() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''
  return <EmailTemplateForm mode="edit" templateId={id} />
}
