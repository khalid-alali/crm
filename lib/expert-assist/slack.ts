export async function postExpertAssistSlack(text: string): Promise<void> {
  const url = process.env.EXPERT_ASSIST_SLACK_WEBHOOK_URL?.trim()
  if (!url) return
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch (e) {
    console.error('postExpertAssistSlack', e)
  }
}
