'use strict'

// Deterministic decision synthesis on top of per-run scores.
// No randomness, no LLM: same runs always produce the same verdict.
// See docs/adr/016-decision-oriented-benchmark-synthesis.md.

const Z_95 = 1.96

function meanQuality(runs) {
  if (runs.length === 0) return 0
  return runs.reduce((sum, r) => sum + (r.criteria_score || 0), 0) / runs.length
}

// Parametric 95% CI: mean ± z·σ/√n (sample standard deviation, n-1).
// Deterministic by construction — no bootstrap resampling.
function confidenceInterval(runs) {
  const n = runs.length
  const mean = meanQuality(runs)
  if (n < 2) {
    return { mean, margin: 0, low: mean, high: mean, n, insufficient_data: true }
  }
  const variance = runs.reduce((sum, r) => sum + ((r.criteria_score || 0) - mean) ** 2, 0) / (n - 1)
  const std = Math.sqrt(variance)
  const margin = Z_95 * std / Math.sqrt(n)
  return { mean, margin, low: mean - margin, high: mean + margin, n, insufficient_data: false }
}

function intervalsOverlap(a, b) {
  return a.low <= b.high && b.low <= a.high
}

// A candidate is dominated if another is >= on quality AND <= on cost,
// and strictly better on at least one axis. Returns the non-dominated set.
function paretoFrontier(candidates, qualityOf, costOf) {
  return candidates.filter(candidate => {
    const q = qualityOf(candidate)
    const c = costOf(candidate)
    return !candidates.some(other => {
      if (other === candidate) return false
      const oq = qualityOf(other)
      const oc = costOf(other)
      const atLeastAsGood = oq >= q && oc <= c
      const strictlyBetter = oq > q || oc < c
      return atLeastAsGood && strictlyBetter
    })
  })
}

const PROFILES = {
  quality: { costOf: c => c.cost_usd },
  cost: { costOf: c => c.cost_usd },
  latency: { costOf: c => c.time_seconds },
}

// Pick the best candidate for a profile.
// - quality: highest mean quality, ties (overlapping CI) broken by lower cost.
// - cost/latency: among candidates statistically tied with the best quality
//   (overlapping CI), pick the cheapest/fastest. Never sacrifices quality
//   outside the noise band.
// Conservative quality score: the lower bound of the confidence interval.
// Ranking on the lower bound means a candidate must be *reliably* good to win —
// a high mean with a huge uncertainty band (e.g. one perfect run + one timeout)
// is not rewarded over a steady, tighter candidate.
//
// A single unreplicated run (n=1) has no measured spread, so its mean would
// otherwise look perfectly certain. We discount it by a fixed penalty so it
// cannot outrank a replicated candidate of similar quality — replication wins
// ties. The penalty is deterministic, not statistical.
const SINGLE_RUN_PENALTY = 0.15

function qualityRank(candidate) {
  if (candidate.ci.insufficient_data) return candidate.ci.mean - SINGLE_RUN_PENALTY
  return candidate.ci.low
}

function recommend(candidates, profile) {
  const spec = PROFILES[profile]
  if (!spec) throw new Error(`Unknown profile: ${profile}`)
  if (candidates.length === 0) return { profile, pick: null, low_confidence: true }

  const costOf = spec.costOf
  const frontier = paretoFrontier(candidates, qualityRank, costOf)

  // Best reliable quality on the frontier (highest lower-confidence bound).
  const bestQuality = frontier.reduce((best, c) => (qualityRank(c) > qualityRank(best) ? c : best), frontier[0])
  const tied = frontier.filter(c => intervalsOverlap(c.ci, bestQuality.ci))

  let pick
  if (profile === 'quality') {
    // Highest reliable quality; exact ties broken by lower cost.
    pick = frontier.reduce((best, c) => {
      if (qualityRank(c) > qualityRank(best)) return c
      if (qualityRank(c) === qualityRank(best) && costOf(c) < costOf(best)) return c
      return best
    }, frontier[0])
  } else {
    // cost / latency: among candidates statistically tied with the best quality
    // (overlapping CI), pick the cheapest / fastest. Never sacrifices quality
    // outside the noise band.
    pick = tied.reduce((best, c) => (costOf(c) < costOf(best) ? c : best), tied[0])
  }

  return {
    profile,
    pick,
    low_confidence: !!pick.ci.insufficient_data,
    frontier_size: frontier.length,
    tied_on_quality: tied.map(c => c.id),
  }
}

// Collapse provider prefixes (us.anthropic., github-copilot/) and version
// suffixes (-v1, :0, date stamps) so the same model tagged differently across
// historical runs maps to one stable label. Deterministic string transform.
function normalizeModel(model) {
  if (!model) return 'unknown'
  let m = String(model)
  m = m.replace(/^[a-z-]+\//, '')          // strip "github-copilot/" style provider
  m = m.replace(/^us\.anthropic\./, '')     // strip bedrock region.vendor prefix
  m = m.replace(/^claude-/, '')             // strip claude- family prefix
  m = m.replace(/-\d{8}/, '')               // strip date stamp like -20250929
  m = m.replace(/-v\d+(:\d+)?$/, '')        // strip -v1 / -v1:0 version suffix
  m = m.replace(/:\d+$/, '')                // strip trailing :0
  return m
}

function candidateId(model, variant) {
  return `${normalizeModel(model)} / ${variant || 'default'}`
}

// Collapse candidates to the single best-quality variant per model.
// Used by the "which model" view: each model competes under its best config,
// not once per variant. Uses the same conservative qualityRank.
function bestVariantPerModel(candidates) {
  const byModel = {}
  for (const c of candidates) {
    const m = c.model
    if (!byModel[m] || qualityRank(c) > qualityRank(byModel[m])) byModel[m] = c
  }
  return Object.values(byModel)
}

// Build per-(model,variant) candidates within a set of runs.
function buildCandidates(runs) {
  const groups = {}
  for (const run of runs) {
    const id = candidateId(run.model, run.variant)
    if (!groups[id]) groups[id] = { id, model: normalizeModel(run.model), variant: run.variant, runs: [] }
    groups[id].runs.push(run)
  }
  return Object.values(groups).map(g => {
    const ci = confidenceInterval(g.runs)
    return {
      id: g.id,
      model: g.model,
      variant: g.variant,
      n: g.runs.length,
      ci,
      quality: ci.mean,
      cost_usd: avg(g.runs.map(r => r.cost_usd || 0)),
      time_seconds: avg(g.runs.map(r => r.time_seconds || 0)),
      tokens: Math.round(avg(g.runs.map(r => r.tokens_used || r.total_tokens || 0))),
    }
  })
}

function avg(arr) {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

// Spread above which a model is considered "config-sensitive": its result
// depends materially on the AI context, so tuning the variant is worthwhile.
const CONFIG_SENSITIVITY_THRESHOLD = 0.10

// For each model, show how much the variant (AI context) changes the outcome.
// Answers: "how do I get the best out of this model with a few config tweaks?"
// — best variant, worst variant, and the quality spread between them.
function variantSensitivity(runs) {
  const byModel = {}
  for (const run of runs) {
    const model = normalizeModel(run.model)
    if (!byModel[model]) byModel[model] = {}
    const variant = run.variant || 'default'
    if (!byModel[model][variant]) byModel[model][variant] = []
    byModel[model][variant].push(run)
  }

  const result = []
  for (const [model, variants] of Object.entries(byModel)) {
    const perVariant = Object.entries(variants).map(([variant, variantRuns]) => {
      const ci = confidenceInterval(variantRuns)
      return {
        variant,
        quality: ci.mean,
        ci,
        n: variantRuns.length,
        cost_usd: avg(variantRuns.map(r => r.cost_usd || 0)),
        time_seconds: avg(variantRuns.map(r => r.time_seconds || 0)),
      }
    }).sort((a, b) => b.quality - a.quality)

    const best = perVariant[0]
    const worst = perVariant[perVariant.length - 1]
    const spread = best.quality - worst.quality
    result.push({
      model,
      variants: perVariant,
      best,
      worst,
      spread,
      config_sensitive: spread >= CONFIG_SENSITIVITY_THRESHOLD,
    })
  }
  return result.sort((a, b) => b.best.quality - a.best.quality)
}

// cost first: the default lens is "if quality is tied, don't pay more".
function synthesizeDecision(runs, options = {}) {
  const profiles = options.profiles || ['cost', 'quality', 'latency']
  const defaultProfile = options.defaultProfile || profiles[0]
  const byCategory = {}
  for (const run of runs) {
    const category = run.category || 'uncategorized'
    if (!byCategory[category]) byCategory[category] = []
    byCategory[category].push(run)
  }

  const categories = {}
  for (const [category, categoryRuns] of Object.entries(byCategory)) {
    const candidates = buildCandidates(categoryRuns)
    // View A "which model": each model competes under its best variant only.
    const modelCandidates = bestVariantPerModel(candidates)
    const modelChoice = {}
    for (const profile of profiles) {
      modelChoice[profile] = recommend(modelCandidates, profile)
    }
    categories[category] = {
      run_count: categoryRuns.length,
      candidates,
      model_choice: modelChoice,             // View A: which model (best variant per model)
      variant_sensitivity: variantSensitivity(categoryRuns), // View B: how to configure
    }
  }

  return { profiles, default_profile: defaultProfile, categories }
}

module.exports = {
  meanQuality,
  confidenceInterval,
  intervalsOverlap,
  paretoFrontier,
  recommend,
  normalizeModel,
  buildCandidates,
  bestVariantPerModel,
  variantSensitivity,
  synthesizeDecision,
}
