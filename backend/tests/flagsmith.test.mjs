import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import { afterEach, test } from 'node:test'
import { loadConfig } from '../dist/config.js'
import { FlagsmithService, FlagsmithServiceError, normalizeApiUrl } from '../dist/flagsmith.js'
import { createApp } from '../dist/server.js'

const activeServers = new Set()

afterEach(async () => {
  await Promise.all([...activeServers].map((server) => new Promise((resolve) => server.close(resolve))))
  activeServers.clear()
})

function config(overrides = {}) {
  return loadConfig({
    FLAGSMITH_API_URL: 'https://flagsmith.test/api/v1/',
    FLAGSMITH_DEVELOPMENT_ENVIRONMENT_KEY: 'test-development-key',
    FLAGSMITH_STAGING_ENVIRONMENT_KEY: 'test-staging-key',
    FLAGSMITH_ENVIRONMENT_NAME: 'Production',
    PORT: '3002',
    ...overrides,
  })
}

function feature(name, enabled = true, value = true) {
  return {
    enabled,
    feature_state_value: value,
    feature: { id: 11, name },
  }
}

function flagsmithService(response, options = {}) {
  return new FlagsmithService(config(options.config), {
    timeoutMs: options.timeoutMs ?? 100,
    fetch: options.fetch ?? (async () => response.clone()),
  })
}

async function listen(app) {
  const server = createServer(app)
  activeServers.add(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return `http://127.0.0.1:${address.port}`
}

function getWithBody(url, body) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method: 'GET', headers: { 'content-length': Buffer.byteLength(body) } }, (response) => {
      let responseBody = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { responseBody += chunk })
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(responseBody) }))
    })
    request.on('error', reject)
    request.end(body)
  })
}

test('evaluates Flagsmith flags through the official SDK and reports real values', async () => {
  const service = flagsmithService(new Response(JSON.stringify([
    feature('checkout_v2', true, { cohort: 'early' }),
    feature('legacy_checkout', false, false),
  ]), { status: 200, headers: { 'content-type': 'application/json' } }))

  const result = await service.evaluateFlags('Development')
  assert.deepEqual(result, [
    { id: 'checkout_v2', key: 'checkout_v2', enabled: true, value: { cohort: 'early' } },
    { id: 'legacy_checkout', key: 'legacy_checkout', enabled: false, value: false },
  ])
})

test('Flagsmith SDK traffic uses read-only GET evaluation requests only', async () => {
  const methods = []
  const service = new FlagsmithService(config(), {
    fetch: async (_input, init) => {
      methods.push(init?.method ?? 'GET')
      return new Response('[]', { status: 200 })
    },
  })

  await service.evaluateFlags('Development')
  assert.ok(methods.length > 0)
  assert.deepEqual(methods, methods.map(() => 'GET'))
})

test('preserves Flagsmith string and null values without inferring types from content', async () => {
  const service = flagsmithService(new Response(JSON.stringify([
    feature('string_true', true, 'true'),
    feature('string_number', true, '123'),
    feature('unset_value', false, null),
  ]), { status: 200, headers: { 'content-type': 'application/json' } }))

  assert.deepEqual(await service.evaluateFlags('Development'), [
    { id: 'string_true', key: 'string_true', enabled: true, value: 'true' },
    { id: 'string_number', key: 'string_number', enabled: true, value: '123' },
    { id: 'unset_value', key: 'unset_value', enabled: false, value: null },
  ])
})

test('treats a verified environment with zero flags as a successful empty result', async () => {
  const service = flagsmithService(new Response('[]', { status: 200 }))
  assert.deepEqual(await service.evaluateFlags('Development'), [])
})

test('supports separate backend keys per environment and only lists configured environments', async () => {
  const currentConfig = config()
  const service = new FlagsmithService(currentConfig, {
    fetch: async (_input, init) => {
      assert.equal(new Headers(init?.headers).get('X-Environment-Key'), 'test-staging-key')
      return new Response('[]', { status: 200 })
    },
  })

  assert.deepEqual(service.getConfiguredEnvironments(), ['Development', 'Staging'])
  assert.deepEqual(await service.evaluateFlags('Staging'), [])
})

test('maps the legacy single environment key only to its declared environment', async () => {
  const currentConfig = config({
    FLAGSMITH_DEVELOPMENT_ENVIRONMENT_KEY: '',
    FLAGSMITH_STAGING_ENVIRONMENT_KEY: '',
    FLAGSMITH_ENVIRONMENT_KEY: 'legacy-production-key',
    FLAGSMITH_ENVIRONMENT_NAME: 'Production',
  })
  const service = new FlagsmithService(currentConfig, {
    fetch: async (_input, init) => {
      assert.equal(new Headers(init?.headers).get('X-Environment-Key'), 'legacy-production-key')
      return new Response('[]', { status: 200 })
    },
  })
  assert.deepEqual(service.getConfiguredEnvironments(), ['Production'])
  await assert.rejects(service.evaluateFlags('Development'), { code: 'FLAGSMITH_ENVIRONMENT_NOT_CONFIGURED' })
  assert.deepEqual(await service.evaluateFlags('Production'), [])
})

test('returns a clear error without making an upstream request when an environment key is missing', async () => {
  const service = new FlagsmithService(config(), {
    fetch: async () => { throw new Error('fetch should not run') },
  })
  await assert.rejects(service.evaluateFlags('Production'), {
    name: 'FlagsmithServiceError',
    code: 'FLAGSMITH_ENVIRONMENT_NOT_CONFIGURED',
    statusCode: 503,
  })
})

test('sanitizes invalid-key and permission errors without leaking upstream response content', async () => {
  const service = flagsmithService(new Response('secret-key should never be returned', { status: 403 }))
  await assert.rejects(service.evaluateFlags('Development'), (error) => {
    assert.ok(error instanceof FlagsmithServiceError)
    assert.equal(error.code, 'FLAGSMITH_PERMISSION_DENIED')
    assert.doesNotMatch(error.message, /secret-key/)
    return true
  })
})

test('sanitizes Flagsmith errors at the HTTP boundary and omits upstream secrets', async () => {
  const service = flagsmithService(new Response('upstream response contains private-environment-key', { status: 403 }))
  const baseUrl = await listen(createApp(config(), service))
  const originalError = console.error
  const logs = []
  console.error = (...values) => { logs.push(values.join(' ')) }
  try {
    const response = await fetch(`${baseUrl}/api/flagsmith/environments/Development/connection`)
    const body = await response.text()

    assert.equal(response.status, 502)
    assert.match(body, /FLAGSMITH_PERMISSION_DENIED/)
    assert.doesNotMatch(body, /private-environment-key|upstream response|stack|secret/)
    assert.doesNotMatch(logs.join(' '), /private-environment-key|upstream response|stack|secret/)
    assert.deepEqual(logs, ['[flagsmith] FLAGSMITH_PERMISSION_DENIED'])
  } finally {
    console.error = originalError
  }
})

test('distinguishes upstream network failures and timeouts', async () => {
  const networkFailure = flagsmithService(undefined, {
    fetch: async () => { throw new TypeError('private transport details') },
  })
  await assert.rejects(networkFailure.evaluateFlags('Development'), { code: 'FLAGSMITH_UNREACHABLE' })

  const timedOut = flagsmithService(undefined, {
    timeoutMs: 5,
    fetch: async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    }),
  })
  await assert.rejects(timedOut.evaluateFlags('Development'), {
    code: 'FLAGSMITH_TIMEOUT',
    statusCode: 504,
  })
})

test('rejects malformed or unreadable Flagsmith responses', async () => {
  const malformedShape = flagsmithService(new Response(JSON.stringify({ flags: [] }), { status: 200 }))
  await assert.rejects(malformedShape.evaluateFlags('Development'), { code: 'FLAGSMITH_MALFORMED_RESPONSE' })

  const malformedJson = flagsmithService(new Response('{not-json', { status: 200 }))
  await assert.rejects(malformedJson.evaluateFlags('Development'), { code: 'FLAGSMITH_MALFORMED_RESPONSE' })
})

test('reports invalid API URL configuration through the connection API without crashing backend startup', async () => {
  assert.throws(() => normalizeApiUrl('not a url'), /valid URL/)
  assert.throws(() => normalizeApiUrl('http://flagsmith.example/api/v1/'), /must use HTTPS/)
  assert.throws(() => normalizeApiUrl('https://user:pass@flagsmith.test/api/v1/'), /cannot include credentials/)

  const invalidConfig = config({ FLAGSMITH_API_URL: 'not a url' })
  const service = new FlagsmithService(invalidConfig, {
    fetch: async () => { throw new Error('fetch should not run') },
  })
  const baseUrl = await listen(createApp(invalidConfig, service))
  const response = await fetch(`${baseUrl}/api/flagsmith/environments/Development/connection`)
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'FLAGSMITH_API_URL_INVALID')
})

test('connection and flags endpoints verify the selected environment and return only evaluated data', async () => {
  const service = flagsmithService(new Response(JSON.stringify([feature('release_flag')]), { status: 200 }))
  const baseUrl = await listen(createApp(config(), service))

  const connectionResponse = await fetch(`${baseUrl}/api/flagsmith/environments/Development/connection`)
  assert.equal(connectionResponse.status, 200)
  const connection = await connectionResponse.json()
  assert.equal(connection.connected, true)
  assert.equal(connection.environment, 'Development')
  assert.equal(connection.flagCount, 1)

  const flagsResponse = await fetch(`${baseUrl}/api/flagsmith/environments/Development/flags`)
  assert.equal(flagsResponse.status, 200)
  const flags = await flagsResponse.json()
  assert.equal(flags.source, 'flagsmith')
  assert.equal(flags.flags[0].key, 'release_flag')
  assert.equal(JSON.stringify(flags).includes('test-development-key'), false)
})

test('endpoints report empty configured environments accurately and reject unavailable environments', async () => {
  const service = flagsmithService(new Response('[]', { status: 200 }))
  const baseUrl = await listen(createApp(config(), service))

  const response = await fetch(`${baseUrl}/api/flagsmith/environments/Staging/connection`)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).flagCount, 0)

  const missing = await fetch(`${baseUrl}/api/flagsmith/environments/Production/flags`)
  assert.equal(missing.status, 503)
  assert.equal((await missing.json()).error.code, 'FLAGSMITH_ENVIRONMENT_NOT_CONFIGURED')

  const invalid = await fetch(`${baseUrl}/api/flagsmith/environments/Testing/flags`)
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).error.code, 'INVALID_ENVIRONMENT')
})

test('health endpoint is available and CORS allows only configured frontend origins', async () => {
  const currentConfig = config({
    FLAGPILOT_CORS_ORIGINS: 'https://flagpilot.vercel.app',
  })
  const baseUrl = await listen(createApp(currentConfig, flagsmithService(new Response('[]', { status: 200 }))))

  const allowed = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'https://flagpilot.vercel.app' },
  })
  assert.equal(allowed.status, 200)
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://flagpilot.vercel.app')
  assert.deepEqual(await allowed.json(), { status: 'ok', service: 'flagpilot-backend' })

  const denied = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'https://unapproved.example' },
  })
  assert.equal(denied.status, 200)
  assert.equal(denied.headers.get('access-control-allow-origin'), null)
  assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(allowed.headers.get('x-powered-by'), null)
})

test('backend configuration supports hosted bind address and platform-assigned port', () => {
  const hostedConfig = config({
    HOST: '0.0.0.0',
    PORT: '10000',
    FLAGPILOT_CORS_ORIGINS: 'https://flagpilot.vercel.app',
  })
  assert.equal(hostedConfig.host, '0.0.0.0')
  assert.equal(hostedConfig.port, 10000)
  assert.deepEqual([...hostedConfig.allowedOrigins], ['https://flagpilot.vercel.app'])
  assert.equal(hostedConfig.trustProxyHops, 0)
})

test('production CORS has no implicit development origins and invalid startup settings fail clearly', () => {
  const productionConfig = config({ NODE_ENV: 'production' })
  assert.deepEqual([...productionConfig.allowedOrigins], [])
  assert.throws(() => config({ FLAGPILOT_CORS_ORIGINS: 'https://valid.example/path' }), {
    message: 'FLAGPILOT_CORS_ORIGINS must contain exact HTTP(S) origins without paths or credentials.',
  })
  assert.throws(() => config({ HOST: '0.0.0.0/invalid' }), {
    message: 'HOST must be a valid IP address or hostname.',
  })
  assert.throws(() => config({ TRUST_PROXY_HOPS: '6' }), {
    message: 'TRUST_PROXY_HOPS must be an integer between 0 and 5.',
  })
})

test('rejects request bodies and query strings and caps oversized payloads safely', async () => {
  const baseUrl = await listen(createApp(config(), flagsmithService(new Response('[]', { status: 200 }))))

  const queryResponse = await fetch(`${baseUrl}/api/health?debug=true`)
  assert.equal(queryResponse.status, 400)
  assert.equal((await queryResponse.json()).error.code, 'INVALID_QUERY')

  const getBodyResponse = await getWithBody(`${baseUrl}/api/health`, 'private request body')
  assert.equal(getBodyResponse.status, 400)
  assert.equal(getBodyResponse.body.error.code, 'REQUEST_BODY_NOT_ALLOWED')

  const unsupportedBody = await fetch(`${baseUrl}/api/flagsmith/flags`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  assert.equal(unsupportedBody.status, 405)
  assert.equal((await unsupportedBody.json()).error.code, 'METHOD_NOT_ALLOWED')

  const unsupportedMalformedBody = await fetch(`${baseUrl}/api/health`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"private":"do-not-echo"',
  })
  assert.equal(unsupportedMalformedBody.status, 405)
  assert.equal((await unsupportedMalformedBody.json()).error.code, 'METHOD_NOT_ALLOWED')

  const oversized = await fetch(`${baseUrl}/api/health`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(11 * 1024) }),
  })
  assert.equal(oversized.status, 413)
  assert.equal((await oversized.json()).error.code, 'PAYLOAD_TOO_LARGE')
})

test('sanitizes unexpected backend failures in HTTP responses and logs', async () => {
  const originalError = console.error
  const logs = []
  console.error = (...values) => { logs.push(values.join(' ')) }
  try {
    const service = {
      evaluateFlags: async () => { throw new Error('private environment key and upstream response') },
      getConfiguredEnvironments: () => [],
    }
    const baseUrl = await listen(createApp(config(), service))
    const response = await fetch(`${baseUrl}/api/flagsmith/environments/Development/connection`)
    const body = await response.text()

    assert.equal(response.status, 500)
    assert.match(body, /INTERNAL_ERROR/)
    assert.doesNotMatch(body, /private environment key|upstream response|stack/)
    assert.deepEqual(logs, ['[backend] Request failed'])
  } finally {
    console.error = originalError
  }
})

test('rejects all non-read-only methods and exposes no flag mutation endpoints', async () => {
  const baseUrl = await listen(createApp(config(), flagsmithService(new Response('[]', { status: 200 }))))

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await fetch(`${baseUrl}/api/flagsmith/environments/Development/flags`, { method })
    assert.equal(response.status, 405, `${method} must be rejected`)
    assert.equal((await response.json()).error.code, 'METHOD_NOT_ALLOWED')
  }
  const createFlag = await fetch(`${baseUrl}/api/flagsmith/flags`, { method: 'POST' })
  assert.equal(createFlag.status, 405)
  const updateFlag = await fetch(`${baseUrl}/api/flagsmith/flags/release_flag`, { method: 'PUT' })
  assert.equal(updateFlag.status, 405)
  const mutation = await fetch(`${baseUrl}/api/flagsmith/identify`)
  assert.equal(mutation.status, 404)
  assert.equal((await mutation.json()).error.code, 'NOT_FOUND')
})

test('rate limits health and API requests with a sanitized JSON response', async () => {
  const baseUrl = await listen(createApp(config(), flagsmithService(new Response('[]', { status: 200 }))))

  for (let requestNumber = 0; requestNumber < 60; requestNumber += 1) {
    const response = await fetch(`${baseUrl}/api/health`)
    assert.equal(response.status, 200)
  }
  const limited = await fetch(`${baseUrl}/api/flagsmith/environments/Development/connection`)
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.has('retry-after'), true)
  assert.deepEqual(await limited.json(), {
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Wait briefly, then try again.' },
  })
})
