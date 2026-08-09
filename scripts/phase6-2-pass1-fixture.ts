import { runFixture } from './phase6-2-stage-b.ts'

const suffix = process.argv[2] ?? 'pass1'

// C Party -> E Request low-success fixture
runFixture({
  objectiveType: 'investigation',
  requestTemplateId: 'investigation-monster-signs',
  requestRank: 'E',
  partyTemplateId: 'assault',
  partyRank: 'C',
  scenarioSeed: 'phase6-2:scenario:2',
  sampleCount: 200,
  outputPath: `reports/phase6_2_fixture_ce_${suffix}.json`,
  includeBattleAblation: false,
})

// D Party -> D Request low-success fixture
runFixture({
  objectiveType: 'investigation',
  requestTemplateId: 'investigation-monster-signs',
  requestRank: 'D',
  partyTemplateId: 'assault',
  partyRank: 'D',
  scenarioSeed: 'phase6-2:scenario:1',
  sampleCount: 200,
  outputPath: `reports/phase6_2_fixture_dd_${suffix}.json`,
  includeBattleAblation: false,
})
