import SiteSurveyClient from './SiteSurveyClient'

export default async function SiteSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <SiteSurveyClient token={token} />
}
