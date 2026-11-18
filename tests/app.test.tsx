import { describe, expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../src/App'

describe('app smoke test (rendered UI)', () => {
  test('open the example, step, inspect, branch and compare', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /Open The Shattered Isles/ }))
    expect(await screen.findByLabelText('Map of The Shattered Isles')).toBeInTheDocument()

    const step = () => document.querySelector('.step-num')?.textContent
    expect(step()).toBe('0')
    await user.click(screen.getByRole('button', { name: 'Advance one step' }))
    expect(step()).toBe('1')
    await user.click(screen.getByRole('button', { name: 'Advance ten steps' }))
    expect(step()).toBe('11')

    // Inspect a settlement from the sidebar: inspector shows its real current values.
    const nav = screen.getByRole('navigation', { name: 'World contents' })
    await user.click(within(nav).getByRole('button', { name: /Port Vesper/ }))
    const inspector = screen.getByRole('complementary', { name: 'Inspector' })
    expect(within(inspector).getByText('Port Vesper', { selector: 'h2' })).toBeInTheDocument()
    expect(within(inspector).getByText(/records an/)).toBeInTheDocument()

    // Branch from the current step through the dialog.
    await user.click(screen.getByRole('button', { name: /Branch from 11/ }))
    const name = await screen.findByLabelText('Branch name')
    await user.clear(name)
    await user.type(name, 'Experiment{Enter}')
    expect(await screen.findByRole('button', { name: /Experiment/, current: true })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Compare/ }))
    expect(await screen.findByText('Why they differ')).toBeInTheDocument()
    expect(screen.getByText(/identical inputs/)).toBeInTheDocument()
  })
})
