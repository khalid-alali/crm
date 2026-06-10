import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'
import { counterCardDiagnoseUrl } from '@/lib/activation/urls'

export async function buildCounterCardPdf(input: {
  shopName: string
  casePartner: string
}): Promise<Uint8Array> {
  const diagnoseUrl = counterCardDiagnoseUrl(input.casePartner)
  const qrPng = await QRCode.toBuffer(diagnoseUrl, {
    type: 'png',
    margin: 1,
    width: 280,
    errorCorrectionLevel: 'M',
  })

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const { width, height } = page.getSize()
  const margin = 48

  page.drawText('Expert Assist', {
    x: margin,
    y: height - margin - 24,
    size: 22,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  })

  page.drawText(input.shopName, {
    x: margin,
    y: height - margin - 52,
    size: 16,
    font,
    color: rgb(0.2, 0.2, 0.2),
  })

  page.drawText('Scan for EV diagnosis & referral', {
    x: margin,
    y: height - margin - 80,
    size: 12,
    font,
    color: rgb(0.35, 0.35, 0.35),
  })

  const qrImage = await pdf.embedPng(qrPng)
  const qrSize = 220
  page.drawImage(qrImage, {
    x: (width - qrSize) / 2,
    y: height / 2 - qrSize / 2 - 20,
    width: qrSize,
    height: qrSize,
  })

  page.drawText('Powered by RepairWise · repairwise.com/diagnose', {
    x: margin,
    y: margin + 12,
    size: 9,
    font,
    color: rgb(0.45, 0.45, 0.45),
  })

  return pdf.save()
}
