import Link from 'next/link'
import NewAccountForm from './NewAccountForm'

export default function NewAccountPage() {
  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Add account</h1>
        <Link href="/accounts" className="shrink-0 text-sm font-medium text-brand-600 hover:text-brand-700">
          Back to accounts
        </Link>
      </div>
      <NewAccountForm />
    </div>
  )
}
