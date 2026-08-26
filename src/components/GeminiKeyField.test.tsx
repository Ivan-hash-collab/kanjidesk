import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { GeminiKeyField } from './GeminiKeyField'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubKeyApi(opts: { configured?: boolean; hint?: string; failGet?: boolean } = {}) {
  const configured = opts.configured ?? false
  const hint = opts.hint ?? ''
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (!url.includes('gemini-key')) return new Response('{}', { status: 404 })
      if (opts.failGet && (!init?.method || init.method === 'GET')) {
        return new Response('down', { status: 502 })
      }
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body || '{}')) as { key?: string }
        if (!body.key || body.key.length < 16) {
          return new Response(JSON.stringify({ detail: 'Вставь ключ целиком — без пробелов и переносов' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return Response.json({ configured: true, hint: '…3456' })
      }
      if (init?.method === 'DELETE') return Response.json({ configured: false, hint: '' })
      return Response.json({ configured, hint })
    }),
  )
}

it('saves a pasted Gemini key', async () => {
  stubKeyApi()
  const user = userEvent.setup()
  render(<GeminiKeyField />)

  const input = await screen.findByLabelText('Ключ Gemini API')
  await user.type(input, 'AIzaSyFakeKeyForTests3456')
  await user.click(screen.getByRole('button', { name: 'Сохранить ключ' }))

  expect(await screen.findByText('Ключ сохранён — мнемоники пойдут через Gemini')).toBeInTheDocument()
  expect(screen.getByText('…3456')).toBeInTheDocument()
  expect(input).toHaveValue('')
})

it('shows a fallback when the agent is down', async () => {
  stubKeyApi({ failGet: true })
  render(<GeminiKeyField />)
  expect(await screen.findByText(/Поле ключа откроется/)).toBeInTheDocument()
})
