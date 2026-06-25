import TechSurveyClient from './TechSurveyClient'

export default async function TechSurveyPage({ params }: { params: Promise<{ techToken: string }> }) {
  const { techToken } = await params
  return <TechSurveyClient techToken={techToken} />
}
