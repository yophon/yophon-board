export const TEXT_FONT_FAMILY = '"PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif'
export const DEFAULT_TEXT_FONT_SIZE = 28
export const DEFAULT_TEXT_WIDTH = 280
export const MIN_TEXT_FONT_SIZE = 8
export const MAX_TEXT_FONT_SIZE = 160

export function getTextFont(fontSize: number, bold = false, italic = false) {
  const style = italic ? 'italic ' : ''
  const weight = bold ? '700 ' : ''
  return `${style}${weight}${fontSize}px ${TEXT_FONT_FAMILY}`
}

export function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const paragraphs = text.split(/\r?\n/)
  const lines: string[] = []
  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push('')
      continue
    }

    let line = ''
    for (const char of Array.from(paragraph)) {
      const next = line + char
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line)
        line = char
      } else {
        line = next
      }
    }
    lines.push(line)
  }
  return lines
}

export function measureTextBox(
  ctx: CanvasRenderingContext2D | null | undefined,
  text = '',
  fontSize = DEFAULT_TEXT_FONT_SIZE,
  width = DEFAULT_TEXT_WIDTH,
  bold = false,
  italic = false,
) {
  const padding = getTextPadding(fontSize)
  const lineHeight = getTextLineHeight(fontSize)
  if (!ctx) return { width, height: Math.ceil(lineHeight + padding * 2), fontSize }

  ctx.save()
  ctx.font = getTextFont(fontSize, bold, italic)
  const lines = wrapTextLines(ctx, text, width - padding * 2)
  const textWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0)
  ctx.restore()

  return {
    width: Math.min(width, Math.max(80, Math.ceil(textWidth + padding * 2))),
    height: Math.max(36, Math.ceil(lines.length * lineHeight + padding * 2)),
    fontSize,
  }
}

export function getTextPadding(fontSize: number) {
  return Math.max(4, fontSize * 0.12)
}

export function getTextLineHeight(fontSize: number) {
  return fontSize * 1.25
}

export function clampTextFontSize(value: number) {
  return Math.max(MIN_TEXT_FONT_SIZE, Math.min(MAX_TEXT_FONT_SIZE, value))
}
