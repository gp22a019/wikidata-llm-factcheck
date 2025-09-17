// ファクトチェックシステム - メインエントリーポイント（リファクタリング版）

import FactCheckSystem from './fact-check-system.js';
import { WikidataAPI } from './wikidata-api.js';
import { OpenAIAPI } from './openai-api.js';
import { ATTRIBUTE_LABELS, PROMPT_PATTERNS } from './config.js';

// リファクタリング済みFactCheckSystemクラス（メソッド実装付き）
class RefactoredFactCheckSystem extends FactCheckSystem {
    constructor() {
        super();
        
        // API処理クラス
        this.wikidataAPI = new WikidataAPI();
        this.openaiAPI = new OpenAIAPI(this);
        
        // Config定数を読み込み
        this.attributeLabels = ATTRIBUTE_LABELS;
        this.promptPatterns = PROMPT_PATTERNS;
        
        // デバッグログを追加
        console.log('RefactoredFactCheckSystem initialized');
    }

    // ===========================================
    // 検索機能実装
    // ===========================================
    
    async handleSearch(query) {
        // Debug removed
        
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        this.searchTimeout = setTimeout(async () => {
            if (!query || query.length < 2) {
                document.getElementById('search-results').innerHTML = '';
                return;
            }
            
            // Debug removed
            
            try {
                const results = await this.wikidataAPI.searchEntities(query);
                // Debug removed
                
                // 結果が空の場合のフォールバック
                if (!results || results.length === 0) {
                    document.getElementById('search-results').innerHTML = '<div class="no-results">該当するエンティティが見つかりません</div>';
                    return;
                }
                
                this.displaySearchResults(results);
            } catch (error) {
                console.error('Search failed:', error);
                this.showNotification('検索中にエラーが発生しました', 'error');
            }
        }, 300);
    }

    displaySearchResults(results) {
        // Debug removed
        
        const container = document.getElementById('search-results');
        // Debug removed
        
        if (!container) {
            return;
        }
        
        if (results.length === 0) {
            container.innerHTML = '<div class="no-results">該当するエンティティが見つかりません</div>';
            return;
        }
        
        // Debug removed
        
        const html = results.map(item => `
            <div class="search-result-item" data-id="${item.id}" data-label="${item.label}">
                <div class="result-label">${item.label}</div>
                <div class="result-description">${item.description || ''}</div>
                <div class="result-id">ID: ${item.id}</div>
            </div>
        `).join('');
        
        // Debug removed
        container.innerHTML = html;
        
        // 結果項目にクリックイベントを追加
        const items = container.querySelectorAll('.search-result-item');
        
        items.forEach(item => {
            item.addEventListener('click', () => {
                // Debug removed
                this.selectEntity({
                    id: item.dataset.id,
                    label: item.dataset.label
                });
            });
        });
        
        container.style.display = 'block';
        // Debug removed
    }
    }

    selectEntity(entity) {
        this.selectedEntity = entity;
        
        // UI更新
        document.getElementById('entity-search').value = '';
        document.getElementById('search-results').style.display = 'none';
        
        const selectedDiv = document.getElementById('selected-entity');
        const nameSpan = document.getElementById('selected-entity-name');
        
        if (selectedDiv && nameSpan) {
            nameSpan.textContent = entity.label;
            selectedDiv.style.display = 'flex';
        }
        
        // 属性選択肢を更新
        this.updateAttributeOptions(entity.id);
    }

    clearSelectedEntity() {
        this.selectedEntity = null;
        
        const selectedDiv = document.getElementById('selected-entity');
        if (selectedDiv) {
            selectedDiv.style.display = 'none';
        }
        
        // 属性選択肢をクリア
        const attributeSelect = document.getElementById('attribute-select');
        if (attributeSelect) {
            attributeSelect.innerHTML = '<option value="">属性を選択してください</option>';
        }
    }

    async updateAttributeOptions(entityId) {
        try {
            const entity = await this.wikidataAPI.getEntityDetails(entityId);
            const instanceOf = this.extractInstanceOf(entity);
            
            const attributeSelect = document.getElementById('attribute-select');
            if (!attributeSelect) return;
            
            // エンティティタイプに基づく推奨属性
            const recommendedAttrs = this.getRecommendedAttributes(instanceOf);
            
            attributeSelect.innerHTML = '<option value="">属性を選択してください</option>';
            recommendedAttrs.forEach(attr => {
                const option = document.createElement('option');
                option.value = attr.id;
                option.textContent = attr.label;
                attributeSelect.appendChild(option);
            });
            
        } catch (error) {
            console.error('Failed to update attribute options:', error);
        }
    }

    extractInstanceOf(entity) {
        if (!entity?.claims?.P31) return [];
        
        return entity.claims.P31.map(claim => {
            const value = claim.mainsnak?.datavalue?.value;
            return value?.id;
        }).filter(Boolean);
    }

    getRecommendedAttributes(instanceOfIds) {
        const allAttributes = new Set();
        
        instanceOfIds.forEach(id => {
            const attrs = this.entityTypeAttributes[id] || [];
            attrs.forEach(attr => allAttributes.add(attr));
        });
        
        // デフォルト属性を追加
        if (allAttributes.size === 0) {
            ['inception', 'location', 'official_website'].forEach(attr => 
                allAttributes.add(attr)
            );
        }
        
        return Array.from(allAttributes).map(attr => ({
            id: attr,
            label: this.attributeLabels[attr] || attr
        }));
    }

    // ===========================================
    // ファクトチェック実行
    // ===========================================
    
    async executeFactCheck() {
        // モードに応じて処理を分岐
        if (this.currentMode === 'batch') {
            return this.executeBatchFactCheck();
        }
        
        // 単体検索モードの処理
        if (!this.selectedEntity) {
            this.showNotification('エンティティを検索・選択してください', 'error');
            return;
        }
        
        const attribute = document.getElementById('attribute-select').value;
        const pattern = document.querySelector('input[name="prompt-pattern"]:checked')?.value;
        
        if (!attribute || !pattern) {
            this.showNotification('属性とプロンプトパターンを選択してください', 'error');
            return;
        }
        
        if (!this.settings.openaiApiKey) {
            this.showNotification('OpenAI APIキーを設定してください', 'error');
            return;
        }

        try {
            await this.performSingleFactCheck(this.selectedEntity, attribute, pattern);
        } catch (error) {
            console.error('Fact check failed:', error);
            this.showNotification(`ファクトチェックでエラーが発生しました: ${error.message}`, 'error');
        }
    }

    async performSingleFactCheck(entity, attribute, pattern) {
        // Wikidataから正解データを取得
        const wikidataValue = await this.getWikidataAttribute(entity.id, attribute);
        
        // LLMに質問
        const prompt = this.buildPrompt(entity.label, attribute, pattern);
        const llmValue = await this.openaiAPI.callAPI(prompt);
        
        // 回答を評価
        const evaluation = this.evaluateAnswers(wikidataValue, llmValue, attribute);
        
        // 結果を表示
        this.displaySingleResult({
            entity: entity.label,
            attribute,
            wikidataValue,
            llmValue,
            evaluation
        });
        
        // 履歴に追加
        this.addToHistory({
            timestamp: new Date().toISOString(),
            entity: entity.label,
            attribute,
            pattern,
            wikidataValue,
            llmValue,
            evaluation
        });
    }

    buildPrompt(entityName, attribute, pattern) {
        const attributeLabel = this.attributeLabels[attribute] || attribute;
        const template = this.promptPatterns[pattern] || this.promptPatterns.direct;
        
        return template
            .replace('{entity}', entityName)
            .replace('{attribute}', attributeLabel);
    }

    // ===========================================
    // 回答評価システム
    // ===========================================
    
    evaluateAnswers(wikidataValue, llmValue, attribute) {
        // 基本的な評価ロジック
        if (!wikidataValue && !llmValue) {
            return { score: 0, status: 'データなし', details: '両方のデータが存在しません' };
        }
        
        if (!wikidataValue) {
            return { score: 0, status: 'Wikidata不明', details: 'Wikidataにデータがありません' };
        }
        
        if (!llmValue) {
            return { score: 0, status: 'LLM無回答', details: 'LLMが回答しませんでした' };
        }
        
        // 文字列として比較
        const wikiStr = String(wikidataValue).toLowerCase().trim();
        const llmStr = String(llmValue).toLowerCase().trim();
        
        // 完全一致
        if (wikiStr === llmStr) {
            return { score: 100, status: '一致', details: '完全一致' };
        }
        
        // 部分一致（属性に応じた柔軟な比較）
        if (this.isPartialMatch(wikiStr, llmStr, attribute)) {
            return { score: 70, status: '部分一致', details: '部分的に一致' };
        }
        
        // 不一致
        return { score: 0, status: '不一致', details: '情報が一致しません' };
    }

    isPartialMatch(wikiValue, llmValue, attribute) {
        // 年数の場合
        if (attribute === 'inception') {
            const wikiYear = wikiValue.match(/\d{4}/);
            const llmYear = llmValue.match(/\d{4}/);
            if (wikiYear && llmYear) {
                return wikiYear[0] === llmYear[0];
            }
        }
        
        // URLの場合
        if (attribute === 'website' || attribute === 'official_website') {
            return this.compareUrls(wikiValue, llmValue);
        }
        
        // 地名の場合
        if (attribute === 'location' || attribute === 'country') {
            return wikiValue.includes(llmValue) || llmValue.includes(wikiValue);
        }
        
        // 数値の場合
        if (['area', 'population', 'elevation'].includes(attribute)) {
            return this.compareNumbers(wikiValue, llmValue);
        }
        
        // 一般的な部分一致
        return wikiValue.includes(llmValue) || llmValue.includes(wikiValue);
    }

    compareUrls(url1, url2) {
        try {
            const domain1 = new URL(url1).hostname.replace('www.', '');
            const domain2 = new URL(url2).hostname.replace('www.', '');
            return domain1 === domain2;
        } catch {
            // URL解析に失敗した場合は文字列比較
            const clean1 = url1.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
            const clean2 = url2.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
            return clean1 === clean2;
        }
    }

    compareNumbers(num1, num2) {
        const wikiNum = parseFloat(String(num1).replace(/[^\d.]/g, ''));
        const llmNum = parseFloat(String(num2).replace(/[^\d.]/g, ''));
        
        if (!isNaN(wikiNum) && !isNaN(llmNum)) {
            const tolerance = 0.1; // 10%の許容範囲
            return Math.abs(wikiNum - llmNum) / wikiNum < tolerance;
        }
        
        return false;
    }

    // ===========================================
    // その他のメソッド（プレースホルダー）
    // ===========================================
    
    switchSearchMode(mode) {
        this.currentMode = mode;
        // UI切り替えロジック...
        console.log('Mode switched to:', mode);
    }
    
    populateDataTable() {
        // データテーブル初期化...
        console.log('Data table populated');
    }
    
    setupBatchSearchMode() {
        // 一括検索モード初期化...
        console.log('Batch search mode setup');
    }
    
    updatePatternExample() {
        // プロンプトパターン例表示更新...
        console.log('Pattern example updated');
    }
    
    loadHistory() {
        // 履歴読み込み...
        console.log('History loaded');
    }
    
    updateHistoryDisplay() {
        // 履歴表示更新...
        console.log('History display updated');
    }

    // API関連メソッドは openaiAPI に委譲
    async testApiKey() {
        const statusElement = document.getElementById('api-status');
        
        try {
            // 入力フィールドからAPIキーを取得
            const apiKeyInput = document.getElementById('openai-api-key');
            const apiKey = apiKeyInput.value.trim();
            
            if (!apiKey) {
                throw new Error('APIキーを入力してください');
            }
            
            // APIキーを設定に保存
            this.settings.openaiApiKey = apiKey;
            this.saveSettings();
            
            // APIキーをテスト
            const result = await this.openaiAPI.testApiKey(apiKey);
            
            statusElement.innerHTML = '✅ ' + result.message;
            statusElement.className = 'api-status success';
            this.showNotification('APIキーが有効です', 'success');
            
        } catch (error) {
            console.error('API test error:', error);
            statusElement.innerHTML = '❌ ' + error.message;
            statusElement.className = 'api-status error';
            this.showNotification(`APIキーテスト失敗: ${error.message}`, 'error');
        }
    }

    overrideLimits() { this.openaiAPI.overrideLimits(); }
    restoreLimits() { this.openaiAPI.restoreLimits(); }
    resetUsage() { this.openaiAPI.resetUsage(); }

    // その他のプレースホルダー
    handleEntityTypeSearch(query) { console.log('Entity type search:', query); }
    clearSelectedEntityType() { console.log('Entity type cleared'); }
    toggleAdvancedSearch() { console.log('Advanced search toggled'); }
    executeSimpleBatchSearch() { console.log('Simple batch search executed'); }
    executeBatchFactCheck() { console.log('Batch fact check executed'); }
    exportResults(format) { console.log('Results exported as:', format); }
    clearBatchResults() { console.log('Batch results cleared'); }
    clearHistory() { console.log('History cleared'); }
    exportHistory() { console.log('History exported'); }
    closeHistoryDetail() { console.log('History detail closed'); }
    
    // Wikidata属性取得をAPIモジュールに委譲
    async getWikidataAttribute(entityId, attribute) {
        try {
            const properties = await this.wikidataAPI.getEntityProperties(entityId);
            return properties[attribute] || null;
        } catch (error) {
            console.error('Failed to get Wikidata attribute:', error);
            return null;
        }
    }
    
    displaySingleResult(result) {
        // 単体検索結果の表示
        console.log('Single result:', result);
        
        // ChatGPT回答セクション表示
        const chatgptSection = document.getElementById('chatgpt-section');
        const chatgptResponse = document.getElementById('chatgpt-response');
        if (chatgptSection && chatgptResponse) {
            chatgptResponse.textContent = result.llmValue || 'No response';
            chatgptSection.style.display = 'block';
        }
        
        // 一致確認セクション表示
        const matchSection = document.getElementById('match-section');
        if (matchSection) {
            matchSection.style.display = 'block';
            // 詳細な一致確認テーブルの更新
            this.updateMatchTable(result);
        }
        
        // 履歴に追加
        this.addToHistory(result);
    }
    
    updateMatchTable(result) {
        const tbody = document.getElementById('match-table-body');
        if (!tbody) return;
        
        tbody.innerHTML = `
            <tr>
                <td>${result.attribute}</td>
                <td>${result.wikidataValue || 'データなし'}</td>
                <td>${result.llmValue || 'レスポンスなし'}</td>
                <td class="match-status ${result.evaluation?.status || 'unknown'}">${result.evaluation?.match || '不明'}</td>
                <td>${result.evaluation?.confidence || 0}%</td>
            </tr>
        `;
    }
    
    addToHistory(result) {
        // 履歴管理（簡易実装）
        console.log('Added to history:', result);
    }
}

// システム初期化
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing refactored fact check system...');
    window.factCheckSystem = new RefactoredFactCheckSystem();
});