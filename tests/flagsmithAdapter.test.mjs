import assert from 'node:assert/strict'
import test from 'node:test'
import { forEnvironment, getEnvironmentConfig } from '../src/features/flagConfiguration.ts'
import { createFlagDataSource, mapEvaluatedFlags } from '../src/integrations/flagDataSource.ts'

test('Flagsmith adapter preserves evaluated values and does not infer a null value from enabled state', () => {
  const flags = mapEvaluatedFlags([
    { id: '1', key: 'true_as_text', enabled: true, value: 'true' },
    { id: '2', key: 'number_as_text', enabled: true, value: '123' },
    { id: '3', key: 'unset', enabled: false, value: null },
  ], 'Production')

  assert.equal(flags[0].flagType, 'String')
  assert.equal(flags[0].value, 'true')
  assert.equal(flags[1].flagType, 'String')
  assert.equal(flags[1].value, '123')
  assert.equal(flags[2].value, null)
  assert.equal(getEnvironmentConfig(flags[2], 'Production').value, null)
  assert.equal(forEnvironment(flags[2], 'Production').value, null)
})

test('unavailable backend reports an error without substituting demo flags, while Demo Mode needs no backend', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  let fetchCount = 0
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout },
  })
  globalThis.fetch = async () => {
    fetchCount += 1
    throw new TypeError('backend unavailable')
  }

  try {
    const liveSource = createFlagDataSource({
      mode: 'live',
      backendUrl: 'https://backend.example',
      environment: 'Production',
    })
    let reportedError
    let deliveredFlags = false
    await assert.rejects(liveSource.initialize(
      () => { deliveredFlags = true },
      (error) => { reportedError = error },
      () => {},
    ), /Cannot reach FlagPilot backend/)
    assert.match(reportedError.message, /Cannot reach FlagPilot backend/)
    assert.equal(deliveredFlags, false)
    liveSource.dispose()

    const demoSource = createFlagDataSource({ mode: 'demo' })
    await demoSource.initialize(() => {}, () => {
      assert.fail('Demo Mode must not report a backend connection error')
    }, () => {})
    await demoSource.refresh()
    assert.equal(demoSource.mode, 'demo')
    assert.equal(fetchCount, 1)
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else delete globalThis.window
  }
})

test('sanitizes backend rate-limit and server errors before exposing them to the UI', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout },
  })

  try {
    for (const [status, code, expectedMessage] of [
      [429, 'RATE_LIMITED', /too many requests/i],
      [500, 'INTERNAL_ERROR', /backend could not complete/i],
    ]) {
      globalThis.fetch = async () => new Response(JSON.stringify({
        error: { code, message: 'private upstream token: do-not-display' },
      }), { status, headers: { 'content-type': 'application/json' } })
      const source = createFlagDataSource({
        mode: 'live',
        backendUrl: 'https://backend.example',
        environment: 'Production',
      })
      let reportedError
      await assert.rejects(source.initialize(() => {}, (error) => { reportedError = error }, () => {}), expectedMessage)
      assert.match(reportedError.message, expectedMessage)
      assert.doesNotMatch(reportedError.message, /private upstream token|do-not-display/)
      source.dispose()
    }
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else delete globalThis.window
  }
})
