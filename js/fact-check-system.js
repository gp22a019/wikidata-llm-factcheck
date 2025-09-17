// ファクトチェックシステム - メインクラス（リファクタリング版）

import { 
    DEFAULT_SETTINGS, 
    API_COSTS, 
    AVAILABLE_MODELS,
    ATTRIBUTE_LABELS,
    ENTITY_TYPE_ATTRIBUTES,
    PROMPT_PATTERNS,
    KNOWN_ENTITY_TYPES,
    CATEGORY_ATTRIBUTES,
    LOCATION_NAMES
} from './config.js';

class FactCheckSystem {
    constructor() {
        this.initializeProperties();
        this.init();
    }

    // ===========================================
    // 初期化
    // ===========================================
    
    initializeProperties() {
        // 基本プロパティ
        this.selectedEntity = null;
        this.selectedEntityType = null;
        this.results = [];
        this.history = [];
        this.charts = {};
        this.searchTimeout = null;
        
        // モード管理
        this.currentMode = 'single'; // 'single' or 'batch'
        this.batchResults = [];
        this.batchProgress = 0;
        this.batchStatsChart = null;
        
        // 設定（デフォルトから複製）
        this.settings = { ...DEFAULT_SETTINGS };
        
        // API使用量追跡
        this.usage = {
            daily: 0,
            hourly: 0,
            lastDayReset: new Date().toDateString(),
            lastHourReset: new Date().getHours(),
            totalCost: 0,
            totalApiCalls: 0,
            totalDailyCalls: 0,
            totalHourlyCalls: 0,
            dailyLimitOverride: false,
            hourlyLimitOverride: false,
            overrideTimestamp: null
        };
        
        // マスターデータ参照
        this.apiCosts = API_COSTS;
        this.availableModels = AVAILABLE_MODELS;
        this.attributeLabels = ATTRIBUTE_LABELS;
        this.entityTypeAttributes = ENTITY_TYPE_ATTRIBUTES;
        this.promptPatterns = PROMPT_PATTERNS;
        this.knownEntityTypes = KNOWN_ENTITY_TYPES;
        this.categoryAttributes = CATEGORY_ATTRIBUTES;
    }

    async init() {
        try {
            this.setupEventListeners();
            this.loadSettings();
            this.loadUsage();
            this.loadHistory();
            this.updateUsageDisplay();
            this.updateHistoryDisplay();
            this.updatePatternExample();
            this.populateDataTable();
            this.setupBatchSearchMode();
        } catch (error) {
            console.error('Initialization failed:', error);
            this.showNotification('システム初期化に失敗しました', 'error');
        }
    }

    // ===========================================
    // イベントリスナー設定
    // ===========================================
    
    setupEventListeners() {
        const addEventListenerSafe = (id, event, handler) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener(event, handler);
            } else {
                console.warn(`Element with id '${id}' not found`);
            }
        };

        // 基本検索
        this.setupSearchEventListeners();
        
        // モード切り替え
        this.setupModeEventListeners();
        
        // 実行とコントロール
        this.setupExecutionEventListeners(addEventListenerSafe);
        
        // API設定
        this.setupApiEventListeners(addEventListenerSafe);
        
        // 設定変更
        this.setupSettingsEventListeners();
        
        // 履歴管理
        this.setupHistoryEventListeners(addEventListenerSafe);
    }

    setupSearchEventListeners() {
        // エンティティ検索
        const searchInput = document.getElementById('entity-search');
        if (searchInput) {

            
            searchInput.addEventListener('input', (e) => {

                this.handleSearch(e.target.value);
            });
            
            searchInput.addEventListener('focus', () => {

                if (searchInput.value.trim()) {
                    this.handleSearch(searchInput.value);
                }
            });
        }
        
        // エンティティタイプ検索（一括検索用）
        const entityTypeSearch = document.getElementById('entity-type-search');
        if (entityTypeSearch) {
            entityTypeSearch.addEventListener('input', (e) => {
                this.handleEntityTypeSearch(e.target.value);
            });
        }
        
        // クリアボタン
        this.addEventListenerSafe('clear-entity', 'click', () => this.clearSelectedEntity());
        this.addEventListenerSafe('clear-entity-type', 'click', () => this.clearSelectedEntityType());
    }

    setupModeEventListeners() {
        // 検索モード切り替え
        const modeRadios = document.querySelectorAll('input[name="search-mode"]');
        modeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.switchSearchMode(e.target.value);
            });
        });
        
        // 高度検索の表示切り替え
        this.addEventListenerSafe('toggle-advanced', 'click', () => this.toggleAdvancedSearch());
    }

    setupExecutionEventListeners(addEventListenerSafe) {
        // 実行ボタン
        addEventListenerSafe('execute-btn', 'click', () => this.executeFactCheck());
        
        // 簡易一括検索
        addEventListenerSafe('execute-simple-batch', 'click', () => this.executeSimpleBatchSearch());
        
        // 一括検索結果のコントロール
        addEventListenerSafe('export-csv-btn', 'click', () => this.exportResults('csv'));
        addEventListenerSafe('export-json-btn', 'click', () => this.exportResults('json'));
        addEventListenerSafe('clear-results-btn', 'click', () => this.clearBatchResults());
    }

    setupApiEventListeners(addEventListenerSafe) {
        addEventListenerSafe('test-api-key', 'click', () => this.testApiKey());
        addEventListenerSafe('override-limits', 'click', () => this.overrideLimits());
        addEventListenerSafe('restore-limits', 'click', () => this.restoreLimits());
        addEventListenerSafe('reset-usage', 'click', () => this.resetUsage());
    }

    setupSettingsEventListeners() {
        // プロンプトパターン変更
        const patternRadios = document.querySelectorAll('input[name="prompt-pattern"]');
        patternRadios.forEach(radio => {
            radio.addEventListener('change', () => this.updatePatternExample());
        });
        
        // 設定変更監視
        const settingsInputs = ['tolerance-percent', 'llm-model', 'daily-limit', 'hourly-limit'];
        settingsInputs.forEach(id => {
            this.addEventListenerSafe(id, 'change', () => this.saveSettings());
        });
        
        this.addEventListenerSafe('strict-matching', 'change', () => this.saveSettings());
        this.addEventListenerSafe('confirm-before-api', 'change', () => this.saveSettings());
    }

    setupHistoryEventListeners(addEventListenerSafe) {
        addEventListenerSafe('clear-history', 'click', () => this.clearHistory());
        addEventListenerSafe('export-history', 'click', () => this.exportHistory());
    }

    addEventListenerSafe(id, event, handler) {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
        }
    }

    // ===========================================
    // 基本機能メソッド
    // ===========================================
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 4000);
    }

    // 設定の読み込み・保存
    loadSettings() {
        try {
            const saved = localStorage.getItem('factCheckSettings');
            if (saved) {
                this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
                this.applySettingsToUI();
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    saveSettings() {
        try {
            this.collectSettingsFromUI();
            localStorage.setItem('factCheckSettings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    applySettingsToUI() {
        const elements = {
            'tolerance-percent': this.settings.tolerancePercent,
            'llm-model': this.settings.llmModel,
            'daily-limit': this.settings.dailyLimit,
            'hourly-limit': this.settings.hourlyLimit,
            'openai-api-key': this.settings.openaiApiKey
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.value = value;
            }
        });

        // チェックボックス
        const strictMatching = document.getElementById('strict-matching');
        if (strictMatching) {
            strictMatching.checked = this.settings.strictMatching;
        }

        const confirmBeforeApi = document.getElementById('confirm-before-api');
        if (confirmBeforeApi) {
            confirmBeforeApi.checked = this.settings.confirmBeforeApi;
        }
    }

    collectSettingsFromUI() {
        const elements = {
            tolerancePercent: 'tolerance-percent',
            llmModel: 'llm-model',
            dailyLimit: 'daily-limit',
            hourlyLimit: 'hourly-limit',
            openaiApiKey: 'openai-api-key'
        };

        Object.entries(elements).forEach(([setting, id]) => {
            const element = document.getElementById(id);
            if (element) {
                const value = element.type === 'number' ? parseInt(element.value) || 0 : element.value;
                this.settings[setting] = value;
            }
        });

        // チェックボックス
        const strictMatching = document.getElementById('strict-matching');
        if (strictMatching) {
            this.settings.strictMatching = strictMatching.checked;
        }

        const confirmBeforeApi = document.getElementById('confirm-before-api');
        if (confirmBeforeApi) {
            this.settings.confirmBeforeApi = confirmBeforeApi.checked;
        }
    }

    // 使用量管理
    loadUsage() {
        try {
            const saved = localStorage.getItem('factCheckUsage');
            if (saved) {
                this.usage = { ...this.usage, ...JSON.parse(saved) };
            }
        } catch (error) {
            console.error('Failed to load usage:', error);
        }
    }

    saveUsage() {
        try {
            localStorage.setItem('factCheckUsage', JSON.stringify(this.usage));
        } catch (error) {
            console.error('Failed to save usage:', error);
        }
    }

    updateUsageDisplay() {
        const elements = {
            'daily-usage': this.usage.daily,
            'hourly-usage': this.usage.hourly,
            'estimated-cost': `$${this.usage.totalCost.toFixed(4)}`
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }

    // ===========================================
    // プレースホルダーメソッド（詳細実装は次のファイルで）
    // ===========================================
    
    async handleSearch(query) {
        // 実装は wikidata-api.js で
        console.log('Search:', query);
    }

    async executeFactCheck() {
        // 実装は fact-check-core.js で
        console.log('Execute fact check');
    }

    // その他のメソッドも同様にプレースホルダー
    clearSelectedEntity() {}
    switchSearchMode(mode) {}
    populateDataTable() {}
    setupBatchSearchMode() {}
    updatePatternExample() {}
    loadHistory() {}
    updateHistoryDisplay() {}
    testApiKey() {}
    overrideLimits() {}
    restoreLimits() {}
    resetUsage() {}
    clearHistory() {}
    exportHistory() {}
    closeHistoryDetail() {}
    handleEntityTypeSearch(query) {}
    clearSelectedEntityType() {}
    toggleAdvancedSearch() {}
    executeSimpleBatchSearch() {}
    exportResults(format) {}
    clearBatchResults() {}
}

export default FactCheckSystem;