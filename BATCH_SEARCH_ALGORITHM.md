# 一括検索システム：アルゴリズム詳細文書

## 概要

高橋萌香さんの研究に基づく動的SPARQLクエリを使用した一括ファクトチェックシステムの技術仕様書

## 🔍 クエリ生成プロセス

### 1. エンティティタイプ検索フロー

```javascript
// ステップ1: ユーザー入力から候補検索
const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${query}&language=ja&type=item&format=json&origin=*&limit=10`;

// ステップ2: エンティティタイプらしいものをフィルタリング
const isEntityType = (item) => {
    const desc = (item.description || '').toLowerCase();
    const label = (item.label || '').toLowerCase();
    return desc.includes('種類') || desc.includes('タイプ') || desc.includes('クラス') || 
           desc.includes('type') || desc.includes('class') || desc.includes('category');
};
```

### 2. 動的SPARQLクエリ生成

```sparql
-- 基本構造
SELECT DISTINCT ?item ?itemLabel ?location ?locationLabel ?inception ?website WHERE {
    -- エンティティタイプ指定（例：Q3918 = 大学）
    ?item wdt:P31/wdt:P279* wd:${entityTypeId} .
    
    -- 地域フィルタ（任意）
    ${locationFilter ? `?item wdt:P17 wd:${locationFilter} .` : ''}
    
    -- オプショナル属性
    OPTIONAL { ?item wdt:P131 ?location . }    -- 所在地
    OPTIONAL { ?item wdt:P571 ?inception . }   -- 設立年
    OPTIONAL { ?item wdt:P856 ?website . }     -- ウェブサイト
    
    -- 言語ラベル解決
    SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en" . }
}
ORDER BY ?itemLabel
LIMIT ${limit}
```

### 3. 条件パラメータマッピング

| パラメータ | Wikidataプロパティ | 説明 |
|-----------|------------------|------|
| entityTypeId | P31/P279* | インスタンス/サブクラス関係 |
| locationFilter | P17 | 国家所属 |
| P131 | 行政区画所在地 |
| P571 | 設立年・創設年 |
| P856 | 公式ウェブサイト |
| P1082 | 人口 |
| P2046 | 面積 |
| P2044 | 標高 |

## 🧠 一致判定アルゴリズム

### 1. 評価段階システム

```javascript
evaluateAnswers(wikidataValue, llmValue, attribute) {
    // レベル1: データ存在確認
    if (!wikidataValue && !llmValue) return { score: 0, status: 'データなし' };
    if (!wikidataValue) return { score: 0, status: 'Wikidata不明' };
    if (!llmValue) return { score: 0, status: 'LLM無回答' };
    
    // レベル2: 完全一致検証
    const wikiStr = String(wikidataValue).toLowerCase().trim();
    const llmStr = String(llmValue).toLowerCase().trim();
    if (wikiStr === llmStr) return { score: 100, status: '一致' };
    
    // レベル3: 属性別部分一致
    if (isPartialMatch(wikiStr, llmStr, attribute)) {
        return { score: 70, status: '部分一致' };
    }
    
    // レベル4: 不一致
    return { score: 0, status: '不一致' };
}
```

### 2. 属性別特化アルゴリズム

#### 年数（inception）
```javascript
// 4桁年数抽出マッチング
const wikiYear = wikiValue.match(/\d{4}/);
const llmYear = llmValue.match(/\d{4}/);
if (wikiYear && llmYear) {
    return wikiYear[0] === llmYear[0];  // 年のみ比較
}
```

#### URL（website）
```javascript
// ドメイン抽出比較
const extractDomain = (url) => {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return url.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
    }
};
return extractDomain(wikiValue) === extractDomain(llmValue);
```

#### 数値（面積、人口、標高）
```javascript
// 10%許容範囲での数値比較
const wikiNum = parseFloat(wikiValue.replace(/[^\d.]/g, ''));
const llmNum = parseFloat(llmValue.replace(/[^\d.]/g, ''));
if (!isNaN(wikiNum) && !isNaN(llmNum)) {
    const tolerance = 0.1; // 10%許容
    return Math.abs(wikiNum - llmNum) / wikiNum < tolerance;
}
```

#### 地名（location, country）
```javascript
// 包含関係での部分一致
return wikiValue.includes(llmValue) || llmValue.includes(wikiValue);
```

## 🚨 現在の技術的課題

### 1. 複雑性による不安定性
- **問題**: 複数のAPI（Wikidata SPARQL + OpenAI）の連続呼び出し
- **影響**: エラー発生率の増加、デバッグの困難さ

### 2. Chart.js管理の複雑さ
- **問題**: キャンバス再利用エラー（修正済み）
- **解決**: インスタンス管理による適切な破棄処理

### 3. 非同期処理の複雑性
- **問題**: 多段階の非同期処理（検索→取得→評価→表示）
- **影響**: エラーハンドリングの困難さ

## 💡 代替アプローチの提案

### オプション1: 簡略化一括検索
```javascript
// 固定的だが確実な方法
const simpleCategories = {
    'japanese-universities': '日本の大学（上位20件）',
    'world-capitals': '世界の首都（主要50件）'
};
```

### オプション2: 段階的実行
```javascript
// ステップ1: データ取得のみ（ファクトチェックなし）
// ステップ2: ユーザーが選択した項目のみファクトチェック
// ステップ3: 結果表示
```

### オプション3: 単体検索の拡張
```javascript
// 一括検索を諦め、単体検索の機能を強化
// - 関連エンティティの自動提案
// - 検索履歴からの一括比較
// - お気に入り機能での複数管理
```

## 🎯 推奨実装方針

1. **現在の一括検索**: 技術デモとして保持（エラー修正済み）
2. **実用機能**: 単体検索の機能強化に注力
3. **段階的改善**: ユーザーフィードバックに基づく改良

これにより、高橋萌香さんの研究精神を保ちつつ、実用的なシステムを構築できます。