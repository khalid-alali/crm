import { getAppSession } from '@/lib/app-auth'
import AllTasksClient from '@/components/tasks/AllTasksClient'

export default async function TasksPage() {
  const session = await getAppSession()
  return <AllTasksClient currentUserEmail={session?.user?.email ?? ''} />
}
