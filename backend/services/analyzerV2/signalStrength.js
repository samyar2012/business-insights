const STRENGTH_POINTS = {
  weak: 0.33,
  medium: 0.66,
  strong: 1,
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function strengthFromCount(count, { weak = 1, medium = 2, strong = 4 } = {}) {
  if (count >= strong) return 'strong'
  if (count >= medium) return 'medium'
  if (count >= weak) return 'weak'
  return 'none'
}

function strengthFromBoolean(present, { strongWhen = true } = {}) {
  if (!present) return 'none'
  return strongWhen ? 'strong' : 'medium'
}

function pointsForStrength(strength, maxPoints) {
  if (!strength || strength === 'none') return 0
  const factor = STRENGTH_POINTS[strength] ?? 0
  return Math.round(maxPoints * factor)
}

function combineStrengths(strengths = []) {
  const order = ['none', 'weak', 'medium', 'strong']
  let best = 'none'
  for (const strength of strengths) {
    if (order.indexOf(strength) > order.indexOf(best)) best = strength
  }
  return best
}

function evidenceLabel(strength) {
  switch (strength) {
    case 'strong':
      return 'strong evidence'
    case 'medium':
      return 'moderate evidence'
    case 'weak':
      return 'weak evidence'
    default:
      return 'no evidence'
  }
}

module.exports = {
  STRENGTH_POINTS,
  strengthFromCount,
  strengthFromBoolean,
  pointsForStrength,
  combineStrengths,
  evidenceLabel,
  clamp,
}
