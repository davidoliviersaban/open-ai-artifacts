'use strict'

const BAR_WIDTH = 30

function formatDuration(seconds) {
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return `${m}m${rem > 0 ? String(rem).padStart(2, '0') + 's' : ''}`
  const h = Math.floor(m / 60)
  return `${h}h${String(m % 60).padStart(2, '0')}m`
}

function renderBar(fraction, color = 'green') {
  const filled = Math.round(fraction * BAR_WIDTH)
  const empty = BAR_WIDTH - filled
  const colorCode = color === 'red' ? '\x1b[31m' : '\x1b[32m'
  return colorCode + '█'.repeat(filled) + '\x1b[90m' + '░'.repeat(empty) + '\x1b[0m'
}

class BatchProgress {
  constructor(totalRuns, { maxTimePerRun = 300 } = {}) {
    this.totalRuns = totalRuns
    this.maxTimePerRun = maxTimePerRun
    this.startTime = Date.now()
    this.completedRuns = 0
    this.failedRuns = 0
    this.activeRuns = new Map()
    this.finishedRuns = []
    this.completedTimes = []
    this.intervalId = null
    this.lastLineCount = 0
    this.isTTY = process.stdout.isTTY
  }

  start() {
    if (!this.isTTY) return
    this.intervalId = setInterval(() => this.render(), 1000)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.clearLines()
  }

  markStarted(id, label) {
    this.activeRuns.set(id, { label, startedAt: Date.now() })
    if (!this.isTTY) {
      process.stdout.write(`  ▶ ${label}\n`)
    }
  }

  markCompleted(id, success = true) {
    const run = this.activeRuns.get(id)
    if (run) {
      const elapsed = (Date.now() - run.startedAt) / 1000
      this.completedTimes.push(elapsed)
      this.activeRuns.delete(id)
      this.finishedRuns.push({ label: run.label, success, elapsed, finishedAt: Date.now() })
    }
    this.completedRuns++
    if (!success) this.failedRuns++
    if (!this.isTTY) {
      const icon = success ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
      const label = run ? run.label : id
      process.stdout.write(`  ${icon} ${label}\n`)
    }
  }

  getAvgRunTime() {
    if (this.completedTimes.length === 0) return this.maxTimePerRun
    return this.completedTimes.reduce((a, b) => a + b, 0) / this.completedTimes.length
  }

  getETA() {
    const remaining = this.totalRuns - this.completedRuns
    const activeCount = this.activeRuns.size
    const avgTime = this.getAvgRunTime()
    const parallelism = Math.max(activeCount, 1)
    const batchesLeft = Math.ceil(remaining / parallelism)
    return batchesLeft * avgTime
  }

  clearLines() {
    if (!this.isTTY || this.lastLineCount === 0) return
    process.stdout.write(`\x1b[${this.lastLineCount}A\x1b[J`)
    this.lastLineCount = 0
  }

  getTotalEstimate() {
    const avgTime = this.getAvgRunTime()
    const parallelism = Math.max(this.activeRuns.size, 1)
    return Math.ceil(this.totalRuns / parallelism) * avgTime
  }

  render() {
    if (!this.isTTY) return
    this.clearLines()

    const elapsed = (Date.now() - this.startTime) / 1000
    const fraction = this.completedRuns / this.totalRuns
    const eta = this.getETA()
    const totalEstimate = this.getTotalEstimate()
    const overallFraction = Math.min(elapsed / totalEstimate, 1)

    const lines = []
    const now = Date.now()

    lines.push('')

    const recentFinished = this.finishedRuns.filter(r => (now - r.finishedAt) < 5000)
    for (const run of recentFinished) {
      const icon = run.success ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
      const time = run.success ? `\x1b[32m${formatDuration(run.elapsed)}\x1b[0m` : `\x1b[31m${formatDuration(run.elapsed)}\x1b[0m`
      lines.push(`  ${icon} ${time}  ${run.label}`)
    }

    if (this.activeRuns.size > 0) {
      for (const [, run] of this.activeRuns) {
        const runElapsed = (now - run.startedAt) / 1000
        const runFraction = Math.min(runElapsed / this.maxTimePerRun, 1)
        const overBudget = runElapsed >= this.maxTimePerRun
        const miniBar = renderBar(runFraction, overBudget ? 'red' : 'green')
        const timeColor = overBudget ? '\x1b[31m' : ''
        const timeReset = overBudget ? '\x1b[0m' : ''
        lines.push(`  ${miniBar}  ${timeColor}${formatDuration(runElapsed)}/${formatDuration(this.maxTimePerRun)}${timeReset}  ${run.label}`)
      }
    }

    if (recentFinished.length > 0 || this.activeRuns.size > 0) lines.push('')

    const failInfo = this.failedRuns > 0 ? `  │  \x1b[31m${this.failedRuns} failed\x1b[0m` : ''
    lines.push(`  \x1b[1mTotal:\x1b[0m ${renderBar(overallFraction)}  ${this.completedRuns}/${this.totalRuns} runs${failInfo}  │  ${formatDuration(elapsed)} / ~${formatDuration(totalEstimate)}  │  ETA ${formatDuration(eta)}`)
    lines.push('')

    const output = lines.join('\n')
    process.stdout.write(output + '\n')
    this.lastLineCount = lines.length + 1
  }
}

module.exports = { BatchProgress, formatDuration, renderBar }
