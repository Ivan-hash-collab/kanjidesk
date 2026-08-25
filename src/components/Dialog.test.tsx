import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, it } from 'vitest'
import { Dialog } from '../components/Dialog'

function Stack() {
  const [outer, setOuter] = useState(true)
  const [inner, setInner] = useState(true)
  return (
    <>
      <Dialog open={outer} onClose={() => setOuter(false)} labelledBy="outer-title">
        <h3 id="outer-title">Редактор</h3>
        <button type="button" onClick={() => setOuter(false)}>
          Закрыть редактор
        </button>
        <Dialog open={inner} onClose={() => setInner(false)} labelledBy="inner-title">
          <h3 id="inner-title">Gemini</h3>
          <button type="button" onClick={() => setInner(false)}>
            Закрыть Gemini
          </button>
        </Dialog>
      </Dialog>
      {!outer ? <p>редактор закрыт</p> : null}
    </>
  )
}

it('closes the topmost dialog first and then the editor with its own button', async () => {
  const user = userEvent.setup()
  render(<Stack />)

  expect(screen.getByRole('dialog', { name: 'Gemini' })).toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: 'Gemini' })).not.toBeInTheDocument()
  expect(screen.getByRole('dialog', { name: 'Редактор' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Закрыть редактор' }))
  expect(screen.getByText('редактор закрыт')).toBeInTheDocument()
})
