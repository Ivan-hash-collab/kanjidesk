export function speakJa(text: string, enabled: boolean): void {
  if (!enabled || !text || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ja-JP'
  u.rate = 0.88
  window.speechSynthesis.speak(u)
}
