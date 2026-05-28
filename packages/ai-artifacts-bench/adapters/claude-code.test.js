const assert = require('node:assert/strict')
const test = require('node:test')

const { buildFlags, parseUsage } = require('./claude-code.js')

test('buildFlags produces default flags for minimal variant', () => {
  const flags = buildFlags({}, { budget: 2.0 })
  assert.ok(flags.includes('-p'))
  assert.ok(flags.includes('--output-format'))
  assert.ok(flags.includes('json'))
  assert.ok(flags.includes('--dangerously-skip-permissions'))
  assert.ok(flags.includes('--no-session-persistence'))
  assert.ok(flags.includes('--max-budget-usd'))
  assert.ok(flags.includes('2'))
})

test('buildFlags adds --bare for bare variants', () => {
  const flags = buildFlags({ bare: true }, {})
  assert.ok(flags.includes('--bare'))
})

test('buildFlags adds --disable-slash-commands when skills disabled', () => {
  const flags = buildFlags({ disable_skills: true }, {})
  assert.ok(flags.includes('--disable-slash-commands'))
})

test('buildFlags adds --model when specified', () => {
  const flags = buildFlags({ model: 'opus' }, {})
  assert.ok(flags.includes('--model'))
  assert.ok(flags.includes('opus'))
})

test('buildFlags prefers options.model over variant.model', () => {
  const flags = buildFlags({ model: 'sonnet' }, { model: 'opus' })
  const modelIdx = flags.indexOf('--model')
  assert.equal(flags[modelIdx + 1], 'opus')
})

test('buildFlags adds system prompt when provided', () => {
  const flags = buildFlags({ system_prompt: 'be concise' }, {})
  assert.ok(flags.includes('--system-prompt'))
  assert.ok(flags.includes('be concise'))
})

test('buildFlags adds debug file when provided', () => {
  const flags = buildFlags({}, { debugFile: '/tmp/debug.log' })
  assert.ok(flags.includes('--debug-file'))
  assert.ok(flags.includes('/tmp/debug.log'))
})

test('parseUsage extracts Claude Code JSON output', () => {
  const raw = JSON.stringify({
    modelUsage: { 'claude-opus-4': { inputTokens: 5000, outputTokens: 3000, costUSD: 0.45, cacheReadInputTokens: 1000, cacheCreationInputTokens: 500 } },
    num_turns: 7,
    subtype: 'end_turn',
  })
  const result = parseUsage(raw)
  assert.equal(result.input_tokens, 5000)
  assert.equal(result.output_tokens, 3000)
  assert.equal(result.total_tokens, 8000)
  assert.equal(result.cost_usd, 0.45)
  assert.equal(result.cache_read_tokens, 1000)
  assert.equal(result.cache_write_tokens, 500)
  assert.equal(result.model, 'claude-opus-4')
  assert.equal(result.num_turns, 7)
  assert.equal(result.exit_type, 'end_turn')
})

test('parseUsage returns null for invalid input', () => {
  assert.equal(parseUsage('not json at all'), null)
  assert.equal(parseUsage(''), null)
})

test('adapter interface is compatible with runner expectations', () => {
  const adapter = require('./claude-code.js')
  assert.equal(typeof adapter.run, 'function')
  assert.equal(typeof adapter.parseUsage, 'function')
})
