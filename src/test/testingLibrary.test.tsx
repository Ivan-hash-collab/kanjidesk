import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'

function TestControl() {
  const [enabled, setEnabled] = useState(false)
  return <button onClick={() => setEnabled(true)}>{enabled ? 'ready' : 'enable'}</button>
}

it('provides the React Testing Library jsdom harness', async () => {
  const user = userEvent.setup()
  render(<TestControl />)

  await user.click(screen.getByRole('button', { name: 'enable' }))

  expect(screen.getByRole('button', { name: 'ready' })).toBeInTheDocument()
})
