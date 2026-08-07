# Phase 3.6 測量・地域調査依頼（survey）サンプル

## ケース A: completeSuccess: 全3区画を高品質で測量し酒場まで報告

- **seed**: s49
- **rank**: S
- **party**: scout, ranger, mage, support
- **battle**: disabled
- **遠征結果**: completeSuccess
- **areaId**: area-1
- **areaName**: 測量地域
- **minimumAcceptableQuality**: 70
- **coveragePercent**: 100.00%
- **averageQuality**: 86.67
- **reportPrepared**: true
- **reportReturned**: true
- **reportLostDuringReturn**: false
- **progress**: 100%
- **区画状況**:
  - 北区画 (route): surveyed=true, quality=80, result=success
  - 中央区画 (terrain): surveyed=true, quality=100, result=criticalSuccess
  - 南区画 (arcane): surveyed=true, quality=80, result=success
- **surveyAreaAssigned index**: 1
- **surveyAreaAssigned structured metadata**:
  - areaId: area-1
  - areaName: 測量地域
  - minimumAcceptableQuality: 70
  - sectors: [{"id":"north","name":"北区画","focus":"route","difficulty":15},{"id":"center","name":"中央区画","focus":"terrain","difficulty":15},{"id":"south","name":"南区画","focus":"arcane","difficulty":15}]
- **主要ログ**:
- preparation: surveyAreaAssigned / 「測量地域」の3区画を測量する任務を開始した
- approach: travel / ゼクス ハインドが安全な接近経路を確保した
- contact: surveySectorResult / 北区画の測量を完了した。測量精度は80だった
- objective: surveySectorResult / 中央区画の測量を完了した。測量精度は100だった
- objective: surveySectorResult / 南区画の測量を完了した。測量精度は80だった
- return: surveyReportPrepared / 3区画分の測量記録を整理し、持ち帰る準備を行った
- return: travel / ゼクス ハインドが安全な帰還経路を確保した
- return: surveyReportReturned / 測量記録を酒場まで持ち帰った
- aftermath: surveyCompleted / 測量地域の測量進捗: 100% (3/3区画, 平均精度87)
- **survey effects**: surveyAreaAssigned=1, surveyCoverage=0, surveyAverageQuality=0, surveySurveyedSectorCount=0, surveyReportPrepared=0, surveyReportReturned=0, surveyProgress=0, surveySectorSurveyed=1, surveySectorQuality=80, surveySectorResult=80, surveyCoverage=33.33333333333333, surveyAverageQuality=80, surveySurveyedSectorCount=1, surveyProgress=25, surveySectorSurveyed=1, surveySectorQuality=100, surveySectorResult=100, surveyCoverage=66.66666666666666, surveyAverageQuality=90, surveySurveyedSectorCount=2, surveyProgress=50, surveySectorSurveyed=1, surveySectorQuality=80, surveySectorResult=80, surveyCoverage=100, surveyAverageQuality=86.66666666666667, surveySurveyedSectorCount=3, surveyProgress=75, surveyReportPrepared=1, surveyCoverage=100, surveyAverageQuality=86.66666666666667, surveySurveyedSectorCount=3, surveyProgress=75, surveyReportReturned=1, surveyProgress=100, surveyCoverage=100, surveyAverageQuality=86.66666666666667, surveyProgress=100, surveyCompleted=1

---

## ケース B: success: 全3区画を測量し報告したがcomplete閾値には至らない

- **seed**: s1
- **rank**: C
- **party**: scout, ranger, mage, support
- **battle**: disabled
- **遠征結果**: success
- **areaId**: area-1
- **areaName**: 測量地域
- **minimumAcceptableQuality**: 70
- **coveragePercent**: 100.00%
- **averageQuality**: 71.67
- **reportPrepared**: true
- **reportReturned**: true
- **reportLostDuringReturn**: false
- **progress**: 100%
- **区画状況**:
  - 北区画 (route): surveyed=true, quality=80, result=success
  - 中央区画 (terrain): surveyed=true, quality=55, result=partialSuccess
  - 南区画 (arcane): surveyed=true, quality=80, result=success
- **surveyAreaAssigned index**: 1
- **surveyAreaAssigned structured metadata**:
  - areaId: area-1
  - areaName: 測量地域
  - minimumAcceptableQuality: 70
  - sectors: [{"id":"north","name":"北区画","focus":"route","difficulty":15},{"id":"center","name":"中央区画","focus":"terrain","difficulty":15},{"id":"south","name":"南区画","focus":"arcane","difficulty":15}]
- **主要ログ**:
- preparation: surveyAreaAssigned / 「測量地域」の3区画を測量する任務を開始した
- approach: travel / エルナ エルウィンが経路を確保したが、多少の遅延が発生した
- contact: surveySectorResult / 北区画の測量を完了した。測量精度は80だった
- objective: surveySectorResult / 中央区画について不完全ながら測量記録を取得した。測量精度は55だった
- objective: surveySectorResult / 南区画の測量を完了した。測量精度は80だった
- return: surveyReportPrepared / 3区画分の測量記録を整理し、持ち帰る準備を行った
- return: travel / エルナ エルウィンが安全な帰還経路を確保した
- return: surveyReportReturned / 測量記録を酒場まで持ち帰った
- aftermath: surveyCompleted / 測量地域の測量進捗: 100% (3/3区画, 平均精度72)
- **survey effects**: surveyAreaAssigned=1, surveyCoverage=0, surveyAverageQuality=0, surveySurveyedSectorCount=0, surveyReportPrepared=0, surveyReportReturned=0, surveyProgress=0, surveySectorSurveyed=1, surveySectorQuality=80, surveySectorResult=80, surveyCoverage=33.33333333333333, surveyAverageQuality=80, surveySurveyedSectorCount=1, surveyProgress=25, surveySectorSurveyed=1, surveySectorQuality=55, surveySectorResult=55, surveyCoverage=66.66666666666666, surveyAverageQuality=67.5, surveySurveyedSectorCount=2, surveyProgress=50, surveySectorSurveyed=1, surveySectorQuality=80, surveySectorResult=80, surveyCoverage=100, surveyAverageQuality=71.66666666666667, surveySurveyedSectorCount=3, surveyProgress=75, surveyReportPrepared=1, surveyCoverage=100, surveyAverageQuality=71.66666666666667, surveySurveyedSectorCount=3, surveyProgress=75, surveyReportReturned=1, surveyProgress=100, surveyCoverage=100, surveyAverageQuality=71.66666666666667, surveyProgress=100, surveyCompleted=1

---

## ケース C: partialSuccess: 2区画の測量記録を持ち帰ったが1区画の測量に失敗した

- **seed**: s109
- **rank**: C
- **party**: scout, ranger, mage, support
- **battle**: disabled
- **遠征結果**: partialSuccess
- **areaId**: area-1
- **areaName**: 測量地域
- **minimumAcceptableQuality**: 70
- **coveragePercent**: 66.67%
- **averageQuality**: 100.00
- **reportPrepared**: true
- **reportReturned**: true
- **reportLostDuringReturn**: false
- **progress**: 75%
- **区画状況**:
  - 北区画 (route): surveyed=true, quality=100, result=criticalSuccess
  - 中央区画 (terrain): surveyed=false, quality=0, result=failure
  - 南区画 (arcane): surveyed=true, quality=100, result=criticalSuccess
- **surveyAreaAssigned index**: 1
- **surveyAreaAssigned structured metadata**:
  - areaId: area-1
  - areaName: 測量地域
  - minimumAcceptableQuality: 70
  - sectors: [{"id":"north","name":"北区画","focus":"route","difficulty":15},{"id":"center","name":"中央区画","focus":"terrain","difficulty":15},{"id":"south","name":"南区画","focus":"arcane","difficulty":15}]
- **主要ログ**:
- preparation: surveyAreaAssigned / 「測量地域」の3区画を測量する任務を開始した
- approach: travel / マルチナ ドラグナーが安全な接近経路を確保した
- contact: surveySectorResult / 北区画の測量を完了した。測量精度は100だった
- objective: surveySectorResult / 中央区画の測量を完了できなかった
- objective: surveySectorResult / 南区画の測量を完了した。測量精度は100だった
- return: surveyReportPrepared / 2区画分の測量記録を整理し、持ち帰る準備を行った
- return: travel / マルチナ ドラグナーが安全な帰還経路を確保した
- return: surveyReportReturned / 測量記録を酒場まで持ち帰った
- aftermath: surveyFailed / 測量地域の測量進捗: 75% (2/3区画, 平均精度100)
- **survey effects**: surveyAreaAssigned=1, surveyCoverage=0, surveyAverageQuality=0, surveySurveyedSectorCount=0, surveyReportPrepared=0, surveyReportReturned=0, surveyProgress=0, surveySectorSurveyed=1, surveySectorQuality=100, surveySectorResult=100, surveyCoverage=33.33333333333333, surveyAverageQuality=100, surveySurveyedSectorCount=1, surveyProgress=25, surveySectorSurveyed=0, surveySectorQuality=0, surveySectorResult=0, surveyCoverage=33.33333333333333, surveyAverageQuality=100, surveySurveyedSectorCount=1, surveyProgress=25, surveySectorSurveyed=1, surveySectorQuality=100, surveySectorResult=100, surveyCoverage=66.66666666666666, surveyAverageQuality=100, surveySurveyedSectorCount=2, surveyProgress=50, surveyReportPrepared=1, surveyCoverage=66.66666666666666, surveyAverageQuality=100, surveySurveyedSectorCount=2, surveyProgress=50, surveyReportReturned=1, surveyProgress=75, surveyCoverage=66.66666666666666, surveyAverageQuality=100, surveyProgress=75, surveyCompleted=0

---

## ケース D: failedObjective: 全ての区画で測量に失敗し報告も作成できない

- **seed**: s1
- **rank**: C
- **party**: vanguard, guardian, mage, healer
- **battle**: disabled
- **遠征結果**: failedObjective
- **areaId**: area-1
- **areaName**: 測量地域
- **minimumAcceptableQuality**: 70
- **coveragePercent**: 0.00%
- **averageQuality**: 0.00
- **reportPrepared**: false
- **reportReturned**: false
- **reportLostDuringReturn**: false
- **progress**: 0%
- **区画状況**:
  - 北区画 (route): surveyed=false, quality=0, result=failure
  - 中央区画 (terrain): surveyed=false, quality=0, result=failure
  - 南区画 (arcane): surveyed=false, quality=0, result=failure
- **surveyAreaAssigned index**: 1
- **surveyAreaAssigned structured metadata**:
  - areaId: area-1
  - areaName: 測量地域
  - minimumAcceptableQuality: 70
  - sectors: [{"id":"north","name":"北区画","focus":"route","difficulty":1000},{"id":"center","name":"中央区画","focus":"terrain","difficulty":1000},{"id":"south","name":"南区画","focus":"arcane","difficulty":1000}]
- **主要ログ**:
- preparation: surveyAreaAssigned / 「測量地域」の3区画を測量する任務を開始した
- approach: travel / トール スカイが経路を確保したが、多少の遅延が発生した
- contact: surveySectorResult / 北区画の測量を完了できなかった
- objective: surveySectorResult / 中央区画の測量を完了できなかった
- objective: surveySectorResult / 南区画の測量を完了できなかった
- return: surveyReportPrepared / 測量記録を作成できなかった
- return: travel / トール スカイが帰還経路を見失い、迂回した
- aftermath: surveyFailed / 測量地域の測量進捗: 0% (0/3区画, 平均精度0)
- **survey effects**: surveyAreaAssigned=1, surveyCoverage=0, surveyAverageQuality=0, surveySurveyedSectorCount=0, surveyReportPrepared=0, surveyReportReturned=0, surveyProgress=0, surveySectorSurveyed=0, surveySectorQuality=0, surveySectorResult=0, surveyCoverage=0, surveyAverageQuality=0, surveySurveyedSectorCount=0, surveyProgress=0, surveySectorSurveyed=0, surveySectorQuality=0, surveySectorResult=0, surveyCoverage=0, surveyAverageQuality=0, surveySurveyedSectorCount=0, surveyProgress=0, surveySectorSurveyed=0, surveySectorQuality=0, surveySectorResult=0, surveyCoverage=0, surveyAverageQuality=0, surveySurveyedSectorCount=0, surveyProgress=0, surveyReportPrepared=0, surveyCoverage=0, surveyAverageQuality=0, surveySurveyedSectorCount=0, surveyProgress=0, surveyCoverage=0, surveyAverageQuality=0, surveyProgress=0, surveyCompleted=0

---

## ケース E: forcedRetreat: 最初の区画は測量できたが、戦闘から撤退したため残りの測量を中止。取得済みの測量記録だけを持ち帰った

- **seed**: fr3-3
- **rank**: C
- **party**: scout, ranger, mage, healer
- **battle**: enabled
- **遠征結果**: forcedRetreat
- **areaId**: area-1
- **areaName**: 測量地域
- **minimumAcceptableQuality**: 70
- **coveragePercent**: 33.33%
- **averageQuality**: 100.00
- **reportPrepared**: true
- **reportReturned**: true
- **reportLostDuringReturn**: false
- **progress**: 50%
- **区画状況**:
  - 北区画 (route): surveyed=true, quality=100, result=criticalSuccess
  - 中央区画 (terrain): surveyed=false, quality=0, result=none
  - 南区画 (arcane): surveyed=false, quality=0, result=none
- **surveyAreaAssigned index**: 1
- **surveyAreaAssigned structured metadata**:
  - areaId: area-1
  - areaName: 測量地域
  - minimumAcceptableQuality: 70
  - sectors: [{"id":"north","name":"北区画","focus":"route","difficulty":0},{"id":"center","name":"中央区画","focus":"terrain","difficulty":0},{"id":"south","name":"南区画","focus":"arcane","difficulty":0}]
- **主要ログ**:
- preparation: surveyAreaAssigned / 「測量地域」の3区画を測量する任務を開始した
- approach: travel / チェルシー リーフが経路を確保したが、多少の遅延が発生した
- contact: surveySectorResult / 北区画の測量を完了した。測量精度は100だった
- return: surveyReportPrepared / 1区画分の測量記録を整理し、持ち帰る準備を行った
- return: travel / チェルシー リーフが安全な帰還経路を確保した
- return: surveyReportReturned / 測量記録を酒場まで持ち帰った
- aftermath: surveyFailed / 測量地域の測量進捗: 50% (1/3区画, 平均精度100)
- **survey effects**: surveyAreaAssigned=1, surveyCoverage=0, surveyAverageQuality=0, surveySurveyedSectorCount=0, surveyReportPrepared=0, surveyReportReturned=0, surveyProgress=0, surveySectorSurveyed=1, surveySectorQuality=100, surveySectorResult=100, surveyCoverage=33.33333333333333, surveyAverageQuality=100, surveySurveyedSectorCount=1, surveyProgress=25, surveyReportPrepared=1, surveyCoverage=33.33333333333333, surveyAverageQuality=100, surveySurveyedSectorCount=1, surveyProgress=25, surveyReportReturned=1, surveyProgress=50, surveyCoverage=33.33333333333333, surveyAverageQuality=100, surveyProgress=50, surveyCompleted=0
