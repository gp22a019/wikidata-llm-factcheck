# API リファレンス

## 概要

このファクトチェックシステムは RESTful Table API を使用してデータの永続化と管理を行います。
すべてのAPIエンドポイントは相対URL（`tables/`から始まる）で提供されます。

## 認証

現在のデモ版では認証は不要です。本番環境では適切な認証システムの実装が推奨されます。

## エンドポイント一覧

### エンティティ管理 (`entities`)

#### エンティティ一覧取得
```http
GET /tables/entities
```

**クエリパラメータ:**
- `page` (optional): ページ番号 (default: 1)
- `limit` (optional): 1ページあたりの件数 (default: 100)
- `search` (optional): 検索クエリ（name, category フィールドを対象）
- `sort` (optional): ソートフィールド (created_at, name, establishment_year)

**レスポンス例:**
```json
{
  "data": [
    {
      "id": "ent_001",
      "wikidata_id": "Q7842",
      "name": "東京大学",
      "name_en": "University of Tokyo",
      "category": "日本の大学",
      "establishment_year": 1877,
      "birth_date": null,
      "location_pref": "東京都",
      "location_city": "文京区",
      "elevation": null,
      "length": null,
      "website": "https://www.u-tokyo.ac.jp/",
      "description": "日本の国立大学",
      "status": "active",
      "created_at": 1693476000000,
      "updated_at": 1693476000000
    }
  ],
  "total": 8,
  "page": 1,
  "limit": 100,
  "table": "entities",
  "schema": {
    "fields": [...],
    "name": "entities"
  }
}
```

#### 特定エンティティ取得
```http
GET /tables/entities/{entity_id}
```

**レスポンス例:**
```json
{
  "id": "ent_001",
  "wikidata_id": "Q7842",
  "name": "東京大学",
  "name_en": "University of Tokyo",
  "category": "日本の大学",
  "establishment_year": 1877,
  "location_pref": "東京都",
  "location_city": "文京区",
  "website": "https://www.u-tokyo.ac.jp/",
  "description": "日本の国立大学",
  "status": "active"
}
```

#### エンティティ作成
```http
POST /tables/entities
Content-Type: application/json
```

**リクエストボディ例:**
```json
{
  "wikidata_id": "Q11729",
  "name": "京都大学",
  "name_en": "Kyoto University",
  "category": "日本の大学",
  "establishment_year": 1897,
  "location_pref": "京都府",
  "location_city": "京都市",
  "website": "https://www.kyoto-u.ac.jp/",
  "description": "日本の国立大学",
  "status": "active"
}
```

**レスポンス (201 Created):**
```json
{
  "id": "ent_009",
  "wikidata_id": "Q11729",
  "name": "京都大学",
  "name_en": "Kyoto University",
  "category": "日本の大学",
  "establishment_year": 1897,
  "location_pref": "京都府",
  "location_city": "京都市",
  "website": "https://www.kyoto-u.ac.jp/",
  "description": "日本の国立大学",
  "status": "active",
  "created_at": 1693476123000,
  "updated_at": 1693476123000
}
```

#### エンティティ更新
```http
PUT /tables/entities/{entity_id}
Content-Type: application/json
```

**リクエストボディ例:**
```json
{
  "description": "日本の国立総合大学（更新）",
  "website": "https://www.u-tokyo.ac.jp/ja/"
}
```

#### エンティティ削除（論理削除）
```http
DELETE /tables/entities/{entity_id}
```

**レスポンス (204 No Content)**

### ファクトチェック結果管理 (`fact_check_results`)

#### 結果一覧取得
```http
GET /tables/fact_check_results
```

**クエリパラメータ:**
- `page` (optional): ページ番号
- `limit` (optional): 1ページあたりの件数
- `search` (optional): 検索クエリ（entity_name, fact_type フィールドを対象）
- `sort` (optional): ソートフィールド (created_at, confidence_score, execution_time)

**レスポンス例:**
```json
{
  "data": [
    {
      "id": "result_1693476456789",
      "experiment_id": "exp_1693476456789",
      "entity_id": "ent_001",
      "entity_name": "東京大学",
      "fact_type": "establishment_year",
      "prompt_pattern": "direct",
      "generated_prompt": "東京大学の設立年を教えてください。",
      "wikidata_answer": "1877",
      "llm_answer": "1877年",
      "llm_model": "gpt-3.5-turbo",
      "match_result": true,
      "match_type": "exact",
      "confidence_score": 1.0,
      "execution_time": 1250,
      "error_message": null,
      "notes": "完全一致",
      "created_at": 1693476456789,
      "updated_at": 1693476456789
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 100
}
```

#### ファクトチェック結果保存
```http
POST /tables/fact_check_results
Content-Type: application/json
```

**リクエストボディ例:**
```json
{
  "experiment_id": "exp_1693476456789",
  "entity_id": "ent_001",
  "entity_name": "東京大学",
  "fact_type": "establishment_year",
  "prompt_pattern": "direct",
  "generated_prompt": "東京大学の設立年を教えてください。",
  "wikidata_answer": "1877",
  "llm_answer": "1877年",
  "llm_model": "gpt-3.5-turbo",
  "match_result": true,
  "match_type": "exact",
  "confidence_score": 1.0,
  "execution_time": 1250,
  "error_message": null,
  "notes": "完全一致"
}
```

#### 特定結果取得
```http
GET /tables/fact_check_results/{result_id}
```

#### 結果更新
```http
PUT /tables/fact_check_results/{result_id}
Content-Type: application/json
```

### 実験設定管理 (`experiment_configs`)

#### 実験設定一覧取得
```http
GET /tables/experiment_configs
```

**レスポンス例:**
```json
{
  "data": [
    {
      "id": "config_001",
      "experiment_name": "プロンプトパターン比較実験",
      "description": "5種類のプロンプトパターンの精度比較",
      "llm_model": "gpt-3.5-turbo",
      "rate_limit_seconds": 1.0,
      "tolerance_percent": 5.0,
      "strict_matching": true,
      "target_entities": ["ent_001", "ent_002", "ent_003"],
      "target_fact_types": ["establishment_year", "location_pref"],
      "prompt_patterns": ["direct", "polite", "accuracy", "reliability", "detailed"],
      "status": "completed",
      "start_time": 1693476000000,
      "end_time": 1693477800000,
      "total_tests": 30,
      "success_count": 24,
      "created_at": 1693476000000,
      "updated_at": 1693477800000
    }
  ]
}
```

#### 実験設定作成
```http
POST /tables/experiment_configs
Content-Type: application/json
```

**リクエストボディ例:**
```json
{
  "experiment_name": "新規プロンプト実験",
  "description": "新しいプロンプトパターンのテスト",
  "llm_model": "gpt-4",
  "rate_limit_seconds": 2.0,
  "tolerance_percent": 3.0,
  "strict_matching": true,
  "target_entities": ["ent_001", "ent_004", "ent_005"],
  "target_fact_types": ["establishment_year", "elevation"],
  "prompt_patterns": ["direct", "accuracy"],
  "status": "draft"
}
```

## システムフィールド

すべてのテーブルには以下のシステムフィールドが自動的に付与されます：

- `id`: レコードの一意識別子（UUID）
- `gs_project_id`: プロジェクト識別子
- `gs_table_name`: テーブル名
- `created_at`: 作成日時（ミリ秒タイムスタンプ）
- `updated_at`: 更新日時（ミリ秒タイムスタンプ）

## エラーレスポンス

### 400 Bad Request
```json
{
  "error": "Validation Error",
  "message": "Required field 'name' is missing",
  "details": {
    "field": "name",
    "constraint": "required"
  }
}
```

### 404 Not Found  
```json
{
  "error": "Not Found",
  "message": "Entity with id 'ent_999' not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "Database connection failed"
}
```

## データ型定義

### エンティティ (`entities`)
```typescript
interface Entity {
  id: string;
  wikidata_id: string;
  name: string;
  name_en?: string;
  category: string;
  establishment_year?: number;
  birth_date?: string; // YYYY-MM-DD
  location_pref?: string;
  location_city?: string;
  elevation?: number; // meters
  length?: number; // kilometers
  website?: string;
  description?: string;
  status: 'active' | 'inactive' | 'archived';
}
```

### ファクトチェック結果 (`fact_check_results`)
```typescript
interface FactCheckResult {
  id: string;
  experiment_id: string;
  entity_id: string;
  entity_name: string;
  fact_type: string;
  prompt_pattern: 'direct' | 'polite' | 'accuracy' | 'reliability' | 'detailed';
  generated_prompt: string;
  wikidata_answer: string;
  llm_answer: string;
  llm_model: string;
  match_result: boolean;
  match_type: 'exact' | 'partial' | 'none';
  confidence_score: number; // 0.0 - 1.0
  execution_time: number; // milliseconds
  error_message?: string;
  notes?: string;
}
```

### 実験設定 (`experiment_configs`)
```typescript
interface ExperimentConfig {
  id: string;
  experiment_name: string;
  description: string;
  llm_model: string;
  rate_limit_seconds: number;
  tolerance_percent: number;
  strict_matching: boolean;
  target_entities: string[];
  target_fact_types: string[];
  prompt_patterns: string[];
  status: 'draft' | 'running' | 'completed' | 'failed';
  start_time?: number;
  end_time?: number;
  total_tests?: number;
  success_count?: number;
}
```

## JavaScript実装例

### 基本的なAPI呼び出し
```javascript
// エンティティ取得
async function getEntities(page = 1, limit = 10) {
    try {
        const response = await fetch(`tables/entities?page=${page}&limit=${limit}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('エンティティ取得エラー:', error);
        throw error;
    }
}

// ファクトチェック結果保存
async function saveFactCheckResult(result) {
    try {
        const response = await fetch('tables/fact_check_results', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(result)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('結果保存エラー:', error);
        throw error;
    }
}

// 検索機能
async function searchEntities(query) {
    try {
        const response = await fetch(`tables/entities?search=${encodeURIComponent(query)}`);
        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error('検索エラー:', error);
        return [];
    }
}
```

### エラーハンドリング
```javascript
async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error('ネットワークエラー: サーバーに接続できません');
        }
        throw error;
    }
}
```

## 使用上の注意

1. **レート制限**: 本番環境ではAPI呼び出しの頻度制限が実装される予定
2. **データサイズ**: 大量データ取得時は`limit`パラメータを適切に設定
3. **エラー処理**: 必ずtry-catchブロックでエラーハンドリングを実装
4. **キャッシュ**: 頻繁にアクセスするデータはローカルキャッシュの活用を推奨

このAPIリファレンスは開発・統合の参考として活用してください。