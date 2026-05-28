const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { runCriteria } = require('./score.js')

test('runCriteria passes criteria with successful commands', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-criteria-'))
  try {
    const criteria = [
      { id: 'always_pass', command: 'true' },
      { id: 'also_pass', command: 'echo ok' },
    ]
    const results = runCriteria(criteria, root)
    assert.deepEqual(results, [
      { id: 'always_pass', pass: true },
      { id: 'also_pass', pass: true },
    ])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('runCriteria fails criteria with non-zero exit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-criteria-fail-'))
  try {
    const criteria = [
      { id: 'will_fail', command: 'false' },
      { id: 'will_pass', command: 'true' },
    ]
    const results = runCriteria(criteria, root)
    assert.deepEqual(results, [
      { id: 'will_fail', pass: false },
      { id: 'will_pass', pass: true },
    ])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('runCriteria uses cwd for command execution', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-criteria-cwd-'))
  try {
    fs.writeFileSync(path.join(root, 'marker.txt'), 'exists\n')
    const criteria = [
      { id: 'file_exists', command: 'test -f marker.txt' },
    ]
    const results = runCriteria(criteria, root)
    assert.deepEqual(results, [{ id: 'file_exists', pass: true }])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('runCriteria sets RUN_DIR env variable when provided', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-criteria-env-'))
  try {
    const criteria = [
      { id: 'has_run_dir', command: 'test -n "$RUN_DIR"' },
    ]
    const results = runCriteria(criteria, root, { runDir: '/some/path' })
    assert.deepEqual(results, [{ id: 'has_run_dir', pass: true }])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('runCriteria handles commands that check file content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-criteria-content-'))
  try {
    fs.writeFileSync(path.join(root, 'output.js'), 'const x = require("dep")\nfunction hello() { return "world" }\nmodule.exports = { hello }\n')
    const criteria = [
      { id: 'has_function', command: 'grep -q "function hello" output.js' },
      { id: 'has_export', command: 'grep -q "module.exports" output.js' },
      { id: 'no_import', command: '! grep -q "require(" output.js' },
    ]
    const results = runCriteria(criteria, root)
    assert.deepEqual(results, [
      { id: 'has_function', pass: true },
      { id: 'has_export', pass: true },
      { id: 'no_import', pass: false },
    ])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
