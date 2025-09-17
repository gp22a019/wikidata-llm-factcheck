# 開発者ガイド

## 開発環境セットアップ

### 必要な環境
- モダンブラウザ（Chrome, Firefox, Safari, Edge）
- 開発用ローカルサーバー（推奨：Live Server拡張機能）
- RESTful Table API対応環境

### ファイル構成
```
project/
├── index.html              # メインHTML
├── css/
│   └── style.css          # カスタムスタイル
├── js/
│   └── main.js            # メインJavaScript
├── README.md              # プロジェクト説明
├── DEVELOPMENT.md         # 開発者ガイド
└── API_REFERENCE.md       # API仕様書
```

## アーキテクチャ概要

### フロントエンド構成
- **FactCheckSystem クラス**: メインアプリケーション制御
- **RESTful API 通信**: fetch APIによるデータ操作
- **Chart.js 統合**: データ可視化
- **イベント駆動設計**: ユーザーインタラクション処理

### データフロー
1. ユーザー入力 → UI更新
2. API呼び出し → データ取得/保存
3. データ処理 → 結果表示/可視化
4. 設定変更 → ローカルストレージ保存

## コード構造

### main.js 主要クラス・メソッド

#### FactCheckSystem クラス
```javascript
class FactCheckSystem {
    constructor()           // 初期化
    init()                 // システム開始
    setupEventListeners()  // イベント設定
    
    // UI制御
    switchTab(tabName)     // タブ切り替え
    updatePromptPreview()  // プロンプトプレビュー
    displayResult(result)  // 結果表示
    
    // データ処理
    loadEntities()         // エンティティ読み込み
    executeFactCheck()     // ファクトチェック実行
    performFactCheck()     // 実際の処理
    evaluateAnswer()       // 回答評価
    
    // 可視化
    createPatternChart()   // パターン別チャート
    createTimelineChart()  // 時系列チャート
    createAttributeChart() // 属性別チャート
    createConfidenceChart() // 信頼度チャート
    
    // 設定管理
    loadSettings()         // 設定読み込み
    saveSettings()         // 設定保存
}
```

#### 重要なデータ構造
```javascript
// プロンプトパターン定義
this.promptPatterns = {
    direct: "{entity}の{attribute}を教えてください。",
    polite: "恐れ入りますが、{entity}の{attribute}を...",
    accuracy: "正確な情報として、{entity}の{attribute}を...",
    reliability: "信頼できる情報源に基づいて...",
    detailed: "以下について詳細に調べて..."
};

// 属性ラベル
this.attributeLabels = {
    establishment_year: "設立年",
    birth_date: "生年月日",
    location_pref: "所在地（都道府県）",
    // ...
};
```

## API統合

### RESTful Table API使用例

#### データ取得
```javascript
// エンティティ一覧取得
async loadEntities() {
    const response = await fetch('tables/entities');
    const data = await response.json();
    this.entities = data.data || [];
}

// 結果データ取得
async updateResultsDisplay() {
    const response = await fetch('tables/fact_check_results');
    const data = await response.json();
    this.results = data.data || [];
}
```

#### データ保存
```javascript
// 結果保存
async saveResult(result) {
    await fetch('tables/fact_check_results', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(result)
    });
}
```

## 評価エンジン

### 高橋手法準拠の判定ロジック

#### 数値評価
```javascript
evaluateAnswer(wikidataAnswer, llmAnswer, attribute) {
    // 数値系の評価（設立年、標高、全長）
    if (attribute === 'establishment_year' || 
        attribute === 'elevation' || 
        attribute === 'length') {
        
        const wikidataNum = this.extractNumber(wikidataStr);
        const llmNum = this.extractNumber(llmStr);
        
        if (wikidataNum && llmNum) {
            const difference = Math.abs(wikidataNum - llmNum);
            const tolerance = wikidataNum * (this.settings.tolerancePercent / 100);
            
            if (difference === 0) {
                return { match: true, type: 'exact', confidence: 1.0 };
            } else if (difference <= tolerance) {
                const confidence = 1 - (difference / tolerance) * 0.3;
                return { match: true, type: 'partial', confidence };
            }
        }
    }
    
    // 文字列評価（完全一致、部分一致）
    if (wikidataStr === llmStr) {
        return { match: true, type: 'exact', confidence: 1.0 };
    } else if (wikidataStr.includes(llmStr) || llmStr.includes(wikidataStr)) {
        return { match: true, type: 'partial', confidence: 0.7 };
    }
    
    return { match: false, type: 'none', confidence: 0 };
}
```

#### 数値抽出ユーティリティ
```javascript
extractNumber(str) {
    const match = str.match(/\\d+(\\.\\d+)?/);
    return match ? parseFloat(match[0]) : null;
}
```

## Chart.js統合

### チャート初期化パターン
```javascript
createPatternChart() {
    // 既存チャート破棄
    if (this.charts.patternChart) {
        this.charts.patternChart.destroy();
    }
    
    // データ準備
    const labels = [];
    const accuracyData = [];
    
    // チャート作成
    const ctx = document.getElementById('pattern-chart').getContext('2d');
    this.charts.patternChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '精度 (%)',
                data: accuracyData,
                backgroundColor: 'rgba(59, 130, 246, 0.8)',
                // ...
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // ...
        }
    });
}
```

## 設定管理

### ローカルストレージ活用
```javascript
// 設定読み込み
loadSettings() {
    const savedSettings = localStorage.getItem('factcheck_settings');
    if (savedSettings) {
        this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
    }
}

// 設定保存
saveSettings() {
    this.settings = {
        openaiApiKey: document.getElementById('openai-api-key').value,
        llmModel: document.getElementById('llm-model').value,
        rateLimitSeconds: parseFloat(document.getElementById('rate-limit').value),
        tolerancePercent: parseFloat(document.getElementById('tolerance-percent').value),
        strictMatching: document.getElementById('strict-matching').checked
    };
    
    localStorage.setItem('factcheck_settings', JSON.stringify(this.settings));
}
```

## LLMシミュレーション（デモ版）

### 応答生成ロジック
```javascript
async simulateLLMResponse(entity, attribute, correctAnswer) {
    // API呼び出し遅延シミュレート
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    // 80%正答率シミュレート
    const isCorrect = Math.random() > 0.2;
    
    if (isCorrect) {
        // 正答パターン
        if (attribute === 'establishment_year') {
            return `${correctAnswer}年`;
        }
        // ...
    } else {
        // 誤答パターン
        if (attribute === 'establishment_year') {
            const wrongYear = correctAnswer + (Math.random() > 0.5 ? 1 : -1) * 
                             (Math.floor(Math.random() * 10) + 1);
            return `${wrongYear}年`;
        }
        // ...
    }
}
```

## UI/UXパターン

### タブ切り替えシステム
```javascript
switchTab(tabName) {
    // アクティブタブ更新
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // コンテンツ表示切り替え
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // タブ特有の処理
    if (tabName === 'results') {
        this.updateResultsDisplay();
    }
    // ...
}
```

### 通知システム
```javascript
showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${
        type === 'success' ? 'bg-green-600' :
        type === 'error' ? 'bg-red-600' :
        type === 'warning' ? 'bg-yellow-600' :
        'bg-blue-600'
    }`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}
```

## カスタマイズガイド

### 新しいプロンプトパターン追加
1. `promptPatterns` オブジェクトに追加
2. HTMLのラジオボタン選択肢に追加
3. 評価ロジックで新パターン対応（必要に応じて）

### 新しい属性タイプ追加
1. `attributeLabels` に日本語ラベル追加
2. `evaluateAnswer()` メソッドで評価ロジック追加
3. エンティティデータに新属性追加

### 新しいチャートタイプ追加
1. HTMLにcanvas要素追加
2. `createXXXChart()` メソッド実装
3. `updatePatternAccuracy()` で呼び出し追加

## デバッグ・トラブルシューティング

### よくある問題
1. **Chart.js描画エラー**: canvas要素の高さ設定確認
2. **API呼び出し失敗**: ネットワークタブでレスポンス確認
3. **データ表示されない**: コンソールでJavaScriptエラー確認

### デバッグ手法
- ブラウザ開発者ツール活用
- `console.log()` でデータフロー確認
- ネットワークタブでAPI通信確認
- Elementsタブで DOM構造確認

## パフォーマンス最適化

### 推奨実装
- Chart.js インスタンス適切な破棄
- イベントリスナーの重複登録防止
- 大量データ処理時の分割処理
- 不要なAPI呼び出し削減（キャッシュ活用）

### 測定指標
- ページ読み込み時間
- Chart.js 描画時間
- API レスポンス時間
- メモリ使用量

---

このガイドは開発とカスタマイズの参考として活用してください。