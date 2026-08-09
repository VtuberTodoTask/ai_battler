import json
import statistics
from pathlib import Path
from collections import defaultdict

REPORTS = Path('/home/ubuntu/repos/ai_battler/reports')

def load(name):
    with open(REPORTS / name) as f:
        return json.load(f)

baseline = load('phase6_2_before_early_rank_deep.json')
a_only = load('phase6_2_pass1_a_only.json')
b_only = load('phase6_2_pass1_b_only.json')
ab = load('phase6_2_pass1_ab.json')

with open(REPORTS / 'phase6_2_pass1_regression_diff.json') as f:
    reg_diff = json.load(f)

configs = {
    'Baseline': baseline,
    'A only': a_only,
    'B only': b_only,
    'A + B': ab,
}

OBJECTIVES = ['investigation', 'elimination', 'rescue', 'escort', 'retrieval', 'survey']
RANK_PAIRS = ['E->E', 'D->E', 'D->D', 'C->E', 'C->D', 'C->C']

BOOLEAN_FIELDS = {
    'objectiveCompleted', 'located', 'reached', 'stabilized', 'evacuated', 'returned',
    'abandoned', 'destinationReached', 'delivered', 'returnedToOrigin', 'stranded',
    'secured', 'extracted', 'lostDuringReturn', 'reportReturned', 'reportPrepared',
    'confirmationRequired',
}

PERCENT_FIELDS = {
    'objectiveProgress', 'routeProgress', 'coveragePercent', 'averageQuality',
    'minimumAcceptableQuality', 'finalIntegrity', 'initialIntegrity',
    'minimumAcceptableIntegrity', 'stress',
}

def quantile(xs, q):
    if not xs:
        return None
    s = sorted(xs)
    n = len(s)
    pos = q * (n - 1)
    lo = int(pos)
    hi = min(lo + 1, n - 1)
    frac = pos - lo
    return s[lo] * (1 - frac) + s[hi] * frac

def summary_stats(xs):
    if not xs:
        return {}
    return {
        'mean': sum(xs) / len(xs),
        'median': quantile(xs, 0.5),
        'p10': quantile(xs, 0.1),
        'p25': quantile(xs, 0.25),
        'p75': quantile(xs, 0.75),
        'p90': quantile(xs, 0.9),
    }

def appropriate_records(records):
    return [r for r in records if r.get('acceptanceReason') == 'appropriate']

def group_by_advantage(records, advantage):
    return [r for r in appropriate_records(records) if r['rankAdvantage'] == advantage]

def rank_band_metrics(data):
    recs = data['records']
    return {
        'same-rank': summary_stats([r['estimatedSuccessRate'] for r in group_by_advantage(recs, 0)]),
        '+1': summary_stats([r['estimatedSuccessRate'] for r in group_by_advantage(recs, 1)]),
        '+2': summary_stats([r['estimatedSuccessRate'] for r in group_by_advantage(recs, 2)]),
    }

def objective_band_metrics(data):
    recs = data['records']
    out = {}
    for obj in OBJECTIVES:
        out[obj] = {}
        for label, adv in [('same-rank', 0), ('+1', 1), ('+2', 2)]:
            xs = [r['estimatedSuccessRate'] for r in group_by_advantage(recs, adv) if r['objectiveType'] == obj]
            out[obj][label] = summary_stats(xs)
    return out

def objective_outcome_rates(data):
    recs = data['records']
    out = {}
    for obj in OBJECTIVES:
        out[obj] = {}
        for label, adv in [('same-rank', 0), ('+1', 1), ('+2', 2)]:
            group = [r for r in group_by_advantage(recs, adv) if r['objectiveType'] == obj]
            if not group:
                out[obj][label] = None
                continue
            n = len(group)
            out[obj][label] = {
                'completeSuccess': sum(r['completeSuccessRate'] for r in group) / n,
                'success': sum(r['successRate'] for r in group) / n,
                'partialSuccess': sum(r['partialSuccessRate'] for r in group) / n,
                'failedObjective': sum(r['failedObjectiveRate'] for r in group) / n,
                'forcedRetreat': sum(r['forcedRetreatRate'] for r in group) / n,
                'lostExpedition': sum(r['lostExpeditionRate'] for r in group) / n,
            }
    return out

def conditional_battle_favorable(data):
    recs = data['records']
    out = {}
    for pair in RANK_PAIRS:
        group = [r for r in recs if f"{r['partyRank']}->{r['requestRank']}" == pair]
        num = sum(r['battleFavorableRate'] * r['sampleCount'] for r in group)
        den = sum(r['battleOccurredRate'] * r['sampleCount'] for r in group)
        out[pair] = num / den if den > 0 else None
    return out

def battle_outcome_distribution(data):
    recs = data['records']
    totals = defaultdict(int)
    for r in recs:
        for k, v in r.get('battleOutcomeCounts', {}).items():
            totals[k] += v
    total = sum(totals.values())
    return {k: v / total if total else None for k, v in sorted(totals.items())}

def elimination_analysis(data):
    recs = [r for r in data['records'] if r['objectiveType'] == 'elimination']
    if not recs:
        return {}
    n = len(recs)
    keys = ['requiredTargetCount', 'defeatedCount', 'escapedCount', 'survivingCount', 'unknownCount', 'confirmedCount']
    out = {}
    for k in keys:
        vals = [r['objectiveDiagnosticsSummary'][k]['mean'] for r in recs]
        out[k] = sum(vals) / len(vals)
    completed = [r['objectiveDiagnosticsSummary']['objectiveCompleted']['trueRate'] for r in recs]
    out['objectiveCompletedRate'] = sum(completed) / len(completed)
    out['outcomes'] = {
        'completeSuccess': sum(r['completeSuccessRate'] for r in recs) / n,
        'success': sum(r['successRate'] for r in recs) / n,
        'partialSuccess': sum(r['partialSuccessRate'] for r in recs) / n,
        'failedObjective': sum(r['failedObjectiveRate'] for r in recs) / n,
        'forcedRetreat': sum(r['forcedRetreatRate'] for r in recs) / n,
        'lostExpedition': sum(r['lostExpeditionRate'] for r in recs) / n,
    }
    num = sum(r['battleFavorableRate'] * r['sampleCount'] for r in recs)
    den = sum(r['battleOccurredRate'] * r['sampleCount'] for r in recs)
    out['conditionalBattleFavorable'] = num / den if den > 0 else None
    return out

def diagnostic_value(summary, key):
    if key not in summary:
        return None
    s = summary[key]
    if key in BOOLEAN_FIELDS:
        return s['trueRate']
    return s['mean']

def objective_diagnostics(data, obj, fields):
    recs = [r for r in data['records'] if r['objectiveType'] == obj]
    if not recs:
        return {}
    out = {}
    for f in fields:
        vals = [diagnostic_value(r['objectiveDiagnosticsSummary'], f) for r in recs]
        vals = [v for v in vals if v is not None]
        if vals:
            out[f] = sum(vals) / len(vals)
    return out

RESCUE_FIELDS = ['objectiveCompleted', 'located', 'reached', 'stabilized', 'evacuated', 'returned', 'abandoned', 'targetFinalHp']
ESCORT_FIELDS = ['objectiveCompleted', 'routeProgress', 'destinationReached', 'delivered', 'returnedToOrigin', 'stranded', 'stress', 'targetFinalHp']
RETRIEVAL_FIELDS = ['objectiveCompleted', 'located', 'secured', 'extracted', 'returned', 'abandoned', 'lostDuringReturn', 'finalIntegrity']
SURVEY_FIELDS = ['objectiveCompleted', 'coveragePercent', 'averageQuality', 'minimumAcceptableQuality', 'reportReturned', 'reportPrepared', 'surveyedSectorCount', 'totalSectorCount']
INVESTIGATION_FIELDS = ['objectiveCompleted', 'objectiveProgress', 'discoveredInformationCount', 'completeInformationCount', 'discoveredThreatsCount']

def template_differentiation(data):
    recs = data['records']
    templates = sorted({r['partyTemplateId'] for r in recs})
    out = {}
    for t in templates:
        group = [r for r in recs if r['partyTemplateId'] == t and r.get('acceptanceReason') == 'appropriate' and r['rankAdvantage'] == 2]
        out[t] = summary_stats([r['estimatedSuccessRate'] for r in group])
    return out

def monotonicity_check(data):
    recs = data['records']
    def pair_median(pair):
        xs = [r['estimatedSuccessRate'] for r in recs if f"{r['partyRank']}->{r['requestRank']}" == pair and r.get('acceptanceReason')=='appropriate']
        return quantile(xs, 0.5) if xs else None
    adv = rank_band_metrics(data)
    return {
        'C->E > C->D > C->C': (pair_median('C->E'), pair_median('C->D'), pair_median('C->C')),
        'D->E > D->D': (pair_median('D->E'), pair_median('D->D')),
        '+2 > +1 > 0': (adv['+2']['median'], adv['+1']['median'], adv['same-rank']['median']),
    }

def load_fixture(name):
    with open(REPORTS / f'phase6_2_fixture_{name}.json') as f:
        return json.load(f)

fixtures = {
    'C->E (investigation-monster-signs, assault, scenario 2)': {
        'baseline': load_fixture('ce_baseline'),
        'A+B': load_fixture('ce_pass1'),
    },
    'D->D (investigation-monster-signs, assault, scenario 1)': {
        'baseline': load_fixture('dd_baseline'),
        'A+B': load_fixture('dd_pass1'),
    },
}

def fmt_pct(x):
    if x is None:
        return 'N/A'
    return f"{x*100:.1f}%"

def fmt_dec(x):
    if x is None:
        return 'N/A'
    return f"{x:.3f}"

def fmt_metric(key, v):
    if v is None:
        return 'N/A'
    if key in BOOLEAN_FIELDS:
        return fmt_pct(v)
    if key in PERCENT_FIELDS:
        return f"{v:.1f}%"
    return f"{v:.3f}"

def table(rows):
    if not rows:
        return ''
    cols = list(rows[0].keys())
    header = '| ' + ' | '.join(cols) + ' |'
    sep = '|' + '|'.join(['---' for _ in cols]) + '|'
    lines = [header, sep]
    for row in rows:
        lines.append('| ' + ' | '.join(str(row[c]) for c in cols) + ' |')
    return '\n'.join(lines)

def band_cell(data):
    m = rank_band_metrics(data)
    return f"{fmt_pct(m['same-rank'].get('median'))} / p10 {fmt_pct(m['same-rank'].get('p10'))} / p90 {fmt_pct(m['same-rank'].get('p90'))}"

lines = []
lines.append('# Phase 6.2 Calibration Pass 1 Report')
lines.append('')
lines.append('## Selected levers')
lines.append('')
lines.append('- **Lever A**: `difficultyBasePenalty` difficulty base shifted from `0/10/20/30` to `-10/0/10/20` (a flat -10 to all skill-check difficulty baselines, preserving relative gaps).')
lines.append('- **Lever B**: `EXPEDITION_ENCOUNTER_THREAT_MULTIPLIER = 0.85` applied only in `battleIntegration.ts` encounter generation, reducing expedition-only enemy threat budget by 15%.')
lines.append('')
lines.append('No other balance constants were changed.')
lines.append('')

lines.append('## Why A was selected')
lines.append('')
lines.append('Stage B showed that, even with an appropriate party, same-rank success was far below the 55–75% target (0.22). The bottleneck was widespread skill-check failures: route planning, travel, exploration, access, stabilization, securing, and investigation checks all suffered from a heavy base penalty. Shifting the base penalty by -10 raises the baseline without changing feature/role/absence/equipment bonuses or the relative spacing between difficulty labels.')
lines.append('')

lines.append('## Why expedition-only B was selected')
lines.append('')
lines.append('Stage B conditional battle favorable rates were low for same-rank fights (~0.42–0.46) while +2 fights were already high (~0.75), suggesting the encounter budget built from `ADVENTURER_THREAT[request.rank] * partySize` was too large for expeditions. Reducing only the expedition encounter budget keeps Phase 1 battle calibration intact and lets rank advantage express itself through the party\'s actual stats/skills rather than scaling enemies to the party.')
lines.append('')

lines.append('## Rejected / deferred levers')
lines.append('')
lines.append('- **C (retreat thresholds)**: Not needed in Pass 1; with lower enemy threat, forced retreat should fall naturally.')
lines.append('- **D (objective-specific gates)**: Deferred to Pass 2 if single objectives remain outliers after common scaling.')
lines.append('- **E (elimination semantics)**: `requiredTargetCount` and routed-enemy completion semantics unchanged per instruction.')
lines.append('- **F (adventurer stat scaling)**: Rank stat generation untouched per instruction.')
lines.append('')

lines.append('## Rank bands before / after')
lines.append('')
lines.append('Measured on acceptance `appropriate` cells in the Stage B exact corpus (6 objectives × all request templates × all party templates × 3 scenarios, 100 samples/cell).')
lines.append('')
band_rows = []
for label in ['same-rank', '+1', '+2']:
    row = {'Band': label}
    for cfg_name, cfg in configs.items():
        m = rank_band_metrics(cfg)[label]
        row[cfg_name] = f"{fmt_pct(m.get('median'))} / p10 {fmt_pct(m.get('p10'))} / p90 {fmt_pct(m.get('p90'))}"
    band_rows.append(row)
lines.append(table(band_rows))
lines.append('')

lines.append('## Isolated A-only results')
lines.append('')
lines.append(table([
    {'Metric': 'same-rank appropriate median', 'Value': fmt_pct(rank_band_metrics(a_only)['same-rank']['median'])},
    {'Metric': '+1 appropriate median', 'Value': fmt_pct(rank_band_metrics(a_only)['+1']['median'])},
    {'Metric': '+2 appropriate median', 'Value': fmt_pct(rank_band_metrics(a_only)['+2']['median'])},
    {'Metric': 'same-rank failedObjective rate', 'Value': fmt_pct(sum(r['failedObjectiveRate'] for r in appropriate_records(a_only['records']) if r['rankAdvantage']==0)/max(1,len([r for r in appropriate_records(a_only['records']) if r['rankAdvantage']==0])))},
    {'Metric': 'same-rank forcedRetreat rate', 'Value': fmt_pct(sum(r['forcedRetreatRate'] for r in appropriate_records(a_only['records']) if r['rankAdvantage']==0)/max(1,len([r for r in appropriate_records(a_only['records']) if r['rankAdvantage']==0])))},
]))
lines.append('')

lines.append('## Isolated B-only results')
lines.append('')
lines.append(table([
    {'Metric': 'same-rank conditional battle favorable', 'Value': fmt_pct(conditional_battle_favorable(b_only)['E->E'])},
    {'Metric': 'D->D conditional battle favorable', 'Value': fmt_pct(conditional_battle_favorable(b_only)['D->D'])},
    {'Metric': 'C->C conditional battle favorable', 'Value': fmt_pct(conditional_battle_favorable(b_only)['C->C'])},
    {'Metric': 'C->E conditional battle favorable', 'Value': fmt_pct(conditional_battle_favorable(b_only)['C->E'])},
    {'Metric': 'Elimination same-rank appropriate median', 'Value': fmt_pct(objective_band_metrics(b_only)['elimination']['same-rank']['median'])},
    {'Metric': 'Optional battle objective same-rank median (investigation)', 'Value': fmt_pct(objective_band_metrics(b_only)['investigation']['same-rank']['median'])},
]))
lines.append('')

lines.append('## Combined A+B results')
lines.append('')
lines.append(table([
    {'Metric': 'same-rank appropriate median', 'Value': fmt_pct(rank_band_metrics(ab)['same-rank']['median'])},
    {'Metric': '+1 appropriate median', 'Value': fmt_pct(rank_band_metrics(ab)['+1']['median'])},
    {'Metric': '+2 appropriate median', 'Value': fmt_pct(rank_band_metrics(ab)['+2']['median'])},
    {'Metric': 'Overall mean estimated success', 'Value': fmt_pct(ab['summary']['overallEstimatedSuccessRateMean'])},
]))
lines.append('')

lines.append('## Objective before / after (same-rank appropriate)')
lines.append('')
obj_rows = []
for obj in OBJECTIVES:
    row = {'Objective': obj}
    for cfg_name, cfg in configs.items():
        row[cfg_name] = fmt_pct(objective_band_metrics(cfg)[obj]['same-rank']['median'])
    obj_rows.append(row)
lines.append(table(obj_rows))
lines.append('')

for band in ['+1', '+2']:
    lines.append(f'## Objective {band} before / after (appropriate)')
    lines.append('')
    rows = []
    for obj in OBJECTIVES:
        row = {'Objective': obj}
        for cfg_name, cfg in configs.items():
            row[cfg_name] = fmt_pct(objective_band_metrics(cfg)[obj][band]['median'])
        rows.append(row)
    lines.append(table(rows))
    lines.append('')

lines.append('## Outcome failure distribution (appropriate same-rank)')
lines.append('')
for cfg_name, cfg in configs.items():
    lines.append(f'### {cfg_name}')
    rows = []
    for obj in OBJECTIVES:
        d = objective_outcome_rates(cfg)[obj]['same-rank']
        if d:
            rows.append({
                'Objective': obj,
                'completeSuccess': fmt_pct(d['completeSuccess']),
                'success': fmt_pct(d['success']),
                'partialSuccess': fmt_pct(d['partialSuccess']),
                'failedObjective': fmt_pct(d['failedObjective']),
                'forcedRetreat': fmt_pct(d['forcedRetreat']),
                'lostExpedition': fmt_pct(d['lostExpedition']),
            })
    lines.append(table(rows))
    lines.append('')

lines.append('## Battle before / after')
lines.append('')
lines.append('Conditional battle favorable rate (given a battle occurred).')
lines.append('')
battle_rows = []
for pair in RANK_PAIRS:
    row = {'Pair': pair}
    for cfg_name, cfg in configs.items():
        row[cfg_name] = fmt_pct(conditional_battle_favorable(cfg)[pair])
    battle_rows.append(row)
lines.append(table(battle_rows))
lines.append('')

lines.append('### Battle outcome distribution (A+B)')
lines.append('')
dist = battle_outcome_distribution(ab)
lines.append(table([{'Outcome': k, 'Share': fmt_pct(v)} for k, v in dist.items()]))
lines.append('')

lines.append('## Battle favorable → expedition failure rate')
lines.append('')
bf_rows = []
for pair in RANK_PAIRS:
    row = {'Pair': pair}
    for cfg_name, cfg in configs.items():
        group = [r for r in cfg['records'] if f"{r['partyRank']}->{r['requestRank']}" == pair]
        num = sum(r['favorableBattleThenExpeditionFailureRate'] * r['sampleCount'] for r in group)
        den = sum(r['battleFavorableRate'] * r['sampleCount'] for r in group)
        row[cfg_name] = fmt_pct(num / den if den > 0 else None)
    bf_rows.append(row)
lines.append(table(bf_rows))
lines.append('')

lines.append('## Elimination analysis')
lines.append('')
elim_rows = []
for cfg_name, cfg in configs.items():
    a = elimination_analysis(cfg)
    elim_rows.append({
        'Config': cfg_name,
        'completed': fmt_pct(a.get('objectiveCompletedRate')),
        'defeatedCount': fmt_dec(a.get('defeatedCount')),
        'surviving': fmt_dec(a.get('survivingCount')),
        'escaped': fmt_dec(a.get('escapedCount')),
        'partialSuccess': fmt_pct(a['outcomes']['partialSuccess']) if 'outcomes' in a else 'N/A',
        'forcedRetreat': fmt_pct(a['outcomes']['forcedRetreat']) if 'outcomes' in a else 'N/A',
        'conditionalBattleFavorable': fmt_pct(a.get('conditionalBattleFavorable')),
    })
lines.append(table(elim_rows))
lines.append('')

lines.append('## Other objective bottlenecks (A+B)')
lines.append('')
for obj, fields in [('investigation', INVESTIGATION_FIELDS), ('rescue', RESCUE_FIELDS), ('escort', ESCORT_FIELDS), ('retrieval', RETRIEVAL_FIELDS), ('survey', SURVEY_FIELDS)]:
    lines.append(f'### {obj}')
    d = objective_diagnostics(ab, obj, fields)
    rows = [{'Metric': k, 'Mean': fmt_metric(k, v)} for k, v in d.items()]
    lines.append(table(rows))
    lines.append('')

lines.append('## Objective funnel before / after')
lines.append('')
for obj, fields in [('investigation', INVESTIGATION_FIELDS), ('rescue', RESCUE_FIELDS), ('escort', ESCORT_FIELDS), ('retrieval', RETRIEVAL_FIELDS), ('survey', SURVEY_FIELDS)]:
    lines.append(f'### {obj}')
    rows = []
    for cfg_name, cfg in configs.items():
        d = objective_diagnostics(cfg, obj, fields)
        row = {'Config': cfg_name}
        for f in fields:
            row[f] = fmt_metric(f, d.get(f))
        rows.append(row)
    lines.append(table(rows))
    lines.append('')

lines.append('## Bottleneck resolution assessment (A+B vs Baseline)')
lines.append('')

def compare_bottleneck(obj, metric, cfg_baseline, cfg_ab):
    b = objective_diagnostics(cfg_baseline, obj, [metric]).get(metric)
    a = objective_diagnostics(cfg_ab, obj, [metric]).get(metric)
    return b, a

bottlenecks = [
    ('Survey all-sector', 'survey', 'surveyedSectorCount', 'totalSectorCount'),
    ('Escort route', 'escort', 'destinationReached', None),
    ('Escort delivery', 'escort', 'delivered', None),
    ('Retrieval secure', 'retrieval', 'secured', None),
    ('Rescue stabilize', 'rescue', 'stabilized', None),
    ('Investigation check', 'investigation', 'objectiveCompleted', None),
]
for label, obj, metric, denom in bottlenecks:
    b = objective_diagnostics(baseline, obj, [metric]).get(metric)
    a = objective_diagnostics(ab, obj, [metric]).get(metric)
    if denom:
        d_b = objective_diagnostics(baseline, obj, [denom]).get(denom)
        d_a = objective_diagnostics(ab, obj, [denom]).get(denom)
        b_str = f"{fmt_metric(metric, b)} / {fmt_metric(denom, d_b)}" if b is not None and d_b else 'N/A'
        a_str = f"{fmt_metric(metric, a)} / {fmt_metric(denom, d_a)}" if a is not None and d_a else 'N/A'
    else:
        b_str = fmt_metric(metric, b)
        a_str = fmt_metric(metric, a)
    if a is None:
        status = 'N/A'
    elif denom:
        d_a = objective_diagnostics(ab, obj, [denom]).get(denom)
        ratio = a / d_a if d_a else 0
        status = 'resolved' if ratio >= 0.9 else 'remaining'
    else:
        status = 'resolved' if a > 0.75 else 'remaining'
    lines.append(f'- **{label}**: Baseline {b_str} → A+B {a_str} ({status}).')
lines.append('')

lines.append('## Rank scaling diagnosis')
lines.append('')
lines.append('Median estimated success rate by rank pair (all appropriate cells).')
lines.append('')
for cfg_name, cfg in configs.items():
    lines.append(f'### {cfg_name}')
    rows = []
    for pair in RANK_PAIRS:
        xs = [r['estimatedSuccessRate'] for r in cfg['records'] if f"{r['partyRank']}->{r['requestRank']}" == pair and r.get('acceptanceReason') == 'appropriate']
        m = quantile(xs, 0.5)
        rows.append({'Pair': pair, 'Median': fmt_pct(m)})
    lines.append(table(rows))
    lines.append('')

lines.append('## Request difficulty diagnosis')
lines.append('')
lines.append('Median appropriate success by fixed party rank across request ranks.')
lines.append('')
for cfg_name, cfg in configs.items():
    lines.append(f'### {cfg_name}')
    pairs = [f'{pr}->{rr}' for pr in ['E','D','C'] for rr in ['E','D','C']]
    rows = []
    for party_rank in ['E', 'D', 'C']:
        row = {'Party Rank': party_rank}
        for pair in pairs:
            row[pair] = 'N/A'
        for req_rank in ['E', 'D', 'C']:
            pair = f'{party_rank}->{req_rank}'
            xs = [r['estimatedSuccessRate'] for r in appropriate_records(cfg['records']) if r['partyRank']==party_rank and r['requestRank']==req_rank]
            row[pair] = fmt_pct(quantile(xs, 0.5))
        rows.append(row)
    lines.append(table(rows))
    lines.append('')

lines.append('## Monotonicity')
lines.append('')
for cfg_name, cfg in configs.items():
    chk = monotonicity_check(cfg)
    lines.append(f'### {cfg_name}')
    for k, vals in chk.items():
        ok = all(a is None or b is None or a >= b for a, b in zip(vals, vals[1:]))
        lines.append(f'- {k}: ' + ' >= '.join(fmt_pct(v) for v in vals) + f' ({"OK" if ok else "violation"})')
    lines.append('')

lines.append('## Template differentiation (+2 appropriate)')
lines.append('')
for cfg_name, cfg in configs.items():
    lines.append(f'### {cfg_name}')
    diff = template_differentiation(cfg)
    rows = [{'Template': t, 'Median': fmt_pct(v['median']), 'P10': fmt_pct(v['p10']), 'P90': fmt_pct(v['p90'])} for t, v in sorted(diff.items())]
    lines.append(table(rows))
    lines.append('')

lines.append('## Overshoot check (+2 appropriate)')
lines.append('')
for cfg_name, cfg in configs.items():
    xs = [r['estimatedSuccessRate'] for r in cfg['records'] if r.get('acceptanceReason') == 'appropriate' and r['rankAdvantage'] == 2]
    if xs:
        p90 = quantile(xs, 0.9)
        maxv = max(xs)
        p10 = quantile(xs, 0.1)
        lines.append(f'- {cfg_name}: P10 {fmt_pct(p10)}, median {fmt_pct(quantile(xs,0.5))}, P90 {fmt_pct(p90)}, max {fmt_pct(maxv)}')
lines.append('')

lines.append('## 200-sample known-problem fixtures')
lines.append('')
for label, fix in fixtures.items():
    lines.append(f'### {label}')
    rows = []
    for phase, rec in fix.items():
        bf = rec['battleFavorableRate']
        cond_fail = rec['favorableBattleThenExpeditionFailureRate'] / bf if bf else None
        rows.append({
            'Phase': phase,
            'estimatedSuccessRate': fmt_pct(rec['estimatedSuccessRate']),
            'completeSuccessRate': fmt_pct(rec['completeSuccessRate']),
            'failedObjectiveRate': fmt_pct(rec['failedObjectiveRate']),
            'forcedRetreatRate': fmt_pct(rec['forcedRetreatRate']),
            'battleFavorableRate': fmt_pct(bf),
            'conditionalBfThenFail': fmt_pct(cond_fail),
        })
    lines.append(table(rows))
    lines.append('')

lines.append('## Regression diff')
lines.append('')
lines.append(f"Regression scenarios with snapshot changes: {reg_diff['changedCount']} / {reg_diff['total']}")
lines.append('')
lines.append('Category counts among changed scenarios:')
lines.append('')
lines.append(table([{'Category': k, 'Scenarios': v} for k, v in reg_diff['categoryCounts'].items()]))
lines.append('')
outcome_changed = [k for k, v in reg_diff['perScenario'].items() if v['changed'] and 'outcome' in v['categories']]
lines.append('Outcome changed scenarios: ' + (', '.join(outcome_changed) if outcome_changed else 'none'))
lines.append('')

lines.append('## Candidate Pass 2 work')
lines.append('')
lines.append('Based on Pass 1 results:')
lines.append('- If elimination same-rank remains below 40%, review `requiredTargetCount` and routed-enemy completion semantics (Lever E).')
lines.append('- If survey still fails mostly because `surveyedSectorCount < totalSectorCount` despite quality, review the all-surveyed gate (Lever D).')
lines.append('- If escort route failures dominate, review `routeDifficulty` / stress progression (Lever D).')
lines.append('- If retrieval `located → secured` drop remains large, review securing difficulty or theft/integrity loss (Lever D).')
lines.append('- If rescue `reached → stabilized` drop remains, review stabilization gate (Lever D).')
lines.append('- Continue to avoid touching Phase 1 battle constants, acceptance weights, rank stat scaling, or campaign mechanics.')
lines.append('')

lines.append('## Verification')
lines.append('')
lines.append('- `npm run typecheck`: passed')
lines.append('- `npm run lint`: passed')
lines.append('- `npm run build`: passed')
lines.append(f'- `npm test`: 31 failed / 618 passed (649 total). 23 regression snapshot diffs from balance changes + 8 objective threshold tests calibrated to pre-Pass-1 outcomes.')
lines.append('- Regression baseline intentionally not updated per instruction; diff count captured above.')
lines.append('')

report = '\n'.join(lines)
with open('PHASE6_2_PASS1_REPORT.md', 'w') as f:
    f.write(report)

print('Wrote PHASE6_2_PASS1_REPORT.md')
