import type {
  CharacterNarrativeContext,
  NarrativeQualityWarning,
} from './types.ts'

export interface NarrativeQualityAuditResult {
  warnings: NarrativeQualityWarning[]
  details: string[]
}

const ABSTRACT_RELATIONSHIP_PHRASES: string[] = [
  '信頼が深まっていた',
  '距離が縮まっていた',
  '互いを理解していた',
  '息が合っていた',
  '馴染んでいた',
  '関係が深まっていた',
  '絆が強くなっていた',
  '言葉を必要としなかった',
  'They had grown to understand each other',
  'Their trust had deepened',
  'They no longer needed many words',
  'The distance between them had narrowed',
  'Their teamwork had become natural',
  'They had grown accustomed to one another',
]

function splitSentences(text: string): string[] {
  // Japanese sentence delimiters plus common ending punctuation.
  return text
    .split(/[。！？?!.\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function pronounRegex(pronoun: string): RegExp {
  // '彼' must not be followed by '女' to avoid matching '彼女'.
  const suffixGuard = pronoun === '彼' ? '(?!女)' : ''
  return new RegExp(`(?<![\\p{L}\\p{N}])${pronoun}${suffixGuard}`, 'u')
}

function containsPronoun(sentence: string, pronoun: string): boolean {
  return pronounRegex(pronoun).test(sentence)
}

function findName(sentence: string, name: string): boolean {
  return sentence.includes(name)
}

function sentencePronouns(sentence: string): string[] {
  const pronouns: string[] = []
  if (containsPronoun(sentence, '彼')) pronouns.push('彼')
  if (containsPronoun(sentence, '彼女')) pronouns.push('彼女')
  return pronouns
}

export function auditNarrativeIdentityConsistency(
  text: string,
  contexts: CharacterNarrativeContext[],
): NarrativeQualityAuditResult {
  const result: NarrativeQualityAuditResult = { warnings: [], details: [] }
  const sentences = splitSentences(text)

  // Build a name -> gender map from supplied contexts.
  const genderByName = new Map<string, string>()
  for (const ctx of contexts) {
    if (ctx.name && ctx.gender) {
      genderByName.set(ctx.name, ctx.gender)
    }
  }

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]!
    const pronouns = sentencePronouns(sentence)
    if (pronouns.length === 0) continue

    // Names in the current sentence.
    const namesInSentence = [...genderByName.keys()].filter((name) =>
      findName(sentence, name),
    )

    // Anaphora fallback: if the sentence starts with a pronoun and contains no
    // character name, the pronoun likely refers to the subject of the previous
    // sentence.
    const startsWithPronoun = /^彼[^女]?|^彼女/.test(sentence)
    const previousNames =
      startsWithPronoun && namesInSentence.length === 0 && i > 0
        ? [...genderByName.keys()].filter((name) =>
            findName(sentences[i - 1]!, name),
          )
        : []

    const candidateNames =
      namesInSentence.length > 0 ? namesInSentence : previousNames

    for (const pronoun of pronouns) {
      for (const name of candidateNames) {
        const gender = genderByName.get(name)
        if (!gender) continue
        let mismatch = false
        if (gender === 'female' && pronoun === '彼') mismatch = true
        if (gender === 'male' && pronoun === '彼女') mismatch = true
        if (
          (gender === 'nonbinary' || gender === 'other') &&
          (pronoun === '彼' || pronoun === '彼女')
        )
          mismatch = true
        if (mismatch) {
          result.warnings.push('identity_pronoun_mismatch')
          result.details.push(
            `${gender} character ${name} followed by ${pronoun} in: ${sentence.trim()}`,
          )
        }
      }
    }
  }

  return result
}

export function auditAbstractArcSummary(
  text: string,
): NarrativeQualityAuditResult {
  const result: NarrativeQualityAuditResult = { warnings: [], details: [] }
  for (const phrase of ABSTRACT_RELATIONSHIP_PHRASES) {
    if (text.includes(phrase)) {
      result.warnings.push('abstract_relationship_summary')
      result.details.push(`abstract arc summary phrase found: ${phrase}`)
    }
  }
  return result
}
