// Fact Check システム - OpenAI & Wikidata API統合版

class FactCheckSystem {
    constructor() {
        this.selectedEntity = null;
        this.results = [];
        this.history = [];
        this.charts = {};
        this.searchTimeout = null;
        this.currentMode = 'single'; // 'single' or 'batch'
        this.batchResults = [];
        this.batchProgress = 0;
        this.batchStatsChart = null; // Chart.jsインスタンス管理
        
        // グローバルエラーハンドラー
        window.addEventListener('unhandledrejection', (event) => {
            console.error('⚠️ 未処理のPromise拒否:', event.reason);
            // Service Worker関連のエラーは無視
            if (event.reason && event.reason.toString().includes('workbox')) {
                event.preventDefault();
                console.log('📦 Service Workerエラーを無視しました');
            }
        });
        
        this.settings = {
            llmModel: 'gpt-4o-mini',
            tolerancePercent: 5,
            strictMatching: true,
            dailyLimit: 20,
            hourlyLimit: 10,
            confirmBeforeApi: true,
            openaiApiKey: '',
            urlProtocolFlexible: true,
            urlWwwFlexible: true
        };
        
        this.usage = {
            daily: 0,
            hourly: 0,
            lastDayReset: new Date().toDateString(),
            lastHourReset: new Date().getHours(),
            totalCost: 0,
            // 累計追跡用
            totalApiCalls: 0,
            totalDailyCalls: 0,
            totalHourlyCalls: 0,
            // リミット開放フラグ
            dailyLimitOverride: false,
            hourlyLimitOverride: false,
            overrideTimestamp: null
        };
        
        this.attributeLabels = {
            // 基本属性
            inception: "設立年",
            establishment_year: "設立年",
            birth_date: "生年月日",
            death_date: "死亡年月日",
            location: "場所",
            location_pref: "都道府県",
            location_city: "市町村",
            country: "国",
            official_website: "公式ウェブサイト",
            website: "ウェブサイト",
            
            // 地理・物理属性
            elevation: "標高",
            length: "全長",
            area: "面積",
            population: "人口",
            coordinate: "座標",
            
            // 人物属性
            occupation: "職業",
            nationality: "国籍",
            educated_at: "出身校",
            work_location: "勤務地",
            notable_work: "代表作",
            
            // 組織属性
            founded_by: "設立者",
            headquarters: "本社所在地",
            industry: "業界",
            employees: "従業員数",
            revenue: "売上",
            
            // 作品・メディア属性
            director: "監督",
            author: "著者",
            composer: "作曲者",
            performer: "出演者",
            genre: "ジャンル",
            publication_date: "発行日",
            duration: "上映時間",
            language: "言語",
            
            // 学術・教育属性
            academic_degree: "学位",
            field_of_study: "専攻分野",
            student_count: "学生数",
            faculty_count: "教員数",
            
            // 技術・製品属性
            manufacturer: "製造者",
            model: "モデル",
            operating_system: "OS",
            programming_language: "プログラミング言語"
        };
        
        // エンティティタイプ別の推奨属性（細分化版）
        this.entityTypeAttributes = {
            // 人物 (Q5)
            'Q5': ['birth_date', 'death_date', 'occupation', 'nationality', 'educated_at', 'notable_work'],
            
            // 大学 (Q3918)
            'Q3918': ['inception', 'location', 'student_count', 'faculty_count', 'official_website'],
            
            // === 企業カテゴリ（細分化） ===
            // 企業 (Q4830453) - 基本
            'Q4830453': ['inception', 'founded_by', 'headquarters', 'industry', 'employees', 'revenue', 'official_website'],
            
            // 自動車メーカー (Q786820)
            'Q786820': ['inception', 'headquarters', 'founded_by', 'official_website', 'industry', 'revenue', 'employees'],
            
            // 自動車会社 (Q18388277)  
            'Q18388277': ['inception', 'headquarters', 'founded_by', 'official_website', 'industry', 'revenue'],
            
            // 製造業 (Q319913)
            'Q319913': ['inception', 'headquarters', 'founded_by', 'industry', 'employees', 'revenue', 'official_website'],
            
            // テクノロジー企業 (Q1137109)
            'Q1137109': ['inception', 'headquarters', 'founded_by', 'official_website', 'industry', 'employees', 'revenue'],
            
            // 多国籍企業 (Q161726)
            'Q161726': ['inception', 'headquarters', 'founded_by', 'industry', 'employees', 'revenue', 'official_website'],
            
            // 上場企業 (Q891723)
            'Q891723': ['inception', 'headquarters', 'industry', 'employees', 'revenue', 'official_website'],
            
            // === その他エンティティ ===
            // 映画 (Q11424)
            'Q11424': ['director', 'publication_date', 'duration', 'genre', 'language', 'performer'],
            
            // 本 (Q571)
            'Q571': ['author', 'publication_date', 'genre', 'language', 'publisher'],
            
            // 音楽作品 (Q2188189)
            'Q2188189': ['composer', 'performer', 'publication_date', 'genre', 'duration'],
            
            // 山 (Q8502)
            'Q8502': ['elevation', 'location', 'country', 'coordinate'],
            
            // 川 (Q4022)
            'Q4022': ['length', 'location', 'country'],
            
            // 都市 (Q515)
            'Q515': ['population', 'area', 'country', 'coordinate', 'official_website'],
            
            // 国 (Q6256)
            'Q6256': ['population', 'area', 'capital', 'official_language', 'currency'],
            
            // ソフトウェア (Q7397)
            'Q7397': ['developer', 'inception', 'programming_language', 'operating_system', 'official_website']
        };
        
        // SPARQLクエリテンプレート
        this.sparqlQueries = {
            'japanese-universities': `
                SELECT DISTINCT ?item ?itemLabel ?location ?locationLabel ?inception ?website WHERE {
                    ?item wdt:P31/wdt:P279* wd:Q3918 .
                    ?item wdt:P17 wd:Q17 .
                    OPTIONAL { ?item wdt:P131 ?location . }
                    OPTIONAL { ?item wdt:P571 ?inception . }
                    OPTIONAL { ?item wdt:P856 ?website . }
                    SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en" . }
                }
                ORDER BY ?itemLabel
                LIMIT %LIMIT%
            `,
            'japanese-prefectures': `
                SELECT DISTINCT ?item ?itemLabel ?capital ?capitalLabel ?population ?area WHERE {
                    ?item wdt:P31 wd:Q50337 .
                    ?item wdt:P17 wd:Q17 .
                    OPTIONAL { ?item wdt:P36 ?capital . }
                    OPTIONAL { ?item wdt:P1082 ?population . }
                    OPTIONAL { ?item wdt:P2046 ?area . }
                    SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en" . }
                }
                ORDER BY ?itemLabel
                LIMIT %LIMIT%
            `,
            'japanese-mountains': `
                SELECT DISTINCT ?item ?itemLabel ?elevation ?location ?locationLabel WHERE {
                    ?item wdt:P31/wdt:P279* wd:Q8502 .
                    ?item wdt:P17 wd:Q17 .
                    OPTIONAL { ?item wdt:P2044 ?elevation . }
                    OPTIONAL { ?item wdt:P131 ?location . }
                    SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en" . }
                }
                ORDER BY DESC(?elevation)
                LIMIT %LIMIT%
            `,
            'japanese-rivers': `
                SELECT DISTINCT ?item ?itemLabel ?length ?mouth ?mouthLabel ?location ?locationLabel WHERE {
                    ?item wdt:P31/wdt:P279* wd:Q4022 .
                    ?item wdt:P17 wd:Q17 .
                    OPTIONAL { ?item wdt:P2043 ?length . }
                    OPTIONAL { ?item wdt:P403 ?mouth . }
                    OPTIONAL { ?item wdt:P131 ?location . }
                    SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en" . }
                }
                ORDER BY DESC(?length)
                LIMIT %LIMIT%
            `,
            'japanese-companies': `
                SELECT DISTINCT ?item ?itemLabel ?inception ?industry ?industryLabel ?headquarters ?headquartersLabel ?website WHERE {
                    ?item wdt:P31/wdt:P279* wd:Q4830453 .
                    ?item wdt:P17 wd:Q17 .
                    OPTIONAL { ?item wdt:P571 ?inception . }
                    OPTIONAL { ?item wdt:P452 ?industry . }
                    OPTIONAL { ?item wdt:P159 ?headquarters . }
                    OPTIONAL { ?item wdt:P856 ?website . }
                    SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en" . }
                }
                ORDER BY ?itemLabel
                LIMIT %LIMIT%
            `,
            'world-countries': `
                SELECT DISTINCT ?item ?itemLabel ?capital ?capitalLabel ?population ?area ?continent ?continentLabel WHERE {
                    ?item wdt:P31 wd:Q6256 .
                    OPTIONAL { ?item wdt:P36 ?capital . }
                    OPTIONAL { ?item wdt:P1082 ?population . }
                    OPTIONAL { ?item wdt:P2046 ?area . }
                    OPTIONAL { ?item wdt:P30 ?continent . }
                    SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en" . }
                }
                ORDER BY ?itemLabel
                LIMIT %LIMIT%
            `,
            'world-capitals': `
                SELECT DISTINCT ?item ?itemLabel ?country ?countryLabel ?population ?area WHERE {
                    ?item wdt:P31/wdt:P279* wd:Q5119 .
                    OPTIONAL { ?item wdt:P17 ?country . }
                    OPTIONAL { ?item wdt:P1082 ?population . }
                    OPTIONAL { ?item wdt:P2046 ?area . }
                    SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en" . }
                }
                ORDER BY ?itemLabel
                LIMIT %LIMIT%
            `
        };
        
        // カテゴリ別の検証可能属性
        this.categoryAttributes = {
            'japanese-universities': [
                { id: 'inception', label: '設立年', property: 'P571' },
                { id: 'location', label: '所在地', property: 'P131' },
                { id: 'student_count', label: '学生数', property: 'P2196' },
                { id: 'website', label: 'ウェブサイト', property: 'P856' }
            ],
            'japanese-prefectures': [
                { id: 'capital', label: '県庁所在地', property: 'P36' },
                { id: 'population', label: '人口', property: 'P1082' },
                { id: 'area', label: '面積', property: 'P2046' }
            ],
            'japanese-mountains': [
                { id: 'elevation', label: '標高', property: 'P2044' },
                { id: 'location', label: '所在地', property: 'P131' },
                { id: 'mountain_range', label: '山脈', property: 'P4552' }
            ],
            'japanese-rivers': [
                { id: 'length', label: '全長', property: 'P2043' },
                { id: 'mouth', label: '河口', property: 'P403' },
                { id: 'source', label: '水源', property: 'P885' }
            ],
            'japanese-companies': [
                { id: 'inception', label: '設立年', property: 'P571' },
                { id: 'industry', label: '業界', property: 'P452' },
                { id: 'headquarters', label: '本社所在地', property: 'P159' },
                { id: 'website', label: 'ウェブサイト', property: 'P856' }
            ],
            'world-countries': [
                { id: 'capital', label: '首都', property: 'P36' },
                { id: 'population', label: '人口', property: 'P1082' },
                { id: 'area', label: '面積', property: 'P2046' },
                { id: 'continent', label: '大陸', property: 'P30' }
            ],
            'world-capitals': [
                { id: 'country', label: '国', property: 'P17' },
                { id: 'population', label: '人口', property: 'P1082' },
                { id: 'area', label: '面積', property: 'P2046' }
            ]
        };
        
        // 高橋萌香さんの研究手法に基づくカンマ区切り回答専用プロンプト
        this.promptPatterns = {
            direct: "{entity}の{attribute}を答えてください。回答は数値や名称のみ、余分な説明は不要です。",
            polite: "{entity}の{attribute}について、正確な情報のみを簡潔に回答してください。",
            accuracy: "{entity}の{attribute}を正確に調査し、事実のみを回答してください。説明文は不要です。",
            reliability: "{entity}の{attribute}について、信頼できる最新情報を基に事実のみを回答してください。",
            detailed: "{entity}の{attribute}を詳細に調査し、正確な情報のみを回答してください。"
        };
        
        this.apiCosts = {
            'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
            'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
            'gpt-4': { input: 0.03, output: 0.06 },
            'gpt-4o': { input: 0.005, output: 0.015 },
            'gpt-5': { input: 0.10, output: 0.30 }  // 予想価格（実際の価格は公開時に要更新）
        };
        
        // 利用可能なモデル一覧
        this.availableModels = [
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: '高速・低コスト' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'バランス型' },
            { id: 'gpt-4o', name: 'GPT-4o', description: '高性能' },
            { id: 'gpt-4', name: 'GPT-4', description: '最高品質' },
            { id: 'gpt-5', name: 'GPT-5', description: '次世代AI（Preview）' }
        ];
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        this.loadSettings();
        this.loadUsage();
        this.loadHistory();
        this.updateUsageDisplay();
        this.updateHistoryDisplay();
        this.updatePatternExample(); // 初期表示
        this.populateDataTable();
        this.setupBatchSearchMode(); // 一括検索モード初期化

    }
    
    setupEventListeners() {
        // 安全なイベントリスナー設定（要素の存在確認）
        const addEventListenerSafe = (id, event, handler) => {
            const element = document.getElementById(id);
            if (element) {
                // 重複チェック：データ属性で登録済みかチェック（ハイフンを除去）
                const listenerKey = `listener${event.charAt(0).toUpperCase() + event.slice(1)}`;
                if (element.dataset[listenerKey] === 'registered') {
                    console.log(`Event listener for ${id}:${event} already registered, skipping`);
                    return;
                }
                
                element.addEventListener(event, handler);
                element.dataset[listenerKey] = 'registered';
                console.log(`Event listener registered for ${id}:${event}`);
            } else {
                console.warn(`Element with id '${id}' not found`);
            }
        };
        
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
        
        // エンティティ選択クリア
        addEventListenerSafe('clear-entity', 'click', () => {
            this.clearSelectedEntity();
        });
        
        // 実行ボタン
        addEventListenerSafe('execute-btn', 'click', () => {
            this.executeFactCheck();
        });
        
        // プロンプトパターン変更時の例表示更新
        const patternRadios = document.querySelectorAll('input[name="prompt-pattern"]');
        patternRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                this.updatePatternExample();
            });
        });
        
        // 検索モード切り替え
        const modeRadios = document.querySelectorAll('input[name="search-mode"]');
        modeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.switchSearchMode(e.target.value);
            });
        });
        
        // エンティティタイプ検索
        const entityTypeSearch = document.getElementById('entity-type-search');
        if (entityTypeSearch) {
            entityTypeSearch.addEventListener('input', (e) => {
                this.handleEntityTypeSearch(e.target.value);
            });
        }
        
        // エンティティタイプ選択クリア
        addEventListenerSafe('clear-entity-type', 'click', () => {
            this.clearSelectedEntityType();
        });
        
        // 簡易一括検索
        addEventListenerSafe('execute-simple-batch', 'click', () => {
            this.executeSimpleBatchSearch();
        });
        
        // 高度検索の表示切り替え
        addEventListenerSafe('toggle-advanced', 'click', () => {
            this.toggleAdvancedSearch();
        });
        
        // 一括検索結果のコントロール
        addEventListenerSafe('export-csv-btn', 'click', () => {
            this.exportResults('csv');
        });
        
        addEventListenerSafe('export-json-btn', 'click', () => {
            this.exportResults('json');
        });
        
        addEventListenerSafe('clear-results-btn', 'click', () => {
            this.clearBatchResults();
        });



        // API設定
        addEventListenerSafe('test-api-key', 'click', () => {
            this.testApiKey();
        });
        
        addEventListenerSafe('override-limits', 'click', () => {
            this.overrideLimits();
        });
        
        addEventListenerSafe('restore-limits', 'click', () => {
            this.restoreLimits();
        });
        
        addEventListenerSafe('reset-usage', 'click', () => {
            this.resetUsage();
        });
        
        // 設定関連
        addEventListenerSafe('save-settings', 'click', () => {
            this.saveSettings();
        });
        
        addEventListenerSafe('export-results', 'click', () => {
            this.exportResults();
        });
        
        // 履歴関連
        addEventListenerSafe('clear-history', 'click', () => {
            this.clearHistory();
        });
        
        addEventListenerSafe('export-history', 'click', () => {
            this.exportHistory();
        });
        

        
        // 外部クリックで検索結果を閉じる
        document.addEventListener('click', (e) => {
            const searchResults = document.getElementById('search-results');
            if (searchResults && !e.target.closest('.search-container')) {
                searchResults.style.display = 'none';
            }
        });
    }
    
    // Wikidata検索機能
    async handleSearch(query) {
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        if (query.trim().length < 2) {
            document.getElementById('search-results').style.display = 'none';
            return;
        }
        
        this.searchTimeout = setTimeout(async () => {
            try {
                await this.searchWikidata(query.trim());
            } catch (error) {
                console.error('検索エラー:', error);
                this.showNotification('検索中にエラーが発生しました', 'error');
            }
        }, 300);
    }
    
    async searchWikidata(query) {
        const searchResults = document.getElementById('search-results');
        searchResults.innerHTML = '<div style="padding: 10px; text-align: center;">検索中...</div>';
        searchResults.style.display = 'block';
        
        try {
            // Wikidata Entity Search API - 日本語優先設定
            const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=ja&uselang=ja&format=json&origin=*&limit=10`;
            
            const response = await fetch(searchUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.search && data.search.length > 0) {
                this.displaySearchResults(data.search);
            } else {
                searchResults.innerHTML = '<div style="padding: 10px; text-align: center; color: #666;">検索結果が見つかりませんでした</div>';
            }
        } catch (error) {
            console.error('Wikidata検索エラー:', error);
            searchResults.innerHTML = '<div style="padding: 10px; text-align: center; color: #d32f2f;">検索エラーが発生しました</div>';
        }
    }
    
    // HTMLエスケープヘルパー
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // 日本語優先のラベル取得
    getPreferredLabel(item) {
        // 検索API結果での優先順位: 日本語 > 英語 > その他
        if (item.labels) {
            // 詳細データがある場合（fetchEntityDetails後）
            if (item.labels.ja && item.labels.ja.value) return item.labels.ja.value;
            if (item.labels.en && item.labels.en.value) return item.labels.en.value;
            
            // 他の言語があれば使用
            const firstLabel = Object.values(item.labels)[0];
            if (firstLabel && firstLabel.value) return firstLabel.value;
        }
        
        // 検索結果の直接ラベル（通常は指定言語）
        if (item.label) return item.label;
        
        // フォールバック
        return item.id || 'Unknown Entity';
    }
    
    // 日本語優先の説明取得
    getPreferredDescription(item) {
        // 詳細データがある場合
        if (item.descriptions) {
            if (item.descriptions.ja && item.descriptions.ja.value) return item.descriptions.ja.value;
            if (item.descriptions.en && item.descriptions.en.value) return item.descriptions.en.value;
            
            // 他の言語があれば使用
            const firstDesc = Object.values(item.descriptions)[0];
            if (firstDesc && firstDesc.value) return firstDesc.value;
        }
        
        // 検索結果の直接説明
        if (item.description) return item.description;
        
        // エイリアス（別名）を使用
        if (item.aliases && item.aliases.length > 0) {
            return item.aliases[0];
        }
        
        // フォールバック
        return 'Wikidataエンティティ';
    }

    displaySearchResults(results) {
        console.log('🔍 displaySearchResults 開始:', results);
        const searchResults = document.getElementById('search-results');
        
        const html = results.map(item => {
            // 日本語優先のラベル取得
            const label = this.getPreferredLabel(item);
            const description = this.getPreferredDescription(item);
            
            // HTMLエスケープ処理
            const safeLabel = this.escapeHtml(label);
            const safeDescription = this.escapeHtml(description);
            const safeEntityData = JSON.stringify(item).replace(/'/g, '&#39;');
            
            return `
                <div class="search-result-item" data-entity='${safeEntityData}' style="cursor: pointer;">
                    <div class="search-result-name">${safeLabel}</div>
                    <div class="search-result-description">${safeDescription} (${item.id})</div>
                </div>
            `;
        }).join('');
        
        searchResults.innerHTML = html;
        searchResults.style.display = 'block';
        
        // クリックイベント追加
        console.log('📱 クリックイベント追加開始');
        searchResults.querySelectorAll('.search-result-item').forEach((item, index) => {
            item.addEventListener('click', async (event) => {
                // デフォルト動作を防止（リンクなどのナビゲーションを停止）
                event.preventDefault();
                event.stopPropagation();
                
                console.log(`🖱️ 検索結果 ${index} クリック:`, item.dataset.entity);
                try {
                    const entityData = JSON.parse(item.dataset.entity);
                    console.log('📊 パース済みエンティティデータ:', entityData);
                    console.log('🚀 selectEntity 呼び出し開始');
                    await this.selectEntity(entityData);
                    console.log('✅ selectEntity 呼び出し完了');
                } catch (error) {
                    console.error('❌ クリック処理エラー:', error);
                }
            });
            console.log(`✅ クリックイベント追加完了 ${index}`);
        });
    }
    
    async selectEntity(entityData) {
        console.log('🎯 selectEntity 開始:', entityData);
        try {
            // 詳細情報を取得
            console.log('📡 fetchEntityDetails 呼び出し開始');
            await this.fetchEntityDetails(entityData);
            console.log('✅ fetchEntityDetails 完了');
            
            // UI更新
            console.log('🎨 UI更新開始');
            document.getElementById('entity-search').value = '';
            document.getElementById('search-results').style.display = 'none';
            
            const selectedDiv = document.getElementById('selected-entity');
            const nameSpan = document.getElementById('selected-entity-name');
            nameSpan.textContent = `${entityData.label} (${entityData.id})`;
            selectedDiv.style.display = 'flex';
            console.log('✅ UI更新完了');
            
            // 属性選択肢を動的更新
            console.log('🔄 updateAttributeOptions 呼び出し開始');
            await this.updateAttributeOptions();
            console.log('✅ updateAttributeOptions 完了');
        } catch (error) {
            console.error('❌ selectEntity エラー:', error);
            console.error('📊 エラースタック:', error.stack);
        }
    }
    
    async fetchEntityDetails(entityData) {
        try {
            console.log('🌐 エンティティ詳細取得開始:', entityData.id);
            // Wikidata Entity Details API
            const detailsUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityData.id}&languages=ja|en&format=json&origin=*`;
            console.log('📡 API URL:', detailsUrl);
            
            const response = await fetch(detailsUrl);
            console.log('📡 レスポンス受信:', response.status, response.statusText);
            
            const data = await response.json();
            console.log('📊 レスポンスデータ:', data);
            
            const entity = data.entities[entityData.id];
            if (entity) {
                const claimsCount = entity.claims ? Object.keys(entity.claims).length : 0;
                console.log(`✅ エンティティデータ取得成功: ${claimsCount}個のクレーム`);
                
                // 日本語優先のラベル・説明を取得
                const preferredLabel = this.getPreferredLabel({
                    ...entityData, 
                    labels: entity.labels
                });
                const preferredDescription = this.getPreferredDescription({
                    ...entityData, 
                    descriptions: entity.descriptions
                });
                
                this.selectedEntity = {
                    id: entity.id,
                    label: preferredLabel,
                    description: preferredDescription,
                    claims: entity.claims || {},
                    labels: entity.labels || {},
                    descriptions: entity.descriptions || {}
                };
                
                console.log('📋 設定された selectedEntity:', this.selectedEntity);
                
                // よく使用される属性を抽出
                await this.extractCommonAttributes();
            } else {
                console.error('❌ エンティティが見つかりません:', entityData.id);
                throw new Error(`エンティティが見つかりません: ${entityData.id}`);
            }
        } catch (error) {
            console.error('❌ エンティティ詳細取得エラー:', error);
            // 基本情報のみで継続
            this.selectedEntity = {
                id: entityData.id,
                label: entityData.label,
                description: entityData.description,
                claims: {},
                labels: {}
            };
            console.log('🆘 フォールバック selectedEntity設定:', this.selectedEntity);
        }
    }
    
    async extractCommonAttributes() {
        if (!this.selectedEntity.claims) return;
        
        const claims = this.selectedEntity.claims;
        this.selectedEntity.extractedData = {};
        
        // 拡張されたプロパティマッピング
        const propertyMap = {
            // 基本情報
            'P571': 'inception',           // 設立年
            'P569': 'birth_date',          // 生年月日
            'P570': 'death_date',          // 死亡年月日
            'P131': 'location',            // 所在地
            'P17': 'country',              // 国
            'P856': 'official_website',    // 公式ウェブサイト
            'P31': 'instance_of',          // インスタンス
            
            // 地理・物理
            'P2044': 'elevation',          // 標高
            'P2043': 'length',             // 全長
            'P2046': 'area',               // 面積
            'P1082': 'population',         // 人口
            'P625': 'coordinate',          // 座標
            
            // 人物
            'P106': 'occupation',          // 職業
            'P27': 'nationality',          // 国籍
            'P69': 'educated_at',          // 出身校
            'P937': 'work_location',       // 勤務地
            'P800': 'notable_work',        // 代表作
            
            // 組織
            'P112': 'founded_by',          // 設立者
            'P159': 'headquarters',        // 本社所在地
            'P452': 'industry',            // 業界
            'P1128': 'employees',          // 従業員数
            'P2139': 'revenue',            // 売上
            
            // 作品・メディア
            'P57': 'director',             // 監督
            'P50': 'author',               // 著者
            'P86': 'composer',             // 作曲者
            'P161': 'performer',           // 出演者
            'P136': 'genre',               // ジャンル
            'P577': 'publication_date',    // 発行日
            'P2047': 'duration',           // 上映時間
            'P407': 'language',            // 言語
            
            // 教育
            'P2196': 'student_count',      // 学生数
            'P1128': 'faculty_count',      // 教員数
            
            // 技術
            'P176': 'manufacturer',        // 製造者
            'P1324': 'model',              // モデル
            'P306': 'operating_system',    // OS
            'P277': 'programming_language' // プログラミング言語
        };
        
        // インスタンスタイプを先に取得
        let instanceTypes = [];
        if (claims['P31']) {
            instanceTypes = claims['P31'].map(claim => {
                if (claim.mainsnak.datavalue && claim.mainsnak.datavalue.type === 'wikibase-entityid') {
                    return claim.mainsnak.datavalue.value.id;
                }
                return null;
            }).filter(Boolean);
        }
        
        this.selectedEntity.instanceTypes = instanceTypes;
        
        // 属性抽出
        for (const [prop, key] of Object.entries(propertyMap)) {
            if (claims[prop] && claims[prop][0]) {
                const claim = claims[prop][0];
                let value = null;
                
                if (claim.mainsnak.datavalue) {
                    const datavalue = claim.mainsnak.datavalue;
                    if (datavalue.type === 'time') {
                        // 時間データの処理
                        const time = datavalue.value.time;
                        if (key === 'inception' || key === 'birth_date' || key === 'death_date' || key === 'publication_date') {
                            if (time.includes('-')) {
                                // 年のみ抽出
                                const yearMatch = time.match(/([+-]?\\d{1,4})/);
                                value = yearMatch ? parseInt(yearMatch[1]) : time;
                            } else {
                                value = time;
                            }
                        } else {
                            value = time;
                        }
                    } else if (datavalue.type === 'quantity') {
                        // 数値データの処理
                        value = parseFloat(datavalue.value.amount);
                    } else if (datavalue.type === 'string') {
                        // 文字列データの処理
                        value = datavalue.value;
                    } else if (datavalue.type === 'wikibase-entityid') {
                        // エンティティIDの処理
                        const entityId = datavalue.value.id;
                        
                        // 位置情報属性の場合は階層的な取得を使用
                        if (key === 'location' || key === 'headquarters') {
                            value = await this.resolveLocationHierarchy(entityId);
                        } else {
                            value = await this.resolveEntityLabel(entityId);
                        }
                    } else if (datavalue.type === 'globecoordinate') {
                        // 座標データの処理
                        const coord = datavalue.value;
                        value = `${coord.latitude}, ${coord.longitude}`;
                    }
                }
                
                if (value !== null) {
                    this.selectedEntity.extractedData[key] = value;
                }
            }
        }
    }
    
    // APIキーの形式検証
    validateApiKey(apiKey) {
        // 基本的な形式チェック
        if (!apiKey || typeof apiKey !== 'string') {
            return { valid: false, message: 'APIキーが空または無効です' };
        }
        
        // OpenAI APIキーの基本的な形式チェック
        const validPrefixes = ['sk-', 'sk-proj-', 'sk-org-'];
        const hasValidPrefix = validPrefixes.some(prefix => apiKey.startsWith(prefix));
        
        if (!hasValidPrefix) {
            return { valid: false, message: 'OpenAI APIキーは "sk-", "sk-proj-", または "sk-org-" で始まる必要があります' };
        }
        
        // 長さチェック（OpenAI APIキーは40文字以上、200文字以下）
        if (apiKey.length < 40 || apiKey.length > 200) {
            return { valid: false, message: `APIキーの長さが不正です (現在: ${apiKey.length}文字、有効範囲: 40-200文字)` };
        }
        
        // ASCII文字のみかチェック（英数字、ハイフン、アンダースコア）
        if (!/^[A-Za-z0-9_-]+$/.test(apiKey)) {
            return { valid: false, message: 'APIキーに不正な文字が含まれています（英数字、ハイフン、アンダースコアのみ使用可能）' };
        }
        
        // 不正な文字のチェック
        if (/[\s\n\r\t]/.test(apiKey)) {
            return { valid: false, message: 'APIキーに空白文字や改行文字が含まれています' };
        }
        
        // 構造チェック（基本的なパターン検証）
        let expectedPattern;
        if (apiKey.startsWith('sk-proj-')) {
            // プロジェクトベースキー: sk-proj-xxxxxxxxxx（英数字、ハイフン、アンダースコア）
            expectedPattern = /^sk-proj-[A-Za-z0-9_-]{48,}$/;
        } else if (apiKey.startsWith('sk-org-')) {
            // 組織キー: sk-org-xxxxxxxxxx（英数字、ハイフン、アンダースコア）
            expectedPattern = /^sk-org-[A-Za-z0-9_-]{40,}$/;
        } else {
            // 従来形式: sk-xxxxxxxxxx（英数字、ハイフン、アンダースコア）
            expectedPattern = /^sk-[A-Za-z0-9_-]{48,}$/;
        }
        
        if (!expectedPattern.test(apiKey)) {
            return { 
                valid: false, 
                message: `APIキーの構造が不正です。英数字、ハイフン、アンダースコアのみを使用し、正しい形式で入力してください` 
            };
        }
        
        return { valid: true, message: '形式は有効です' };
    }
    
    // HTTPヘッダー値のサニタイズ
    sanitizeHeaderValue(value) {
        if (!value || typeof value !== 'string') {
            return '';
        }
        
        // ASCII範囲外の文字を除去
        let sanitized = value.replace(/[^\x20-\x7E]/g, '');
        
        // 制御文字を除去
        sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
        
        // 先頭・末尾の空白を除去
        sanitized = sanitized.trim();
        
        return sanitized;
    }
    
    // 人物名・固有名詞の評価
    evaluatePersonName(wikidataAnswer, llmAnswer) {
        const wikidataStr = String(wikidataAnswer).trim();
        const llmStr = String(llmAnswer).trim();
        
        // 完全一致チェック
        if (wikidataStr === llmStr) {
            return { match: true, type: 'exact', confidence: 1.0, notes: '完全一致' };
        }
        
        // 人物名を抽出（様々なパターンに対応）
        const personNames = this.extractPersonNames(llmStr);
        
        // 抽出された人物名との比較
        for (const name of personNames) {
            if (name === wikidataStr) {
                return { 
                    match: true, 
                    type: 'exact', 
                    confidence: 1.0, 
                    notes: `文章中から人物名を抽出して一致: ${name}` 
                };
            }
            
            // 部分一致チェック（名前の読み方違いなど）
            if (this.isPersonNameSimilar(wikidataStr, name)) {
                return { 
                    match: true, 
                    type: 'partial', 
                    confidence: 0.9, 
                    notes: `人物名の類似マッチ: ${name}` 
                };
            }
        }
        
        // 通常の文字列比較にフォールバック
        if (wikidataStr.toLowerCase() === llmStr.toLowerCase() || 
            llmStr.toLowerCase().includes(wikidataStr.toLowerCase())) {
            return { match: true, type: 'exact', confidence: 1.0, notes: '完全一致（大小文字無視）' };
        } else if (wikidataStr.toLowerCase().includes(llmStr.toLowerCase()) || 
                   this.partialMatch(wikidataStr.toLowerCase(), llmStr.toLowerCase())) {
            return { match: true, type: 'partial', confidence: 0.7, notes: '部分一致' };
        } else {
            return { match: false, type: 'none', confidence: 0, notes: '不一致' };
        }
    }
    
    // 文章から人物名を抽出
    extractPersonNames(text) {
        if (!text || typeof text !== 'string') return [];
        
        const names = new Set();
        
        // 日本語人名パターン（ひらがなを含む）
        const japaneseNamePatterns = [
            /([一-龯ひらがなカタカナ]{2,4})\s*[（(]\s*([ひらがなカタカナ\s]+)\s*[）)]/g,  // 漢字（ひらがな）
            /([一-龯]{2,4})\s*[（(]\s*([一-龯ひらがなカタカナ\s]+)\s*[）)]/g,           // 漢字（読み）
            /([一-龯ひらがなカタカナ]{2,6})/g                                           // 単純な日本語名
        ];
        
        for (const pattern of japaneseNamePatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                if (match[1]) {
                    names.add(match[1].trim());
                }
            }
        }
        
        // 西洋人名パターン
        const westernNamePattern = /[A-Z][a-z]+\s+[A-Z][a-z]+/g;
        let match;
        while ((match = westernNamePattern.exec(text)) !== null) {
            names.add(match[0].trim());
        }
        
        return Array.from(names);
    }
    
    // 人物名の類似性判定
    isPersonNameSimilar(name1, name2) {
        // 基本的な類似性チェック
        const n1 = name1.toLowerCase().replace(/\s+/g, '');
        const n2 = name2.toLowerCase().replace(/\s+/g, '');
        
        // 一方が他方を含む場合
        if (n1.includes(n2) || n2.includes(n1)) {
            return true;
        }
        
        // レーベンシュタイン距離による類似性（簡易版）
        const maxLength = Math.max(n1.length, n2.length);
        const distance = this.levenshteinDistance(n1, n2);
        
        // 70%以上の類似性があれば類似と判定
        return (maxLength - distance) / maxLength >= 0.7;
    }
    
    // レーベンシュタイン距離計算
    levenshteinDistance(str1, str2) {
        const matrix = [];
        const len1 = str1.length;
        const len2 = str2.length;
        
        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 1; j <= len2; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,        // deletion
                    matrix[i][j - 1] + 1,        // insertion
                    matrix[i - 1][j - 1] + cost  // substitution
                );
            }
        }
        
        return matrix[len1][len2];
    }
    
    // 場所・地理情報の評価
    evaluateLocation(wikidataAnswer, llmAnswer) {
        const wikidataStr = String(wikidataAnswer).trim();
        const llmStr = String(llmAnswer).trim();
        
        // 完全一致チェック
        if (wikidataStr === llmStr) {
            return { match: true, type: 'exact', confidence: 1.0, notes: '完全一致' };
        }
        
        // 場所名を抽出
        const wikidataPlaces = this.extractPlaceNames(wikidataStr);
        const llmPlaces = this.extractPlaceNames(llmStr);
        
        if (wikidataPlaces.length === 0 || llmPlaces.length === 0) {
            // 通常の文字列比較にフォールバック
            return this.evaluateTextSimilarity(wikidataStr, llmStr);
        }
        
        // 正確性評価: 正しい情報と間違い情報の比率
        let correctMatches = 0;
        let incorrectInfo = 0;
        let partialMatches = 0;
        
        // Wikidataの各場所について確認
        for (const wikidataPlace of wikidataPlaces) {
            let foundExactMatch = false;
            let foundPartialMatch = false;
            
            for (const llmPlace of llmPlaces) {
                if (this.isLocationMatch(wikidataPlace, llmPlace, 'exact')) {
                    correctMatches++;
                    foundExactMatch = true;
                    break;
                } else if (this.isLocationMatch(wikidataPlace, llmPlace, 'partial')) {
                    foundPartialMatch = true;
                }
            }
            
            if (foundExactMatch) {
                // 完全一致は既にカウント済み
            } else if (foundPartialMatch) {
                partialMatches++;
            }
        }
        
        // LLM回答に含まれる間違い情報をペナルティとして計算
        for (const llmPlace of llmPlaces) {
            let hasMatch = false;
            for (const wikidataPlace of wikidataPlaces) {
                if (this.isLocationMatch(wikidataPlace, llmPlace, 'partial')) {
                    hasMatch = true;
                    break;
                }
            }
            if (!hasMatch) {
                incorrectInfo++;
            }
        }
        
        // スコア計算（正確性を重視）
        const totalWikidataPlaces = wikidataPlaces.length;
        const totalLlmPlaces = llmPlaces.length;
        
        if (correctMatches === 0 && partialMatches === 0) {
            return { match: false, type: 'none', confidence: 0, notes: '場所情報が一致しません' };
        }
        
        // 基本スコア: 正確な一致の割合
        let baseScore = correctMatches / totalWikidataPlaces;
        
        // 部分一致のボーナス
        const partialBonus = (partialMatches / totalWikidataPlaces) * 0.5;
        
        // 間違い情報のペナルティ（重要）
        const incorrectPenalty = (incorrectInfo / totalLlmPlaces) * 0.4;
        
        // 最終スコア
        let finalScore = Math.max(0, baseScore + partialBonus - incorrectPenalty);
        
        // 結果の分類
        let matchType, notes;
        if (finalScore >= 0.9) {
            matchType = 'exact';
            notes = `高精度一致: 正解${correctMatches}/${totalWikidataPlaces}, 間違い${incorrectInfo}`;
        } else if (finalScore >= 0.6) {
            matchType = 'partial';
            notes = `部分一致: 正解${correctMatches}/${totalWikidataPlaces}, 部分${partialMatches}, 間違い${incorrectInfo}`;
        } else if (finalScore > 0) {
            matchType = 'partial';  
            notes = `低精度一致: 正解${correctMatches}/${totalWikidataPlaces}, 間違い情報${incorrectInfo}により信頼度低下`;
        } else {
            matchType = 'none';
            notes = `不一致: 間違い情報${incorrectInfo}`;
        }
        
        return { 
            match: finalScore > 0, 
            type: matchType, 
            confidence: finalScore, 
            notes: notes 
        };
    }
    
    // 場所名抽出
    extractPlaceNames(text) {
        if (!text || typeof text !== 'string') return [];
        
        const places = new Set();
        
        // 日本の地名パターン
        const placePatterns = [
            // 都道府県
            /([一-龯]{2,4}[都道府県])/g,
            // 市区町村
            /([一-龯]{2,6}[市区町村])/g,
            // キャンパス名
            /([一-龯ひらがなカタカナ]{2,8}キャンパス)/g,
            // 大学名
            /([一-龯ひらがなカタカナ]{3,10}大学)/g,
            // 地域名（◯◯地区、◯◯エリアなど）
            /([一-龯]{2,8}[地区エリア])/g
        ];
        
        for (const pattern of placePatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                if (match[1]) {
                    places.add(match[1].trim());
                }
            }
        }
        
        // 固有の地名も抽出（市町村レベル）
        const commonPlaces = ['寝屋川', '四条畷', '枚方', '大阪', '東京', '京都', '神戸', '横浜'];
        for (const place of commonPlaces) {
            if (text.includes(place)) {
                places.add(place);
            }
        }
        
        return Array.from(places);
    }
    
    // 場所マッチング判定
    isLocationMatch(place1, place2, matchType = 'partial') {
        const p1 = place1.toLowerCase();
        const p2 = place2.toLowerCase();
        
        if (matchType === 'exact') {
            return p1 === p2;
        }
        
        // 部分マッチング
        // キャンパス名の比較
        if (p1.includes('キャンパス') && p2.includes('キャンパス')) {
            const base1 = p1.replace('キャンパス', '');
            const base2 = p2.replace('キャンパス', '');
            return base1 === base2;
        }
        
        // 都市名の比較
        if (p1.includes('市') && p2.includes('市')) {
            const base1 = p1.replace('市', '');
            const base2 = p2.replace('市', '');
            return base1 === base2;
        }
        
        // 基本的な包含関係
        return p1.includes(p2) || p2.includes(p1);
    }
    
    // テキスト類似性評価（フォールバック）
    evaluateTextSimilarity(str1, str2) {
        const s1 = str1.toLowerCase();
        const s2 = str2.toLowerCase();
        
        if (s1 === s2 || s2.includes(s1)) {
            return { match: true, type: 'exact', confidence: 1.0, notes: '完全一致' };
        } else if (s1.includes(s2) || this.partialMatch(s1, s2)) {
            return { match: true, type: 'partial', confidence: 0.7, notes: '部分一致' };
        } else {
            return { match: false, type: 'none', confidence: 0, notes: '不一致' };
        }
    }
    
    // Wikidata エンティティIDをラベルに解決
    async resolveEntityLabel(entityId) {
        try {
            const response = await fetch(
                `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&languages=ja|en&format=json&origin=*`
            );
            const data = await response.json();
            
            if (data.entities && data.entities[entityId]) {
                const entity = data.entities[entityId];
                
                // 日本語ラベルを優先、なければ英語、最後にIDを返す
                if (entity.labels) {
                    if (entity.labels.ja) {
                        return entity.labels.ja.value;
                    } else if (entity.labels.en) {
                        return entity.labels.en.value;
                    }
                }
                
                // ラベルがない場合はIDを返す
                return entityId;
            }
            
            return entityId;
        } catch (error) {
            console.warn(`エンティティラベル解決エラー (${entityId}):`, error);
            return entityId;
        }
    }
    
    // 階層的な位置情報を取得（都道府県,市区町村形式）
    async resolveLocationHierarchy(entityId) {
        try {
            console.log('🗺️ 階層的位置情報取得開始:', entityId);
            
            const response = await fetch(
                `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&languages=ja|en&format=json&origin=*`
            );
            const data = await response.json();
            
            if (!data.entities || !data.entities[entityId]) {
                return await this.resolveEntityLabel(entityId);
            }
            
            const entity = data.entities[entityId];
            const locationHierarchy = [];
            
            // 現在のエンティティのラベルを取得
            const currentLabel = entity.labels?.ja?.value || entity.labels?.en?.value || entityId;
            
            // P131（所在地）を辿って上位の行政区分を取得
            if (entity.claims && entity.claims.P131 && entity.claims.P131[0]) {
                const parentLocationId = entity.claims.P131[0].mainsnak?.datavalue?.value?.id;
                if (parentLocationId) {
                    const parentHierarchy = await this.resolveLocationHierarchy(parentLocationId);
                    if (typeof parentHierarchy === 'string') {
                        locationHierarchy.push(parentHierarchy);
                    } else if (Array.isArray(parentHierarchy)) {
                        locationHierarchy.push(...parentHierarchy);
                    }
                }
            }
            
            // 現在のエンティティを階層に追加（市区町村レベルのみ）
            if (this.isCityLevel(currentLabel)) {
                locationHierarchy.push(currentLabel);
            }
            
            // 都道府県,市区町村の形式で返す
            console.log('🔍 階層解析中:', { locationHierarchy, currentLabel });
            const prefecture = locationHierarchy.find(item => /[都道府県]$/.test(item));
            const city = locationHierarchy.find(item => /[市区町村]$/.test(item));
            
            console.log('🏛️ 抽出結果:', { prefecture, city });
            
            if (prefecture && city) {
                const result = `${prefecture},${city}`;
                console.log('✅ 階層的位置情報取得成功:', result);
                return result;
            } else if (city) {
                console.log('✅ 市区町村のみ取得:', city);
                return city;
            } else if (prefecture) {
                console.log('✅ 都道府県のみ取得:', prefecture);
                return prefecture;
            }
            
            console.log('⚠️ 階層取得失敗、元ラベル返却:', currentLabel);
            return currentLabel;
            
        } catch (error) {
            console.warn(`階層的位置情報取得エラー (${entityId}):`, error);
            return await this.resolveEntityLabel(entityId);
        }
    }
    
    // 市区町村レベルかどうかを判定
    isCityLevel(label) {
        return /[市区町村]$/.test(label) || 
               /区$/.test(label) || 
               /町$/.test(label) || 
               /村$/.test(label);
    }
    
    clearSelectedEntity() {
        this.selectedEntity = null;
        document.getElementById('selected-entity').style.display = 'none';
        document.getElementById('attribute-select').innerHTML = '<option value="">属性を選択してください</option>';
    }
    
    async updateAttributeOptions() {
        const attributeSelect = document.getElementById('attribute-select');
        console.log('🎯 DOM要素取得:', attributeSelect);
        
        if (!attributeSelect) {
            console.error('❌ attribute-select 要素が見つかりません！');
            return;
        }
        
        // 読み込み中表示
        attributeSelect.innerHTML = '<option value="" disabled>🔄 利用可能な属性を取得中...</option>';
        attributeSelect.style.color = '#6c757d';
        attributeSelect.style.fontStyle = 'italic';
        console.log('🔄 select要素初期化完了');
        
        if (!this.selectedEntity) {
            console.warn('⚠️ selectedEntity が存在しません');
            attributeSelect.innerHTML = '<option value="">属性を選択してください</option>';
            attributeSelect.style.color = '';
            attributeSelect.style.fontStyle = '';
            return;
        }

        console.log('📊 動的属性取得開始:', this.selectedEntity.id);
        console.log('📋 エンティティデータ:', this.selectedEntity);
        
        // 進捗表示更新
        attributeSelect.innerHTML = '<option value="" disabled>📊 エンティティデータを分析中...</option>';
        
        // 選択されたエンティティから実際に利用可能な属性を動的取得
        const availableAttributes = await this.getAvailableAttributesFromEntity();
        console.log('✅ 利用可能属性数:', availableAttributes.length);
        console.log('📝 利用可能属性詳細:', availableAttributes);
        
        // 最終進捗表示
        attributeSelect.innerHTML = '<option value="" disabled>✨ 属性リスト生成中...</option>';
        
        // 利用可能な属性を表示（実際にデータがある）
        if (availableAttributes.length > 0) {
            console.log('✅ 属性オプション追加開始');
            console.log('🎯 追加前のselectHTML:', attributeSelect.innerHTML);
            console.log('🎯 select要素:', attributeSelect);
            
            // 最初のオプションをクリア
            attributeSelect.innerHTML = '<option value="">属性を選択してください</option>';
            
            availableAttributes.forEach((attrInfo, index) => {
                const option = document.createElement('option');
                option.value = attrInfo.key;
                option.textContent = `${attrInfo.label} ✓`;
                option.style.color = '#28a745';
                option.style.fontWeight = '500';
                option.title = `プロパティID: ${attrInfo.propertyId}`;
                
                console.log(`🔧 option作成 ${index + 1}:`, {
                    value: option.value,
                    textContent: option.textContent,
                    key: attrInfo.key,
                    label: attrInfo.label,
                    propertyId: attrInfo.propertyId
                });
                
                attributeSelect.appendChild(option);
                console.log(`✓ 属性追加完了 ${index + 1}: ${attrInfo.label} (${attrInfo.propertyId})`);
            });
            
            // 完了後のスタイルリセット
            attributeSelect.style.color = '';
            attributeSelect.style.fontStyle = '';
            
            console.log('🎯 追加後のselectHTML:', attributeSelect.innerHTML);
            console.log('🎯 select子要素数:', attributeSelect.children.length);
            console.log('✅ 属性オプション追加完了');
        } else {
            console.warn('⚠️ 利用可能な属性が見つかりませんでした');
            // データが取得できない場合のフォールバック
            attributeSelect.innerHTML = '<option value="" disabled style="color: #dc3545; font-style: italic;">利用可能な属性が見つかりません</option>';
            attributeSelect.style.color = '';
            attributeSelect.style.fontStyle = '';
            attributeSelect.appendChild(fallbackOption);
        }
    }
    
    // 選択されたエンティティから実際に利用可能な属性を動的取得
    async getAvailableAttributesFromEntity() {
        if (!this.selectedEntity) {
            console.warn('❌ selectedEntity が存在しません');
            return [];
        }
        
        if (!this.selectedEntity.claims) {
            console.warn('❌ selectedEntity.claims が存在しません');
            console.log('📋 selectedEntity構造:', this.selectedEntity);
            return [];
        }
        
        const claimCount = Object.keys(this.selectedEntity.claims).length;
        console.log(`🔍 Claims分析開始: ${claimCount}個のクレームを発見`);
        console.log('📋 Claims詳細:', this.selectedEntity.claims);
        
        const availableAttributes = [];
        
        // プロパティIDから内部キーへのマッピング（逆引き用）
        const propertyToKeyMap = {};
        for (const [key, propertyId] of Object.entries(this.getPropertyMapping())) {
            propertyToKeyMap[propertyId] = key;
        }
        console.log('🔗 プロパティマッピング数:', Object.keys(propertyToKeyMap).length);
        
        // 進捗表示用の参照を取得
        const attributeSelect = document.getElementById('attribute-select');
        
        // Claimsを解析して利用可能な属性を特定
        let processedCount = 0;
        for (const [propertyId, claims] of Object.entries(this.selectedEntity.claims)) {
            processedCount++;
            console.log(`🔍 処理中 ${processedCount}/${claimCount}: ${propertyId}`, claims);
            
            // 進捗をリアルタイム表示
            if (attributeSelect) {
                const progress = Math.round((processedCount / claimCount) * 100);
                attributeSelect.innerHTML = `<option value="" disabled>🔍 属性分析中... ${processedCount}/${claimCount} (${progress}%)</option>`;
            }
            
            // instance_ofは除外
            if (propertyId === 'P31') {
                console.log(`⏭️ スキップ: ${propertyId} (instance_of)`);
                continue;
            }
            
            // データが実際に存在するかチェック
            const hasValidData = claims && claims.length > 0 && claims[0].mainsnak && claims[0].mainsnak.datavalue;
            console.log(`📊 データ検証 ${propertyId}:`, {
                claimsExists: !!claims,
                claimsLength: claims ? claims.length : 0,
                hasMainsnak: claims && claims[0] && !!claims[0].mainsnak,
                hasDatavalue: claims && claims[0] && claims[0].mainsnak && !!claims[0].mainsnak.datavalue,
                hasValidData
            });
            
            if (hasValidData) {
                const internalKey = propertyToKeyMap[propertyId];
                console.log(`🔍 マッピング確認 ${propertyId} → ${internalKey}`);
                
                if (internalKey && this.attributeLabels[internalKey]) {
                    availableAttributes.push({
                        propertyId: propertyId,
                        key: internalKey,
                        label: this.attributeLabels[internalKey],
                        hasData: true
                    });
                    console.log(`✅ 既知属性追加: ${propertyId} → ${internalKey} (${this.attributeLabels[internalKey]})`);
                } else {
                    console.log(`🔍 未知プロパティのラベル取得開始: ${propertyId}`);
                    
                    // 進捗表示を更新
                    if (attributeSelect) {
                        attributeSelect.innerHTML = `<option value="" disabled>🌐 未知プロパティ解決中... ${propertyId}</option>`;
                    }
                    
                    // 未知のプロパティの場合、プロパティラベルを取得して追加
                    const propertyLabel = await this.resolvePropertyLabel(propertyId);
                    if (propertyLabel) {
                        availableAttributes.push({
                            propertyId: propertyId,
                            key: propertyId, // 未知の場合はプロパティIDをキーとして使用
                            label: propertyLabel,
                            hasData: true
                        });
                        console.log(`✅ 未知プロパティ追加: ${propertyId} → ${propertyLabel}`);
                    } else {
                        console.log(`❌ プロパティラベル取得失敗: ${propertyId}`);
                    }
                }
            } else {
                console.log(`⏭️ データなしでスキップ: ${propertyId}`);
            }
        }
        
        // 利用可能な属性をラベル順でソート
        availableAttributes.sort((a, b) => a.label.localeCompare(b.label, 'ja'));
        
        console.log('🎯 フィルタリング前属性数:', availableAttributes.length);
        
        // スマートフィルタリングを適用
        const smartFilteredAttributes = this.getSmartFilteredAttributes(availableAttributes);
        
        console.log('✨ スマートフィルタリング後属性数:', smartFilteredAttributes.length);
        return smartFilteredAttributes;
    }
    
    // プロパティIDマッピングを取得
    getPropertyMapping() {
        return {
            // 基本情報
            'inception': 'P571',
            'birth_date': 'P569',
            'death_date': 'P570',
            'location': 'P131',
            'country': 'P17',
            'official_website': 'P856',
            
            // 地理・物理
            'elevation': 'P2044',
            'length': 'P2043',
            'area': 'P2046',
            'population': 'P1082',
            'coordinate': 'P625',
            
            // 人物
            'occupation': 'P106',
            'nationality': 'P27',
            'educated_at': 'P69',
            'work_location': 'P937',
            'notable_work': 'P800',
            
            // 組織
            'founded_by': 'P112',
            'headquarters': 'P159',
            'industry': 'P452',
            'employees': 'P1128',
            'revenue': 'P2139',
            
            // 作品・メディア
            'director': 'P57',
            'author': 'P50',
            'composer': 'P86',
            'performer': 'P161',
            'genre': 'P136',
            'publication_date': 'P577',
            'duration': 'P2047',
            'language': 'P407',
            
            // 教育
            'student_count': 'P2196',
            'faculty_count': 'P1128',
            
            // 技術
            'manufacturer': 'P176',
            'model': 'P1324',
            'operating_system': 'P306',
            'programming_language': 'P277'
        };
    }
    
    // プロパティIDから日本語ラベルを取得
    async resolvePropertyLabel(propertyId) {
        try {
            const response = await fetch(
                `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${propertyId}&languages=ja|en&format=json&origin=*`
            );
            const data = await response.json();
            
            if (data.entities && data.entities[propertyId]) {
                const entity = data.entities[propertyId];
                
                // 日本語ラベルを優先、なければ英語
                if (entity.labels) {
                    if (entity.labels.ja) {
                        return entity.labels.ja.value;
                    } else if (entity.labels.en) {
                        return entity.labels.en.value;
                    }
                }
            }
            
            return null;
        } catch (error) {
            console.warn(`プロパティラベル取得エラー (${propertyId}):`, error);
            return null;
        }
    }
    
    // スマート属性フィルタリングシステム
    getSmartFilteredAttributes(availableAttributes) {
        console.log('🧠 スマート属性フィルタリング開始');
        console.log('📊 入力属性数:', availableAttributes.length);
        
        // 1. ブラックリスト除外
        const nonBlacklistedAttributes = this.excludeBlacklistedAttributes(availableAttributes);
        console.log('🚫 ブラックリスト除外後:', nonBlacklistedAttributes.length);
        
        // 2. エンティティタイプ判定
        const entityTypes = this.determineEntityTypes();
        console.log('🏷️ 判定されたエンティティタイプ:', entityTypes);
        
        // 3. エンティティタイプに応じた関連性フィルタリング
        const relevantAttributes = this.filterByRelevance(nonBlacklistedAttributes, entityTypes);
        console.log('🎯 関連性フィルタ後:', relevantAttributes.length);
        
        // 4. 優先度スコアリングと制限
        const finalAttributes = this.prioritizeAndLimit(relevantAttributes, entityTypes);
        console.log('✨ 最終選択属性:', finalAttributes.length);
        
        return finalAttributes;
    }
    
    // ブラックリスト除外システム
    excludeBlacklistedAttributes(attributes) {
        const blacklistPatterns = [
            // 識別子系
            /.*[iI][dD]$/,                    // 〜ID で終わる
            /.*識別子$/,                      // 識別子で終わる  
            /.*コード$/,                      // コードで終わる
            /.*番号$/,                        // 番号で終わる
            
            // メタデータ系
            /.*カテゴリ$/,                    // カテゴリ系
            /.*ハッシュ$/,                    // ハッシュ系
            /.*キー$/,                        // キー系
            
            // ソーシャルメディア・外部サービス系
            /Facebook|Twitter|Instagram|YouTube|LinkedIn/i,
            /VIAF|CiNii|Freebase|ORCID|ResearchGate|Google Scholar/i,
            /Microsoft Academic|Scopus|Web of Science/i,
            
            // 技術的メタデータ
            /Wikidata|Commons|DBpedia/i,
            /JSON|XML|RDF|URI|URL$/i,
            
            // その他不適切
            /フォロワー数|いいね数|リツイート数/,
            /ハンドル|アカウント|プロフィール/
        ];
        
        return attributes.filter(attr => {
            const isBlacklisted = blacklistPatterns.some(pattern => 
                pattern.test(attr.label) || pattern.test(attr.propertyId)
            );
            
            if (isBlacklisted) {
                console.log(`🚫 ブラックリスト除外: ${attr.label} (${attr.propertyId})`);
            }
            
            return !isBlacklisted;
        });
    }
    
    // エンティティタイプ判定
    determineEntityTypes() {
        if (!this.selectedEntity.claims || !this.selectedEntity.claims.P31) {
            return ['unknown'];
        }
        
        const instanceTypes = [];
        this.selectedEntity.claims.P31.forEach(claim => {
            if (claim.mainsnak && claim.mainsnak.datavalue) {
                const entityId = claim.mainsnak.datavalue.value.id;
                instanceTypes.push(entityId);
            }
        });
        
        console.log('🏷️ 検出されたinstance_of:', instanceTypes);
        
        // エンティティタイプをカテゴリに分類
        const typeCategories = [];
        
        // 教育機関
        const educationTypes = ['Q3918', 'Q875538', 'Q23002039', 'Q1664720', 'Q38723', 'Q875538'];
        if (instanceTypes.some(type => educationTypes.includes(type))) {
            typeCategories.push('education');
        }
        
        // 企業・組織
        const organizationTypes = ['Q4830453', 'Q6881511', 'Q783794', 'Q891723', 'Q1167270'];
        if (instanceTypes.some(type => organizationTypes.includes(type))) {
            typeCategories.push('organization');
        }
        
        // 人物
        if (instanceTypes.includes('Q5')) {
            typeCategories.push('person');
        }
        
        // 地理的場所
        const placeTypes = ['Q2221906', 'Q515', 'Q486972', 'Q1549591', 'Q1637706'];
        if (instanceTypes.some(type => placeTypes.includes(type))) {
            typeCategories.push('place');
        }
        
        // 山
        if (instanceTypes.includes('Q8502')) {
            typeCategories.push('mountain');
        }
        
        // 建物・建造物
        const buildingTypes = ['Q41176', 'Q12518', 'Q811979', 'Q1497375'];
        if (instanceTypes.some(type => buildingTypes.includes(type))) {
            typeCategories.push('building');
        }
        
        // 作品・メディア
        const creativeTypes = ['Q571', 'Q11424', 'Q2431196', 'Q7725634', 'Q386724'];
        if (instanceTypes.some(type => creativeTypes.includes(type))) {
            typeCategories.push('creative');
        }
        
        return typeCategories.length > 0 ? typeCategories : ['general'];
    }
    
    // 関連性に基づく属性フィルタリング
    filterByRelevance(attributes, entityTypes) {
        const relevanceRules = {
            education: {
                high: ['inception', 'location', 'student_count', 'faculty_count', 'official_website', 'country'],
                medium: ['academic_discipline', 'founded_by', 'coordinate', 'area', 'population'],
                low: ['elevation', 'revenue', 'industry']
            },
            
            organization: {
                high: ['inception', 'headquarters', 'industry', 'official_website', 'country'],
                medium: ['founded_by', 'employees', 'revenue', 'location', 'area'],
                low: ['coordinate', 'elevation', 'student_count', 'academic_discipline']
            },
            
            person: {
                high: ['birth_date', 'death_date', 'occupation', 'nationality', 'country'],
                medium: ['educated_at', 'work_location', 'notable_work', 'location'],
                low: ['inception', 'headquarters', 'industry', 'elevation']
            },
            
            place: {
                high: ['location', 'country', 'coordinate', 'elevation', 'area', 'population'],
                medium: ['inception', 'official_website'],
                low: ['industry', 'occupation', 'student_count', 'faculty_count']
            },
            
            mountain: {
                high: ['elevation', 'location', 'country', 'coordinate'],
                medium: ['area', 'inception'],
                low: ['population', 'industry', 'official_website']
            },
            
            building: {
                high: ['inception', 'location', 'country', 'coordinate', 'elevation'],
                medium: ['area', 'official_website', 'founded_by'],
                low: ['population', 'industry', 'student_count']
            },
            
            creative: {
                high: ['inception', 'publication_date', 'author', 'director', 'genre', 'duration'],
                medium: ['language', 'country', 'composer', 'performer'],
                low: ['location', 'elevation', 'area', 'population']
            },
            
            general: {
                high: ['inception', 'location', 'country', 'official_website'],
                medium: ['coordinate', 'area', 'population'],
                low: []
            }
        };
        
        // 各属性に関連性スコアを付与
        const scoredAttributes = attributes.map(attr => {
            let maxScore = 0;
            let bestCategory = 'general';
            
            entityTypes.forEach(entityType => {
                const rules = relevanceRules[entityType] || relevanceRules.general;
                let score = 0;
                
                if (rules.high.includes(attr.key)) score = 3;
                else if (rules.medium.includes(attr.key)) score = 2;
                else if (rules.low.includes(attr.key)) score = 1;
                
                if (score > maxScore) {
                    maxScore = score;
                    bestCategory = entityType;
                }
            });
            
            return {
                ...attr,
                relevanceScore: maxScore,
                bestCategory: bestCategory
            };
        });
        
        // スコア順でソート（高い方が優先）
        return scoredAttributes.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }
    
    // 優先度スコアリングと制限
    prioritizeAndLimit(attributes, entityTypes) {
        // 高関連性属性は最大8個、中関連性は最大4個まで
        const highRelevance = attributes.filter(attr => attr.relevanceScore === 3).slice(0, 8);
        const mediumRelevance = attributes.filter(attr => attr.relevanceScore === 2).slice(0, 4);
        const lowRelevance = attributes.filter(attr => attr.relevanceScore === 1).slice(0, 2);
        
        const result = [...highRelevance, ...mediumRelevance, ...lowRelevance];
        
        console.log('📊 優先度別選択結果:', {
            high: highRelevance.length,
            medium: mediumRelevance.length,
            low: lowRelevance.length,
            total: result.length
        });
        
        return result;
    }

    // エンティティタイプに応じた適切な一般属性を取得
    getFilteredCommonAttributes() {
        const instanceTypes = this.selectedEntity.instanceTypes || [];
        
        // 企業系エンティティの場合
        const isCompany = instanceTypes.some(type => 
            ['Q4830453', 'Q786820', 'Q18388277', 'Q319913', 'Q1137109', 'Q161726', 'Q891723'].includes(type)
        );
        
        // 人物エンティティの場合  
        const isPerson = instanceTypes.includes('Q5');
        
        // 大学エンティティの場合
        const isUniversity = instanceTypes.includes('Q3918');
        
        if (isCompany) {
            // 企業向け一般属性（教員数などを除外）
            return ['inception', 'location', 'official_website', 'industry', 'country'];
        } else if (isPerson) {
            // 人物向け一般属性
            return ['birth_date', 'death_date', 'occupation', 'nationality', 'location'];
        } else if (isUniversity) {
            // 大学向け一般属性
            return ['inception', 'location', 'official_website', 'student_count', 'faculty_count'];
        } else {
            // デフォルト一般属性
            return ['inception', 'location', 'official_website'];
        }
    }
    
    getRecommendedAttributes() {
        if (!this.selectedEntity.instanceTypes) return [];
        
        console.log('🎯 エンティティタイプ分析:', this.selectedEntity.instanceTypes);
        
        // 優先度付きでエンティティタイプを分析
        const prioritizedTypes = this.prioritizeEntityTypes(this.selectedEntity.instanceTypes);
        console.log('📊 優先度付きタイプ:', prioritizedTypes);
        
        let recommendedAttributes = [];
        
        // 優先度の高いタイプから属性を収集
        prioritizedTypes.forEach(instanceType => {
            if (this.entityTypeAttributes[instanceType]) {
                const attrs = this.entityTypeAttributes[instanceType];
                console.log(`🔍 ${instanceType} の推奨属性:`, attrs);
                recommendedAttributes = recommendedAttributes.concat(attrs);
            }
        });
        
        // 重複を除去
        const uniqueAttributes = [...new Set(recommendedAttributes)];
        console.log('✅ 最終推奨属性:', uniqueAttributes);
        return uniqueAttributes;
    }
    
    // エンティティタイプの優先度付け（より具体的なタイプを優先）
    prioritizeEntityTypes(instanceTypes) {
        // 企業関連の優先順位（具体的 → 一般的）
        const priorityOrder = [
            'Q786820',    // 自動車メーカー
            'Q18388277',  // 自動車会社  
            'Q1137109',   // テクノロジー企業
            'Q319913',    // 製造業
            'Q891723',    // 上場企業
            'Q161726',    // 多国籍企業
            'Q4830453',   // 企業（一般）
            'Q3918',      // 大学
            'Q5',         // 人物
            'Q515',       // 都市
            'Q6256',      // 国
            'Q8502',      // 山
            'Q4022',      // 川
            'Q11424',     // 映画
            'Q571',       // 本
            'Q2188189',   // 音楽作品
            'Q7397'       // ソフトウェア
        ];
        
        // 優先順位に従ってソート
        return instanceTypes.sort((a, b) => {
            const indexA = priorityOrder.indexOf(a);
            const indexB = priorityOrder.indexOf(b);
            
            // 優先リストにない場合は最後尾
            const scoreA = indexA === -1 ? 1000 : indexA;
            const scoreB = indexB === -1 ? 1000 : indexB;
            
            return scoreA - scoreB;
        });
    }
    
    // 使用量チェック
    checkUsageLimits() {
        this.updateUsageTracking();
        
        // リミット開放がアクティブな場合はチェックをスキップ
        if (this.usage.dailyLimitOverride && this.usage.hourlyLimitOverride) {
            return; // 制限なし
        }
        
        if (!this.usage.dailyLimitOverride && this.usage.daily >= this.settings.dailyLimit) {
            throw new Error(`1日の使用上限（${this.settings.dailyLimit}回）に達しました。\n「制限開放」ボタンで一時的に制限を解除できます。`);
        }
        
        if (!this.usage.hourlyLimitOverride && this.usage.hourly >= this.settings.hourlyLimit) {
            throw new Error(`1時間の使用上限（${this.settings.hourlyLimit}回）に達しました。\n「制限開放」ボタンで一時的に制限を解除できます。`);
        }
    }
    
    updateUsageTracking() {
        const today = new Date().toDateString();
        const currentHour = new Date().getHours();
        
        // 日付が変わった場合リセット
        if (this.usage.lastDayReset !== today) {
            this.usage.daily = 0;
            this.usage.lastDayReset = today;
        }
        
        // 時間が変わった場合リセット
        if (this.usage.lastHourReset !== currentHour) {
            this.usage.hourly = 0;
            this.usage.lastHourReset = currentHour;
        }
    }
    
    updateUsageCount() {
        this.usage.daily++;
        this.usage.hourly++;
        
        // 累計カウントも更新
        this.usage.totalApiCalls++;
        this.usage.totalDailyCalls++;
        this.usage.totalHourlyCalls++;
        
        this.saveUsage();
        this.updateUsageDisplay();
    }
    
    updateUsageDisplay() {
        // 基本使用量
        document.getElementById('daily-usage').textContent = this.usage.daily;
        document.getElementById('hourly-usage').textContent = this.usage.hourly;
        document.getElementById('estimated-cost').textContent = `$${this.usage.totalCost.toFixed(4)}`;
        
        // 累計使用量表示
        const totalUsageEl = document.getElementById('total-usage');
        if (totalUsageEl) {
            totalUsageEl.textContent = this.usage.totalApiCalls;
        }
        
        // リミット状態表示
        const limitStatusEl = document.getElementById('limit-status');
        if (limitStatusEl) {
            if (this.usage.dailyLimitOverride || this.usage.hourlyLimitOverride) {
                limitStatusEl.textContent = '制限開放中';
                limitStatusEl.className = 'limit-status override';
                limitStatusEl.style.color = '#ff9800';
            } else {
                limitStatusEl.textContent = '制限有効';
                limitStatusEl.className = 'limit-status active';
                limitStatusEl.style.color = '#4caf50';
            }
        }
        
        // 上限に近い場合は警告色（制限が有効な場合のみ）
        const dailyUsageEl = document.getElementById('daily-usage');
        const hourlyUsageEl = document.getElementById('hourly-usage');
        
        if (!this.usage.dailyLimitOverride && this.usage.daily >= this.settings.dailyLimit * 0.8) {
            dailyUsageEl.style.color = '#d32f2f';
        } else {
            dailyUsageEl.style.color = '#007bff';
        }
        
        if (this.usage.hourly >= this.settings.hourlyLimit * 0.8) {
            hourlyUsageEl.style.color = '#d32f2f';
        } else {
            hourlyUsageEl.style.color = '#007bff';
        }
    }
    
    // OpenAI API接続テスト
    async testApiKey() {
        const apiKey = document.getElementById('openai-api-key').value.trim();
        const statusDiv = document.getElementById('api-status');
        
        if (!apiKey) {
            statusDiv.textContent = 'APIキーを入力してください';
            statusDiv.className = 'api-status error';
            return;
        }
        
        // APIキー形式の基本検証
        const apiKeyValidation = this.validateApiKey(apiKey);
        if (!apiKeyValidation.valid) {
            statusDiv.textContent = `✗ APIキーエラー: ${apiKeyValidation.message}`;
            statusDiv.className = 'api-status error';
            return;
        }
        
        statusDiv.textContent = '接続テスト中...';
        statusDiv.className = 'api-status testing';
        
        try {
            // ヘッダー値のサニタイズ
            const sanitizedApiKey = this.sanitizeHeaderValue(apiKey);
            
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': `Bearer ${sanitizedApiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                statusDiv.textContent = '✓ 接続成功 - APIキーが有効です';
                statusDiv.className = 'api-status success';
                this.settings.openaiApiKey = apiKey;
            } else {
                const error = await response.json();
                statusDiv.textContent = `✗ 接続失敗: ${error.error?.message || 'APIキーが無効です'}`;
                statusDiv.className = 'api-status error';
            }
        } catch (error) {
            statusDiv.textContent = `✗ 接続エラー: ${error.message}`;
            statusDiv.className = 'api-status error';
        }
    }
    
    // ファクトチェック実行
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
            // 使用量チェック
            this.checkUsageLimits();
            
            // 確認ダイアログ
            if (this.settings.confirmBeforeApi) {
                const modelCost = this.apiCosts[this.settings.llmModel];
                const estimatedCost = (modelCost.input + modelCost.output) * 0.5; // 概算
                
                if (!confirm(`OpenAI APIを実行します。\n\nモデル: ${this.settings.llmModel}\n推定コスト: $${estimatedCost.toFixed(4)}\n残り使用回数: ${this.settings.dailyLimit - this.usage.daily}回\n\n実行しますか？`)) {
                    return;
                }
            }
            
            const executeBtn = document.getElementById('execute-btn');
            const originalText = executeBtn.textContent;
            executeBtn.innerHTML = '<span class="loading"></span> API実行中...';
            executeBtn.disabled = true;
            
            const result = await this.performFactCheck(this.selectedEntity, attribute, pattern);
            this.displayResults(result);
            await this.saveResult(result);
            
            // 使用量更新
            this.updateUsageCount();
            
            this.showNotification('ファクトチェックが完了しました', 'success');
            
        } catch (error) {
            console.error('ファクトチェックエラー:', error);
            this.showNotification(`エラー: ${error.message}`, 'error');
        } finally {
            const executeBtn = document.getElementById('execute-btn');
            executeBtn.textContent = '実行';
            executeBtn.disabled = false;
        }
    }
    
    async performFactCheck(entity, attribute, pattern) {
        const prompt = this.generatePrompt(entity.label, this.attributeLabels[attribute], pattern, attribute);
        const wikidataAnswer = entity.extractedData?.[attribute] || '不明';
        
        // OpenAI API呼び出し
        const llmAnswer = await this.callOpenAIAPI(prompt);
        
        console.log('🔍 ファクトチェック実行 - Wikidata:', wikidataAnswer, 'LLM:', llmAnswer, 'Attribute:', attribute);
        const evaluationResult = this.evaluateAnswers(wikidataAnswer, llmAnswer, attribute);
        
        console.log('📊 評価結果:', evaluationResult);
        
        return {
            id: `result_${Date.now()}`,
            entity_id: entity.id,
            entity_name: entity.label,
            fact_type: attribute,
            prompt_pattern: pattern,
            generated_prompt: prompt,
            wikidata_answer: String(wikidataAnswer),
            llm_answer: llmAnswer,
            llm_model: this.settings.llmModel,
            evaluation: evaluationResult,  // 新しい評価システムの結果全体
            match_result: evaluationResult.score > 0,
            match_type: evaluationResult.status === '完全一致' ? 'exact' : 
                        evaluationResult.status.includes('一致') ? 'partial' : 'none',
            confidence_score: evaluationResult.confidence / 100,
            execution_time: Date.now() - parseInt(this.id?.split('_')[1] || Date.now()),
            notes: evaluationResult.details
        };
    }
    
    async callOpenAIAPI(prompt) {
        try {
            console.log('OpenAI API呼び出し開始');
            console.log('プロンプト:', prompt);
            console.log('設定モデル:', this.settings.llmModel);
            
            // GPT-5の可用性チェック（実験的）
            let modelToUse = this.settings.llmModel;
            if (this.settings.llmModel === 'gpt-5') {
                console.warn('⚠️ GPT-5は実験的モデルです。利用できない場合はGPT-4oにフォールバックします。');
                // GPT-5は現在利用不可のため、自動的にGPT-4oに変更
                modelToUse = 'gpt-4o';
                console.log('🔄 モデルをGPT-4oに自動変更しました');
            }
            
            // APIキーのサニタイズ
            const sanitizedApiKey = this.sanitizeHeaderValue(this.settings.openaiApiKey);
            
            // モデル別のパラメータ構成
            const requestBody = {
                model: modelToUse,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            };

            // 新しいAPIではmax_completion_tokensを使用
            requestBody.max_completion_tokens = 150;

            // モデル検証とフォールバック（既に上で処理済み）
            const validModels = ['gpt-3.5-turbo', 'gpt-4o-mini', 'gpt-4o', 'gpt-4'];
            if (modelToUse === 'gpt-5') {
                console.warn('⚠️ GPT-5は現在利用できません。GPT-4oにフォールバックします。');
                requestBody.model = 'gpt-4o';
            } else if (!validModels.includes(modelToUse)) {
                console.warn(`⚠️ 無効なモデル: ${modelToUse}. GPT-4o-miniにフォールバックします。`);
                requestBody.model = 'gpt-4o-mini';
            }
            
            console.log(`使用モデル: ${requestBody.model}`);
            
            // モデル別のtemperature設定
            // GPT-4o, GPT-4o-mini: temperatureデフォルト値(1)のみサポート
            // GPT-3.5-turbo, GPT-4: カスタムtemperature値サポート
            if (requestBody.model.includes('gpt-4o')) {
                // temperatureパラメータを省略してデフォルト値(1)を使用
                console.log(`モデル ${requestBody.model} はtemperatureデフォルト値を使用します`);
            } else {
                // 従来のモデルはカスタムtemperature値を設定
                requestBody.temperature = 0.1;
                console.log(`モデル ${requestBody.model} はtemperature=0.1を使用します`);
            }

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sanitizedApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || `API Error: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('OpenAI API レスポンス:', data);
            console.log(`使用モデル: ${requestBody.model}`);
            
            // レスポンスの構造を確認
            if (!data.choices || !data.choices[0]) {
                console.error('無効なレスポンス構造:', data);
                console.error('リクエスト内容:', JSON.stringify(requestBody, null, 2));
                throw new Error('APIレスポンスが無効です');
            }
            
            const choice = data.choices[0];
            const message = choice.message;
            
            console.log('Choice詳細:', choice);
            console.log('Message詳細:', message);
            
            // GPT-5やその他のモデルで回答が空の場合の対処
            if (!message || message.content === null || message.content === undefined) {
                console.error('メッセージ内容が空またはnull:', message);
                console.error('完全なレスポンス:', JSON.stringify(data, null, 2));
                
                // finish_reasonを確認
                if (choice.finish_reason) {
                    console.log('終了理由:', choice.finish_reason);
                }
                
                return "申し訳ございませんが、選択されたモデルから有効な回答を取得できませんでした。別のモデル（GPT-4o-miniなど）をお試しください。";
            }
            
            // 空文字列の場合も対処
            if (message.content.trim() === "") {
                console.warn('空の回答が返されました');
                return "モデルから空の回答が返されました。質問を変更するか、別のモデルをお試しください。";
            }
            
            console.log('GPT回答内容:', message.content);
            
            // コスト計算
            if (data.usage) {
                const costs = this.apiCosts[this.settings.llmModel];
                if (costs) {
                    const cost = (data.usage.prompt_tokens * costs.input + data.usage.completion_tokens * costs.output) / 1000;
                    this.usage.totalCost += cost;
                    console.log('API使用量:', data.usage, 'コスト:', cost);
                }
            }
            
            return message.content.trim();
            
        } catch (error) {
            console.error('OpenAI API エラー:', error);
            
            // GPT-5が利用できない場合のフォールバック
            if (this.settings.llmModel === 'gpt-5' && 
                (error.message.includes('model') || error.message.includes('invalid') || error.message.includes('not found'))) {
                
                console.warn('GPT-5が利用できません。GPT-4oにフォールバックして再試行します。');
                
                // 一時的にモデルを変更してリトライ
                const originalModel = this.settings.llmModel;
                this.settings.llmModel = 'gpt-4o';
                
                try {
                    const result = await this.callOpenAIAPI(prompt);
                    this.settings.llmModel = originalModel; // 元に戻す
                    
                    // ユーザーに通知
                    this.showNotification('GPT-5が利用できないため、GPT-4oで実行しました', 'warning');
                    return result;
                } catch (fallbackError) {
                    this.settings.llmModel = originalModel; // 元に戻す
                    console.error('フォールバックも失敗:', fallbackError);
                }
            }
            
            // パラメータエラーの詳細情報を提供
            if (error.message.includes('max_tokens')) {
                throw new Error('API呼び出し失敗: パラメータエラー - 最新のAPIパラメータ形式に更新されました。ページを再読み込みしてください。');
            }
            
            if (error.message.includes('temperature')) {
                throw new Error('API呼び出し失敗: このモデルはtemperatureパラメータのカスタム値をサポートしていません。デフォルト値が使用されます。');
            }
            
            throw new Error(`API呼び出し失敗: ${error.message}`);
        }
    }
    
    generatePrompt(entityName, attributeLabel, pattern, attribute) {
        const template = this.promptPatterns[pattern];
        let basePrompt = template
            .replace('{entity}', entityName)
            .replace('{attribute}', attributeLabel);
        
        // 高橋さんの研究に基づく属性別フォーマット指定
        const formatInstruction = this.getAttributeFormatInstruction(attribute);
        if (formatInstruction) {
            basePrompt += ' ' + formatInstruction;
        }
        
        console.log('🎯 生成されたプロンプト:', basePrompt);
        return basePrompt;
    }
    
    // 属性別のフォーマット指定を取得（高橋さんの研究手法）
    getAttributeFormatInstruction(attribute) {
        switch(attribute) {
            case 'location':
            case '所在地':
            case 'headquarters':
            case '本社所在地':
                return '回答形式: 都道府県,市区町村（例: 愛知県,豊田市）※必ずカンマ区切りで回答してください';
                
            case 'inception':
            case '設立年':
            case 'establishment_year':
                return '回答形式: 年のみの数字（例: 1937）';
                
            case 'website':
            case 'official_website':
            case 'ウェブサイト':
                return '回答形式: URLのみ（例: https://toyota.jp）';
                
            case 'elevation':
            case '標高':
                return '回答形式: 数値のみメートル単位（例: 776）';
                
            default:
                return null;
        }
    }
    
    evaluateAnswer(wikidataAnswer, llmAnswer, attribute) {
        if (!wikidataAnswer || wikidataAnswer === '不明' || !llmAnswer) {
            return { match: false, type: 'none', confidence: 0, notes: 'データが不完全です' };
        }
        
        const wikidataStr = String(wikidataAnswer).toLowerCase().trim();
        const llmStr = String(llmAnswer).toLowerCase().trim();
        
        // URL系の特別評価
        if (attribute === 'official_website' || attribute === 'website') {
            return this.evaluateURL(wikidataStr, llmStr);
        }
        
        // 人物名・固有名詞の特別評価
        if (attribute === 'director' || attribute === 'author' || attribute === 'composer' || 
            attribute === 'performer' || attribute === 'founded_by') {
            return this.evaluatePersonName(wikidataAnswer, llmAnswer);
        }
        
        // 場所・地理情報の特別評価
        if (attribute === 'location' || attribute === 'location_pref' || attribute === 'location_city' || 
            attribute === 'headquarters' || attribute === 'work_location') {
            return this.evaluateLocation(wikidataAnswer, llmAnswer);
        }
        
        // 数値系の評価
        if (attribute === 'inception' || attribute === 'elevation' || attribute === 'length') {
            const wikidataNum = this.extractNumber(wikidataStr);
            const llmNum = this.extractNumber(llmStr);
            
            if (wikidataNum && llmNum) {
                const difference = Math.abs(wikidataNum - llmNum);
                const tolerance = wikidataNum * (this.settings.tolerancePercent / 100);
                
                if (difference === 0) {
                    return { match: true, type: 'exact', confidence: 1.0, notes: '完全一致' };
                } else if (difference <= tolerance) {
                    const confidence = 1 - (difference / tolerance) * 0.3;
                    return { match: true, type: 'partial', confidence: confidence, notes: `許容誤差内 (差: ${difference})` };
                } else {
                    return { match: false, type: 'none', confidence: 0, notes: `許容誤差外 (差: ${difference})` };
                }
            }
        }
        
        // 文字列の評価
        if (wikidataStr === llmStr || llmStr.includes(wikidataStr)) {
            return { match: true, type: 'exact', confidence: 1.0, notes: '完全一致' };
        } else if (wikidataStr.includes(llmStr) || this.partialMatch(wikidataStr, llmStr)) {
            return { match: true, type: 'partial', confidence: 0.7, notes: '部分一致' };
        } else {
            return { match: false, type: 'none', confidence: 0, notes: '不一致' };
        }
    }
    
    // 文章からURLを抽出するメソッド
    extractURLsFromText(text) {
        if (!text || typeof text !== 'string') return [];
        
        // 複数のURL抽出パターン
        const urlPatterns = [
            // 標準的なURL（http/https）
            /https?:\/\/[^\s\]）)。、\n]+/gi,
            // ブラケット内のURL [https://example.com]
            /\[https?:\/\/[^\]]+\]/gi,
            // 括弧内のURL (https://example.com)
            /\(https?:\/\/[^)]+\)/gi,
            // 日本語文中のURL（句読点で区切られる）
            /https?:\/\/[^\s、。）\]]+/gi
        ];
        
        const extractedUrls = new Set();
        
        for (const pattern of urlPatterns) {
            const matches = text.match(pattern);
            if (matches) {
                matches.forEach(match => {
                    // ブラケットや括弧を除去
                    let cleanUrl = match.replace(/[\[\]()（）]/g, '');
                    cleanUrl = cleanUrl.replace(/[、。，．]*$/, ''); // 末尾の句読点除去
                    
                    if (cleanUrl.startsWith('http')) {
                        extractedUrls.add(cleanUrl);
                    }
                });
            }
        }
        
        return Array.from(extractedUrls);
    }
    
    evaluateURL(wikidataUrl, llmUrl) {
        // 完全一致チェック
        if (wikidataUrl === llmUrl) {
            return { 
                match: true, 
                type: 'exact', 
                confidence: 1.0, 
                notes: 'URL完全一致' 
            };
        }
        
        // LLM回答からURLを抽出
        const extractedUrls = this.extractURLsFromText(llmUrl);
        
        // 抽出されたURLがない場合、元のテキストをそのまま使用
        if (extractedUrls.length === 0) {
            const analysis = this.analyzeURLs(wikidataUrl, llmUrl);
            return this.processUrlAnalysis(analysis, wikidataUrl, llmUrl);
        }
        
        // 抽出されたURLそれぞれと比較
        let bestMatch = { match: false, type: 'none', confidence: 0, notes: '一致するURLが見つかりませんでした' };
        
        for (const extractedUrl of extractedUrls) {
            // 抽出URLとの完全一致チェック
            if (wikidataUrl === extractedUrl) {
                return {
                    match: true,
                    type: 'exact',
                    confidence: 1.0,
                    notes: `文章中からURL抽出して完全一致: ${extractedUrl}`
                };
            }
            
            // 高度なURL正規化と比較
            const analysis = this.analyzeURLs(wikidataUrl, extractedUrl);
            const result = this.processUrlAnalysis(analysis, wikidataUrl, extractedUrl);
            
            // より良いマッチを保持
            if (result.confidence > bestMatch.confidence) {
                bestMatch = result;
                bestMatch.notes = `文章中からURL抽出: ${extractedUrl} - ${result.notes}`;
            }
        }
        
        return bestMatch;
    }
    
    // URL解析結果を処理するヘルパーメソッド
    processUrlAnalysis(analysis, wikidataUrl, compareUrl) {
        
        // 同一サイト判定
        if (analysis.sameBaseSite) {
            if (analysis.exactMatch) {
                return {
                    match: true,
                    type: 'exact',
                    confidence: 1.0,
                    notes: 'URL完全一致（正規化後）'
                };
            } else if (analysis.minorDifferences) {
                return {
                    match: true,
                    type: 'partial',
                    confidence: 0.95,
                    notes: `同一サイト確認: ${analysis.differences.join(', ')}`
                };
            } else {
                return {
                    match: true,
                    type: 'partial',
                    confidence: 0.85,
                    notes: `同一ドメイン: ${analysis.differences.join(', ')}`
                };
            }
        }
        
        // ドメイン一致のみ
        if (analysis.sameDomain) {
            return {
                match: true,
                type: 'partial',
                confidence: 0.7,
                notes: `ドメイン一致（異なるパス）: ${analysis.differences.join(', ')}`
            };
        }
        
        return { 
            match: false, 
            type: 'none', 
            confidence: 0, 
            notes: `URL不一致: ${analysis.differences.join(', ')}` 
        };
    }
    
    analyzeURLs(url1, url2) {
        try {
            // URL解析
            const parsed1 = this.parseURL(url1);
            const parsed2 = this.parseURL(url2);
            
            if (!parsed1 || !parsed2) {
                return {
                    sameBaseSite: false,
                    sameDomain: false,
                    exactMatch: false,
                    minorDifferences: false,
                    differences: ['URL解析エラー']
                };
            }
            
            const differences = [];
            
            // プロトコル比較（設定を考慮）
            if (parsed1.protocol !== parsed2.protocol) {
                if (!this.settings.urlProtocolFlexible) {
                    differences.push(`プロトコル違い(${parsed1.protocol} vs ${parsed2.protocol})`);
                }
                // 設定で許容する場合は差異として記録しない
            }
            
            // ドメイン比較（www. 正規化）
            const domain1 = parsed1.hostname.replace(/^www\./, '').toLowerCase();
            const domain2 = parsed2.hostname.replace(/^www\./, '').toLowerCase();
            
            if (domain1 !== domain2) {
                return {
                    sameBaseSite: false,
                    sameDomain: false,
                    exactMatch: false,
                    minorDifferences: false,
                    differences: [`異なるドメイン(${domain1} vs ${domain2})`]
                };
            }
            
            // www. プレフィックス比較（設定を考慮）  
            if (parsed1.hostname !== parsed2.hostname) {
                if (!this.settings.urlWwwFlexible) {
                    differences.push('www.プレフィックス違い');
                }
                // 設定で許容する場合は差異として記録しない
            }
            
            // パス正規化と比較
            const path1 = this.normalizePath(parsed1.pathname);
            const path2 = this.normalizePath(parsed2.pathname);
            
            // 同一サイト判定
            const sameBaseSite = this.isSameBaseSite(path1, path2);
            const exactMatch = parsed1.protocol === parsed2.protocol && 
                              parsed1.hostname === parsed2.hostname && 
                              path1 === path2;
            
            if (path1 !== path2) {
                if (sameBaseSite) {
                    differences.push(`パス違い(${path1} vs ${path2}) - 同一サイト`);
                } else {
                    differences.push(`パス違い(${path1} vs ${path2})`);
                }
            }
            
            // クエリパラメータ比較（軽微な違いとして扱う）
            if (parsed1.search !== parsed2.search) {
                differences.push('クエリパラメータ違い');
            }
            
            return {
                sameBaseSite,
                sameDomain: true,
                exactMatch,
                minorDifferences: differences.length <= 2,
                differences
            };
            
        } catch (error) {
            return {
                sameBaseSite: false,
                sameDomain: false,
                exactMatch: false,
                minorDifferences: false,
                differences: ['URL解析エラー']
            };
        }
    }
    
    parseURL(urlString) {
        try {
            // プロトコルが欠けている場合は https:// を追加
            if (!urlString.match(/^https?:\/\//)) {
                urlString = 'https://' + urlString;
            }
            return new URL(urlString);
        } catch {
            return null;
        }
    }
    
    normalizePath(pathname) {
        if (!pathname || pathname === '/') return '/';
        
        // 末尾スラッシュ削除
        let normalized = pathname.replace(/\/+$/, '');
        
        // 空の場合はルートに
        if (normalized === '') normalized = '/';
        
        // 一般的なデフォルトファイル名を削除
        const defaultFiles = ['/index.html', '/index.htm', '/index.php', '/default.html'];
        for (const defaultFile of defaultFiles) {
            if (normalized.endsWith(defaultFile)) {
                normalized = normalized.replace(defaultFile, '') || '/';
                break;
            }
        }
        
        return normalized;
    }
    
    isSameBaseSite(path1, path2) {
        // ルートパス同士は同一サイト
        if ((path1 === '/' || path1 === '') && (path2 === '/' || path2 === '')) {
            return true;
        }
        
        // 一方がルート、もう一方が言語パス（/ja, /en等）の場合は同一サイト
        const langPaths = ['/ja', '/en', '/jp', '/us', '/cn', '/kr'];
        if (path1 === '/' && langPaths.includes(path2)) return true;
        if (path2 === '/' && langPaths.includes(path1)) return true;
        
        // 言語パス同士の比較
        if (langPaths.includes(path1) && langPaths.includes(path2)) return true;
        
        // パスの階層数が少なく、共通の親ディレクトリを持つ場合
        const segments1 = path1.split('/').filter(s => s);
        const segments2 = path2.split('/').filter(s => s);
        
        // どちらかが2階層以下で、共通部分がある場合は同一サイトとみなす
        if (segments1.length <= 2 || segments2.length <= 2) {
            if (segments1.length === 0 || segments2.length === 0) return true;
            // 最初のセグメントが同じ場合（例：/ja と /ja/index.html）
            if (segments1[0] === segments2[0]) return true;
        }
        
        return path1 === path2;
    }
    
    extractDomain(url) {
        try {
            const match = url.match(/^https?:\/\/([^\/]+)/);
            return match ? match[1].replace(/^www\./, '') : null;
        } catch {
            return null;
        }
    }
    
    extractNumber(str) {
        const match = str.match(/\\d+(\\.\\d+)?/);
        return match ? parseFloat(match[0]) : null;
    }
    
    partialMatch(str1, str2) {
        // 簡単な部分一致判定
        const words1 = str1.split(/\\s+|、|。/);
        const words2 = str2.split(/\\s+|、|。/);
        
        return words1.some(word1 => 
            words2.some(word2 => 
                word1.length > 2 && word2.length > 2 && 
                (word1.includes(word2) || word2.includes(word1))
            )
        );
    }
    
    // 結果表示（簡略化）
    displayResults(result) {
        // ChatGPT回答を表示
        this.displayChatGPTResponse(result);
        // 一致確認テーブルを表示
        this.displayMatchResults(result);
        // 評価結果を表示
        this.displayEvaluation(result);
        // 統計セクションを表示
        this.displayStatistics();
    }
    
    displayChatGPTResponse(result) {
        const section = document.getElementById('chatgpt-section');
        const responseDiv = document.getElementById('chatgpt-response');
        
        responseDiv.innerHTML = `
            <div><strong>エンティティ:</strong> ${result.entity_name} (${result.entity_id})</div>
            <div><strong>質問:</strong> ${result.generated_prompt}</div>
            <div><strong>回答:</strong> ${result.llm_answer}</div>
            <div><strong>モデル:</strong> ${result.llm_model}</div>
        `;
        
        section.style.display = 'block';
    }
    
    displayMatchResults(result) {
        const section = document.getElementById('match-section');
        const tbody = document.getElementById('match-table-body');
        
        // 新しい評価システムの結果を使用
        const evaluation = result.evaluation || {};
        const matchIcon = evaluation.match || '×';
        const matchClass = `match-icon ${evaluation.status || 'unknown'}`;
        
        console.log('表示用評価結果:', evaluation);
        
        tbody.innerHTML = `
            <tr>
                <td>${this.attributeLabels[result.fact_type] || result.fact_type}</td>
                <td>${result.wikidata_answer || 'データなし'}</td>
                <td>${result.llm_answer || '回答なし'}</td>
                <td><span class="${matchClass}">${matchIcon}</span></td>
                <td>${evaluation.confidence || 0}%</td>
            </tr>
        `;
        
        section.style.display = 'block';
    }
    
    displayEvaluation(result) {
        const section = document.getElementById('evaluation-section');
        
        const exactRate = result.match_type === 'exact' ? 100 : 0;
        const partialRate = result.match_type === 'partial' ? 100 : 0;
        const totalRate = result.match_result ? 100 : 0;
        
        document.getElementById('accuracy-exact').textContent = `${exactRate.toFixed(1)}%`;
        document.getElementById('accuracy-partial').textContent = `${partialRate.toFixed(1)}%`;
        document.getElementById('accuracy-total').textContent = `${totalRate.toFixed(1)}%`;
        
        section.style.display = 'block';
    }
    
    displayStatistics() {
        const section = document.getElementById('statistics-section');  
        section.style.display = 'block';
        this.createSimpleCharts();
    }
    
    createSimpleCharts() {
        // チャート作成（前回と同じ実装）
        // 省略...
    }
    
    populateDataTable() {
        // 簡略化されたサンプルデータ表示
        const tbody = document.getElementById('data-table-body');
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 20px; color: #666;">
                    エンティティを検索・選択してファクトチェックを実行してください
                </td>
            </tr>
        `;
    }
    
    // データ管理
    async saveResult(result) {
        try {
            // RESTful API に保存を試行
            await fetch('tables/fact_check_results', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result)
            });
            this.results.push(result);
        } catch (error) {
            console.error('API結果保存エラー:', error);
        }
        
        // ローカル履歴に必ず保存
        this.saveToHistory(result);
    }
    
    saveToHistory(result) {
        const historyItem = {
            ...result,
            timestamp: Date.now(),
            id: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        
        this.history.unshift(historyItem); // 最新を先頭に
        
        // 最大1000件まで保持
        if (this.history.length > 1000) {
            this.history = this.history.slice(0, 1000);
        }
        
        // LocalStorageに保存
        try {
            localStorage.setItem('factcheck_history', JSON.stringify(this.history));
        } catch (error) {
            console.error('履歴保存エラー:', error);
            // LocalStorageが満杯の場合、古い履歴を削除
            this.history = this.history.slice(0, 500);
            try {
                localStorage.setItem('factcheck_history', JSON.stringify(this.history));
            } catch (retryError) {
                console.error('履歴保存再試行失敗:', retryError);
            }
        }
        
        this.updateHistoryDisplay();
    }
    
    loadHistory() {
        try {
            const savedHistory = localStorage.getItem('factcheck_history');
            if (savedHistory) {
                this.history = JSON.parse(savedHistory);
            }
        } catch (error) {
            console.error('履歴読み込みエラー:', error);
            this.history = [];
        }
    }
    
    updateHistoryDisplay() {
        // 統計更新
        const totalExecutions = this.history.length;
        const successCount = this.history.filter(item => item.match_result).length;
        const averageAccuracy = totalExecutions > 0 ? (successCount / totalExecutions * 100).toFixed(1) : 0;
        const lastExecution = totalExecutions > 0 ? new Date(this.history[0].timestamp).toLocaleString('ja-JP') : '-';
        
        document.getElementById('total-executions').textContent = totalExecutions;
        document.getElementById('average-accuracy').textContent = `${averageAccuracy}%`;
        document.getElementById('last-execution').textContent = lastExecution;
        
        // テーブル更新
        const tbody = document.getElementById('history-table-body');
        
        if (this.history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #666;">実行履歴がありません</td></tr>';
            return;
        }
        
        // 最新20件を表示
        const recentHistory = this.history.slice(0, 20);
        tbody.innerHTML = recentHistory.map(item => {
            const matchIcon = item.match_type === 'exact' ? '○' : 
                             item.match_type === 'partial' ? '△' : '×';
            const matchClass = `match-icon ${item.match_type}`;
            const timestamp = new Date(item.timestamp).toLocaleString('ja-JP');
            
            return `
                <tr>
                    <td>${timestamp}</td>
                    <td title="${item.entity_id}">${item.entity_name}</td>
                    <td>${this.attributeLabels[item.fact_type] || item.fact_type}</td>
                    <td>${item.prompt_pattern}</td>
                    <td><span class="${matchClass}">${matchIcon}</span></td>
                    <td>${(item.confidence_score * 100).toFixed(1)}%</td>
                    <td>
                        <button class="history-detail-btn" onclick="factCheckSystem.showHistoryDetail('${item.id}')">
                            詳細
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    showHistoryDetail(itemId) {
        const item = this.history.find(h => h.id === itemId);
        if (!item) return;
        
        const modal = document.createElement('div');
        modal.className = 'history-modal';
        modal.style.display = 'flex';
        
        modal.innerHTML = `
            <div class="history-modal-content">
                <span class="history-modal-close">&times;</span>
                <h3>実行詳細</h3>
                <div style="margin-top: 15px;">
                    <p><strong>実行日時:</strong> ${new Date(item.timestamp).toLocaleString('ja-JP')}</p>
                    <p><strong>エンティティ:</strong> ${item.entity_name} (${item.entity_id})</p>
                    <p><strong>属性:</strong> ${this.attributeLabels[item.fact_type] || item.fact_type}</p>
                    <p><strong>プロンプトパターン:</strong> ${item.prompt_pattern}</p>
                    <p><strong>使用モデル:</strong> ${item.llm_model}</p>
                    <hr style="margin: 15px 0;">
                    <p><strong>生成されたプロンプト:</strong></p>
                    <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin: 5px 0;">
                        ${item.generated_prompt}
                    </div>
                    <p><strong>Wikidata回答:</strong> ${item.wikidata_answer}</p>
                    <p><strong>LLM回答:</strong> ${item.llm_answer}</p>
                    <hr style="margin: 15px 0;">
                    <p><strong>判定結果:</strong> ${item.match_type === 'exact' ? '完全一致 (○)' : 
                                                 item.match_type === 'partial' ? '部分一致 (△)' : '不一致 (×)'}</p>
                    <p><strong>信頼度:</strong> ${(item.confidence_score * 100).toFixed(1)}%</p>
                    <p><strong>実行時間:</strong> ${item.execution_time}ms</p>
                    ${item.notes ? `<p><strong>備考:</strong> ${item.notes}</p>` : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 閉じるボタンのイベント
        modal.querySelector('.history-modal-close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // 背景クリックで閉じる
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }
    
    clearHistory() {
        if (confirm(`全ての実行履歴（${this.history.length}件）を削除しますか？\nこの操作は元に戻せません。`)) {
            this.history = [];
            localStorage.removeItem('factcheck_history');
            this.updateHistoryDisplay();
            this.showNotification('実行履歴をクリアしました', 'success');
        }
    }
    
    exportHistory() {
        if (this.history.length === 0) {
            this.showNotification('エクスポートする履歴がありません', 'warning');
            return;
        }
        
        const csv = this.convertHistoryToCSV(this.history);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `fact_check_history_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        
        this.showNotification(`履歴データ（${this.history.length}件）をエクスポートしました`, 'success');
    }
    
    convertHistoryToCSV(data) {
        const headers = [
            '実行日時', 'エンティティID', 'エンティティ名', '属性', 'プロンプトパターン', 
            '使用モデル', '生成プロンプト', 'Wikidata回答', 'LLM回答', 
            '判定結果', '信頼度', '実行時間', '備考'
        ];
        
        const rows = data.map(item => [
            new Date(item.timestamp).toLocaleString('ja-JP'),
            item.entity_id,
            item.entity_name,
            this.attributeLabels[item.fact_type] || item.fact_type,
            item.prompt_pattern,
            item.llm_model,
            item.generated_prompt,
            item.wikidata_answer,
            item.llm_answer,
            item.match_type,
            (item.confidence_score * 100).toFixed(1) + '%',
            item.execution_time + 'ms',
            item.notes || ''
        ]);
        
        return [headers, ...rows].map(row => 
            row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
    }
    
    overrideLimits() {
        if (confirm('利用制限を一時的に開放しますか？\n\n注意: 使用履歴と累計コストは保持されます。')) {
            this.usage.dailyLimitOverride = true;
            this.usage.hourlyLimitOverride = true;
            this.usage.overrideTimestamp = new Date().toISOString();
            
            this.saveUsage();
            this.updateUsageDisplay();
            this.showNotification('利用制限を開放しました（履歴は保持されています）', 'success');
        }
    }
    
    // 制限を再有効化
    restoreLimits() {
        if (confirm('利用制限を再度有効にしますか？')) {
            this.usage.dailyLimitOverride = false;
            this.usage.hourlyLimitOverride = false;
            this.usage.overrideTimestamp = null;
            
            this.saveUsage();
            this.updateUsageDisplay();
            this.showNotification('利用制限を再有効化しました', 'info');
        }
    }
    
    // 使用量リセット（管理者用）
    resetUsage() {
        if (confirm('警告: すべての使用履歴と累計データをリセットしますか？\n\nこの操作は元に戻せません。')) {
            this.usage.daily = 0;
            this.usage.hourly = 0;
            this.usage.totalCost = 0;
            this.usage.totalApiCalls = 0;
            this.usage.totalDailyCalls = 0;
            this.usage.totalHourlyCalls = 0;
            this.usage.dailyLimitOverride = false;
            this.usage.hourlyLimitOverride = false;
            this.usage.overrideTimestamp = null;
            
            this.saveUsage();
            this.updateUsageDisplay();
            this.showNotification('すべての使用履歴をリセットしました', 'warning');
        }
    }
    
    exportResults() {
        if (this.results.length === 0) {
            this.showNotification('エクスポートする結果がありません', 'warning');
            return;
        }
        
        const csv = this.convertToCSV(this.results);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `fact_check_results_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        
        this.showNotification('結果をエクスポートしました', 'success');
    }
    
    convertToCSV(data) {
        const headers = ['実行日時', 'エンティティ', '属性', 'パターン', 'Wikidata回答', 'LLM回答', '判定', '信頼度'];
        const rows = data.map(item => [
            new Date(item.created_at || Date.now()).toLocaleString('ja-JP'),
            item.entity_name,
            this.attributeLabels[item.fact_type],
            item.prompt_pattern,
            item.wikidata_answer,
            item.llm_answer,
            item.match_type,
            (item.confidence_score * 100).toFixed(1) + '%'
        ]);
        
        return [headers, ...rows].map(row => 
            row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
    }
    
    // 設定管理
    loadSettings() {
        const savedSettings = localStorage.getItem('factcheck_settings');
        if (savedSettings) {
            this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
        }
        
        // GPT-5設定の自動修正
        if (this.settings.llmModel === 'gpt-5') {
            console.warn('⚠️ 保存されていたGPT-5設定をGPT-4oに自動変更します');
            this.settings.llmModel = 'gpt-4o';
            this.saveSettings(); // 修正した設定を保存
        }
        
        // UI反映
        document.getElementById('openai-api-key').value = this.settings.openaiApiKey;
        document.getElementById('llm-model').value = this.settings.llmModel;
        document.getElementById('tolerance-percent').value = this.settings.tolerancePercent;
        document.getElementById('daily-limit').value = this.settings.dailyLimit;
        document.getElementById('hourly-limit').value = this.settings.hourlyLimit;
        document.getElementById('strict-matching').checked = this.settings.strictMatching;
        document.getElementById('confirm-before-api').checked = this.settings.confirmBeforeApi;
        document.getElementById('url-protocol-flexible').checked = this.settings.urlProtocolFlexible;
        document.getElementById('url-www-flexible').checked = this.settings.urlWwwFlexible;
    }
    
    saveSettings() {
        this.settings = {
            openaiApiKey: document.getElementById('openai-api-key').value,
            llmModel: document.getElementById('llm-model').value,
            tolerancePercent: parseFloat(document.getElementById('tolerance-percent').value),
            dailyLimit: parseInt(document.getElementById('daily-limit').value),
            hourlyLimit: parseInt(document.getElementById('hourly-limit').value),
            strictMatching: document.getElementById('strict-matching').checked,
            confirmBeforeApi: document.getElementById('confirm-before-api').checked,
            urlProtocolFlexible: document.getElementById('url-protocol-flexible').checked,
            urlWwwFlexible: document.getElementById('url-www-flexible').checked
        };
        
        localStorage.setItem('factcheck_settings', JSON.stringify(this.settings));
        this.showNotification('設定を保存しました', 'success');
    }
    
    loadUsage() {
        const savedUsage = localStorage.getItem('factcheck_usage');
        if (savedUsage) {
            this.usage = { ...this.usage, ...JSON.parse(savedUsage) };
        }
        this.updateUsageTracking();
    }
    
    saveUsage() {
        localStorage.setItem('factcheck_usage', JSON.stringify(this.usage));
    }
    
    updatePatternExample() {
        const selectedPattern = document.querySelector('input[name="prompt-pattern"]:checked')?.value;
        const exampleDiv = document.getElementById('pattern-example');
        
        if (!selectedPattern) {
            exampleDiv.innerHTML = '';
            return;
        }
        
        const patternDescriptions = {
            direct: {
                description: "シンプルで直接的な質問形式",
                example: "東京大学の設立年を教えてください。"
            },
            polite: {
                description: "丁寧語を使用した礼儀正しい質問形式",
                example: "恐れ入りますが、東京大学の設立年を教えていただけますでしょうか。"
            },
            accuracy: {
                description: "正確性を強調し、詳細な確認を求める形式",
                example: "正確な情報として、東京大学の設立年を詳細に確認して教えてください。"
            },
            reliability: {
                description: "信頼できる情報源と根拠を求める形式",
                example: "信頼できる情報源に基づいて、東京大学の設立年を根拠と共に教えてください。"
            },
            detailed: {
                description: "詳細な調査と背景情報を求める形式",
                example: "以下について詳細に調べて教えてください：東京大学の設立年、背景情報も含めて。"
            }
        };
        
        const pattern = patternDescriptions[selectedPattern];
        if (pattern) {
            exampleDiv.innerHTML = `
                <div class="example-label">${pattern.description}</div>
                <div class="example-text">例: ${pattern.example}</div>
            `;
        } else {
            exampleDiv.innerHTML = '';
        }
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 4000);
    }
    
    // ===========================================
    // 一括検索機能メソッド
    // ===========================================
    
    setupBatchSearchMode() {
        // 初期状態でバッチ検索パネルを非表示
        const batchPanel = document.getElementById('batch-search-panel');
        const batchResultsSection = document.getElementById('batch-results-section');
        const singleDataSection = document.getElementById('single-data-section');
        
        if (batchPanel) batchPanel.style.display = 'none';
        if (batchResultsSection) batchResultsSection.style.display = 'none';
        if (singleDataSection) singleDataSection.style.display = 'block';
        
        // 選択されたエンティティタイプ
        this.selectedEntityType = null;
    }
    
    switchSearchMode(mode) {
        this.currentMode = mode;
        
        const batchPanel = document.getElementById('batch-search-panel');
        const batchResultsSection = document.getElementById('batch-results-section');
        const singleDataSection = document.getElementById('single-data-section');
        const singleInputs = document.querySelectorAll('#entity-search, #attribute-select');
        
        if (mode === 'batch') {
            // 一括検索モード
            if (batchPanel) batchPanel.style.display = 'block';
            if (batchResultsSection) batchResultsSection.style.display = 'block';
            if (singleDataSection) singleDataSection.style.display = 'none';
            
            singleInputs.forEach(input => {
                if (input) input.disabled = true;
            });
        } else {
            // 単体検索モード
            if (batchPanel) batchPanel.style.display = 'none';
            if (batchResultsSection) batchResultsSection.style.display = 'none';
            if (singleDataSection) singleDataSection.style.display = 'block';
            
            singleInputs.forEach(input => {
                if (input) input.disabled = false;
            });
        }
    }
    
    async handleEntityTypeSearch(query) {
        if (!query || query.length < 2) {
            document.getElementById('entity-type-results').innerHTML = '';
            return;
        }
        
        try {
            // 特定の検索語に対して既知のエンティティタイプを優先
            const knownEntityTypes = this.getKnownEntityTypes();
            const directMatch = knownEntityTypes[query.toLowerCase()];
            
            if (directMatch) {
                this.displayEntityTypeResults([directMatch]);
                return;
            }
            
            // Wikidataでエンティティタイプを検索
            const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=ja&type=item&format=json&origin=*&limit=15`;
            const response = await fetch(searchUrl);
            const data = await response.json();
            
            if (data.search && data.search.length > 0) {
                // より良いフィルタリング
                const filteredResults = data.search.filter(item => {
                    const desc = (item.description || '').toLowerCase();
                    const label = (item.label || '').toLowerCase();
                    
                    // 既知の良いエンティティタイプを優先
                    if (knownEntityTypes[label]) return true;
                    
                    // エンティティタイプらしいものをフィルタ
                    return desc.includes('種類') || desc.includes('タイプ') || desc.includes('クラス') || 
                           desc.includes('type') || desc.includes('class') || desc.includes('category') ||
                           label.includes(query.toLowerCase()) ||
                           // 地理的特徴
                           desc.includes('地形') || desc.includes('地理') || desc.includes('landform') ||
                           // 組織
                           desc.includes('組織') || desc.includes('機関') || desc.includes('organization') ||
                           // 建物・構造物
                           desc.includes('建物') || desc.includes('構造物') || desc.includes('building');
                });
                
                this.displayEntityTypeResults(filteredResults.slice(0, 10));
            }
        } catch (error) {
            console.error('Entity type search error:', error);
        }
    }
    
    getKnownEntityTypes() {
        // よく使用されるエンティティタイプの直接マッピング
        return {
            '山': { id: 'Q8502', label: '山', description: '地形の一種' },
            '大学': { id: 'Q3918', label: '大学', description: '高等教育機関' },
            '企業': { id: 'Q4830453', label: '企業', description: '営利組織' },
            '都市': { id: 'Q515', label: '都市', description: '人が居住する地域' },
            '国': { id: 'Q6256', label: '国', description: '主権国家' },
            '河川': { id: 'Q4022', label: '河川', description: '水の流れ' },
            '湖': { id: 'Q23397', label: '湖', description: '内陸の水域' },
            '島': { id: 'Q23442', label: '島', description: '四方を水に囲まれた陸地' },
            'mountain': { id: 'Q8502', label: '山', description: '地形の一種' },
            'university': { id: 'Q3918', label: '大学', description: '高等教育機関' },
            'company': { id: 'Q4830453', label: '企業', description: '営利組織' }
        };
    }
    
    displayEntityTypeResults(results) {
        const container = document.getElementById('entity-type-results');
        if (!container) return;
        
        if (results.length === 0) {
            container.innerHTML = '<div class="no-results">該当するエンティティタイプが見つかりません</div>';
            return;
        }
        
        container.innerHTML = results.map(item => `
            <div class="search-result-item" data-id="${item.id}" data-label="${item.label}">
                <div class="result-label">${item.label}</div>
                <div class="result-description">${item.description || ''}</div>
                <div class="result-id">ID: ${item.id}</div>
            </div>
        `).join('');
        
        // 結果項目にクリックイベントを追加
        container.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectEntityType({
                    id: item.dataset.id,
                    label: item.dataset.label
                });
            });
        });
        
        container.style.display = 'block';
    }
    
    selectEntityType(entityType) {
        this.selectedEntityType = entityType;
        
        // UI更新
        document.getElementById('entity-type-search').value = '';
        document.getElementById('entity-type-results').style.display = 'none';
        
        const selectedDiv = document.getElementById('selected-entity-type');
        const nameSpan = document.getElementById('selected-entity-type-name');
        const idSpan = document.getElementById('selected-entity-type-id');
        
        if (selectedDiv && nameSpan && idSpan) {
            nameSpan.textContent = entityType.label;
            idSpan.textContent = `(${entityType.id})`;
            selectedDiv.style.display = 'flex';
        }
        
        // SPARQLクエリプレビューを更新
        this.updateQueryPreview();
        
        // 利用可能な属性を更新
        this.updateAvailableAttributes();
    }
    
    clearSelectedEntityType() {
        this.selectedEntityType = null;
        
        const selectedDiv = document.getElementById('selected-entity-type');
        if (selectedDiv) {
            selectedDiv.style.display = 'none';
        }
        
        // プレビューをクリア
        this.updateQueryPreview();
        this.updateAvailableAttributes();
    }
    
    updateQueryPreview() {
        const previewDiv = document.getElementById('query-preview');
        if (!previewDiv) return;
        
        if (!this.selectedEntityType) {
            previewDiv.innerHTML = '<p class="placeholder-text">エンティティタイプを選択すると、生成されるSPARQLクエリがここに表示されます</p>';
            return;
        }
        
        const locationFilter = document.getElementById('location-filter')?.value || '';
        const limit = document.getElementById('batch-limit')?.value || 10;
        const selectedAttributes = Array.from(document.querySelectorAll('input[name="batch-attribute"]:checked'))
            .map(cb => cb.value);
        
        const query = this.generateDynamicSPARQLQuery(this.selectedEntityType.id, locationFilter, limit, selectedAttributes);
        
        previewDiv.innerHTML = `
            <div class="query-display">
                <h5>生成されるSPARQLクエリ（高橋さんの手法）:</h5>
                <pre class="sparql-query">${query}</pre>
                <p class="query-explanation">
                    📋 <strong>検索対象:</strong> ${this.selectedEntityType.label} (${this.selectedEntityType.id})<br>
                    🌍 <strong>地域制限:</strong> ${locationFilter ? this.getLocationName(locationFilter) : '制限なし'}<br>
                    🔍 <strong>検索属性:</strong> ${selectedAttributes.join(', ') || '未選択'}<br>
                    📊 <strong>取得件数:</strong> 最大${limit}件<br>
                    ⚡ <strong>フォーマット:</strong> カンマ区切り統一形式
                </p>
            </div>
        `;
    }
    
    generateDynamicSPARQLQuery(entityTypeId, locationFilter = '', limit = 10, selectedAttributes = []) {
        // 高橋さんの研究に基づく改良版SPARQLクエリ
        let query = `SELECT DISTINCT ?item ?itemLabel`;
        
        // 選択された属性に基づいて動的に変数を追加
        const propertyMappings = {
            'location': { prop: 'P131', var: '?location ?locationLabel' },
            'inception': { prop: 'P571', var: '?inception' },
            'website': { prop: 'P856', var: '?website' },
            'elevation': { prop: 'P2044', var: '?elevation' },
            'area': { prop: 'P2046', var: '?area' },
            'population': { prop: 'P1082', var: '?population' },
            'country': { prop: 'P17', var: '?country ?countryLabel' }
        };
        
        // 選択された属性の変数を追加
        selectedAttributes.forEach(attr => {
            if (propertyMappings[attr]) {
                query += ` ${propertyMappings[attr].var}`;
            }
        });
        
        query += ` WHERE {\n`;
        
        // エンティティタイプの指定を改良（より包括的）
        if (this.isKnownEntityType(entityTypeId)) {
            query += `    ?item wdt:P31/wdt:P279* wd:${entityTypeId} .\n`;
        } else {
            // 不明なエンティティタイプの場合、より柔軟な検索
            query += `    ?item wdt:P31 wd:${entityTypeId} .\n`;
        }
        
        // 地域フィルタ（日本など）
        if (locationFilter) {
            query += `    ?item wdt:P17 wd:${locationFilter} .\n`;
        }
        
        // 選択された属性に基づいてOPTIONAL句を動的生成
        selectedAttributes.forEach(attr => {
            const mapping = propertyMappings[attr];
            if (mapping) {
                if (attr === 'location') {
                    query += `    OPTIONAL { ?item wdt:${mapping.prop} ?location . }\n`;
                } else if (attr === 'country') {
                    query += `    OPTIONAL { ?item wdt:${mapping.prop} ?country . }\n`;
                } else {
                    query += `    OPTIONAL { ?item wdt:${mapping.prop} ?${attr} . }\n`;
                }
            }
        });
        
        query += `    SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en" . }\n`;
        query += `}\n`;
        query += `ORDER BY ?itemLabel\n`;
        query += `LIMIT ${limit}`;
        
        return query;
    }
    
    isKnownEntityType(entityTypeId) {
        // 既知のエンティティタイプ（サブクラス関係を使用すべき）
        const knownTypes = [
            'Q3918',  // 大学
            'Q8502',  // 山
            'Q4830453', // 企業
            'Q515',   // 都市
            'Q6256',  // 国
            'Q4022'   // 河川
        ];
        return knownTypes.includes(entityTypeId);
    }
    
    updateAvailableAttributes() {
        const attributesContainer = document.getElementById('batch-attributes');
        if (!attributesContainer) return;
        
        if (!this.selectedEntityType) {
            attributesContainer.innerHTML = '<p class="placeholder-text">エンティティタイプを選択すると、利用可能な属性が表示されます</p>';
            return;
        }
        
        // 一般的な属性セット
        const commonAttributes = [
            { id: 'inception', label: '設立年・創設年', property: 'P571' },
            { id: 'location', label: '所在地・場所', property: 'P131' },
            { id: 'country', label: '国', property: 'P17' },
            { id: 'website', label: '公式ウェブサイト', property: 'P856' },
            { id: 'population', label: '人口', property: 'P1082' },
            { id: 'area', label: '面積', property: 'P2046' },
            { id: 'elevation', label: '標高', property: 'P2044' },
            { id: 'length', label: '長さ・全長', property: 'P2043' }
        ];
        
        attributesContainer.innerHTML = `
            <div class="attributes-grid">
                ${commonAttributes.map(attr => `
                    <label class="attribute-option">
                        <input type="checkbox" name="batch-attribute" value="${attr.id}" data-property="${attr.property}">
                        <span class="attribute-label">${attr.label}</span>
                        <span class="attribute-property">P: ${attr.property}</span>
                    </label>
                `).join('')}
            </div>
            <p class="attributes-note">
                💡 属性の有無はエンティティによって異なります。選択した属性がないエンティティの場合は「N/A」と表示されます。
            </p>
        `;
    }
    
    getLocationName(locationId) {
        const locations = {
            'Q17': '日本',
            'Q30': 'アメリカ',
            'Q29': 'スペイン',
            'Q142': 'フランス',
            'Q183': 'ドイツ',
            'Q145': 'イギリス',
            'Q148': '中国',
            'Q668': 'インド'
        };
        return locations[locationId] || locationId;
    }
    
    async executeDynamicSparqlQuery() {
        if (!this.selectedEntityType) {
            throw new Error('エンティティタイプが選択されていません');
        }
        
        const locationFilter = document.getElementById('location-filter')?.value || '';
        const limit = parseInt(document.getElementById('batch-limit')?.value) || 10;
        const selectedAttributes = Array.from(document.querySelectorAll('input[name="batch-attribute"]:checked'))
            .map(cb => cb.value);
        
        const query = this.generateDynamicSPARQLQuery(this.selectedEntityType.id, locationFilter, limit, selectedAttributes);
        const url = 'https://query.wikidata.org/sparql';
        
        console.log('Executing SPARQL query:', query);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'User-Agent': 'FactCheckSystem/1.0'
            },
            body: `query=${encodeURIComponent(query)}`
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('SPARQL Error Response:', errorText);
            throw new Error(`SPARQLクエリ実行失敗: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log('SPARQL Response:', data);
        return this.processSparqlResults(data);
    }
    
    processSparqlResults(data) {
        const bindings = data.results?.bindings || [];
        return bindings.map(binding => {
            const result = {};
            
            Object.keys(binding).forEach(key => {
                const value = binding[key];
                if (value?.value) {
                    result[key] = {
                        value: value.value,
                        label: value.value
                    };
                    
                    // Wikidata URLからIDを抽出
                    if (value.value.startsWith('http://www.wikidata.org/entity/')) {
                        result[key].id = value.value.split('/').pop();
                    }
                }
            });
            
            return result;
        });
    }
    
    async executeBatchFactCheck() {
        if (!this.selectedEntityType) {
            this.showNotification('エンティティタイプを選択してください', 'error');
            return;
        }
        
        const limit = parseInt(document.getElementById('batch-limit')?.value) || 10;
        const selectedAttributes = Array.from(document.querySelectorAll('input[name="batch-attribute"]:checked'))
            .map(cb => ({ id: cb.value, property: cb.dataset.property }));
        
        if (selectedAttributes.length === 0) {
            this.showNotification('検証する属性を選択してください', 'error');
            return;
        }
        
        if (!this.settings.openaiApiKey) {
            this.showNotification('OpenAI APIキーを設定してください', 'error');
            return;
        }
        
        this.updateProgress(0, '動的SPARQLクエリを実行しています...');
        this.batchResults = [];
        
        try {
            // 動的SPARQLクエリでエンティティを取得
            const entities = await this.executeDynamicSparqlQuery();
            this.updateProgress(20, `${entities.length}件のエンティティを取得しました`);
            
            // 各エンティティに対してファクトチェックを実行（高橋さんの手法に基づく改良）
            for (let i = 0; i < entities.length; i++) {
                const entity = entities[i];
                const entityName = entity.itemLabel?.value || entity.item?.id;
                const entityId = entity.item?.id;
                
                const progress = 20 + ((i + 1) / entities.length) * 70;
                this.updateProgress(progress, `検証中: ${entityName}`);
                
                const entityResult = {
                    entityName,
                    entityId,
                    attributes: {}
                };
                
                try {
                    // 全属性を一括でWikidataから取得
                    const wikidataData = await this.getWikidataProperties(entityId, selectedAttributes);
                    console.log(`Wikidata response for ${entityName}:`, wikidataData);
                    
                    // 全属性を一括でLLMに質問（高橋さんの手法）
                    console.log(`Querying LLM for ${entityName} - attributes:`, selectedAttributes.map(a => a.id));
                    const llmResponses = await this.queryLLM(entityName, selectedAttributes.map(a => a.id));
                    console.log(`LLM response for ${entityName}:`, llmResponses);
                    
                    // 各属性を評価
                    selectedAttributes.forEach(attribute => {
                        const wikidataValue = wikidataData[attribute.id];
                        const llmValue = llmResponses[attribute.id];
                        
                        console.log(`Evaluating ${attribute.id}: Wiki="${wikidataValue}" vs LLM="${llmValue}"`);
                        
                        const evaluation = this.evaluateAnswers(wikidataValue, llmValue, attribute.id);
                        
                        entityResult.attributes[attribute.id] = {
                            wikidataValue: String(wikidataValue || 'N/A'),
                            llmValue: String(llmValue || 'N/A'), 
                            evaluation,
                            attribute: attribute.id
                        };
                    });
                    
                    // API制限対策：少し待機
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                } catch (error) {
                    console.error(`Error checking ${entityName}:`, error);
                    selectedAttributes.forEach(attribute => {
                        entityResult.attributes[attribute.id] = {
                            wikidataValue: 'N/A',
                            llmValue: 'N/A',
                            evaluation: { score: 0, status: 'エラー', details: error.message },
                            attribute: attribute.id
                        };
                    });
                }
                
                this.batchResults.push(entityResult);
            }
            
            this.updateProgress(100, '一括検索が完了しました');
            this.displayBatchResults();
            this.generateBatchStatistics();
            this.enableExportButtons();
            
        } catch (error) {
            console.error('Batch fact check error:', error);
            this.updateProgress(0, 'エラーが発生しました');
            this.showNotification(`一括検索でエラーが発生しました: ${error.message}`, 'error');
            
            // 詳細なエラー情報をコンソールに出力
            if (error.stack) {
                console.error('Error stack:', error.stack);
            }
        }
    }
    
    async getWikidataProperties(entityId, properties) {
        if (!entityId || !properties.length) return {};
        
        try {
            const response = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${entityId}.json`);
            const data = await response.json();
            const entity = data.entities[entityId];
            
            const result = {};
            
            for (const propConfig of properties) {
                const property = propConfig.property;
                
                if (entity?.claims?.[property]) {
                    const claim = entity.claims[property][0];
                    
                    if (claim?.mainsnak?.datavalue) {
                        const value = claim.mainsnak.datavalue.value;
                        
                        // データタイプに応じて処理
                        if (claim.mainsnak.datatype === 'wikibase-item') {
                            const itemId = value.id;
                            const label = await this.resolveEntityLabel(itemId);
                            result[propConfig.id] = label || itemId;
                        } else if (claim.mainsnak.datatype === 'time') {
                            result[propConfig.id] = this.formatWikidataTime(value.time);
                        } else if (claim.mainsnak.datatype === 'quantity') {
                            result[propConfig.id] = value.amount.replace('+', '');
                        } else if (claim.mainsnak.datatype === 'url') {
                            result[propConfig.id] = value;
                        } else {
                            result[propConfig.id] = String(value);
                        }
                    } else {
                        result[propConfig.id] = null;
                    }
                } else {
                    result[propConfig.id] = null;
                }
            }
            
            return result;
        } catch (error) {
            console.error(`Error getting Wikidata properties for ${entityId}:`, error);
            return {};
        }
    }
    
    formatWikidataCommaString(wikidataData, attributes) {
        // Wikidataデータをカンマ区切り文字列に変換（高橋さんの研究手法）
        return attributes.map(attr => {
            const value = wikidataData[attr];
            return value || '不明';
        }).join(',');
    }
    
    updateProgress(percentage, message) {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        const progressPercentage = document.getElementById('progress-percentage');
        
        if (progressFill) progressFill.style.width = `${percentage}%`;
        if (progressText) progressText.textContent = message;
        if (progressPercentage) progressPercentage.textContent = `${Math.round(percentage)}%`;
    }
    
    displayBatchResults() {
        const tableHead = document.getElementById('batch-table-head');
        const tableBody = document.getElementById('batch-table-body');
        
        if (!tableHead || !tableBody || this.batchResults.length === 0) return;
        
        // ヘッダーを生成（コンパクト版）
        const firstResult = this.batchResults[0];
        const attributes = Object.keys(firstResult.attributes);
        
        tableHead.innerHTML = `
            <tr>
                <th rowspan="2" class="entity-header">エンティティ</th>
                ${attributes.map(attr => `
                    <th colspan="3" class="attribute-header">${this.getAttributeLabel(attr)}</th>
                `).join('')}
            </tr>
            <tr>
                ${attributes.map(() => `
                    <th class="sub-header">Wikidata</th>
                    <th class="sub-header">LLM</th>
                    <th class="sub-header">評価</th>
                `).join('')}
            </tr>
        `;
        
        // データ行を生成
        tableBody.innerHTML = this.batchResults.map(result => `
            <tr>
                <td class="entity-name"><strong>${result.entityName}</strong></td>
                ${attributes.map(attr => {
                    const attrResult = result.attributes[attr];
                    const statusClass = attrResult.evaluation.status === '一致' ? 'match' : 
                                      attrResult.evaluation.status === '部分一致' ? 'partial' : 'mismatch';
                    
                    return `
                        <td class="wikidata-value">${attrResult.wikidataValue || 'N/A'}</td>
                        <td class="llm-value">${attrResult.llmValue || 'N/A'}</td>
                        <td class="evaluation-result status-${statusClass}">
                            <span class="status">${attrResult.evaluation.status}</span>
                            <span class="score">(${attrResult.evaluation.score})</span>
                        </td>
                    `;
                }).join('')}
            </tr>
        `).join('');
    }
    
    getAttributeLabel(attributeId) {
        const labels = {
            'location': '所在地',
            'inception': '設立年',
            'website': 'ウェブサイト',
            'elevation': '標高',
            'area': '面積',
            'population': '人口'
        };
        return labels[attributeId] || attributeId;
    }
    
    generateBatchStatistics() {
        const canvas = document.getElementById('batch-stats-chart');
        if (!canvas) return;
        
        // 既存のチャートインスタンスを破棄
        if (this.batchStatsChart) {
            this.batchStatsChart.destroy();
            this.batchStatsChart = null;
        }
        
        const ctx = canvas.getContext('2d');
        
        // 統計データを計算
        const stats = { match: 0, partial: 0, mismatch: 0, error: 0 };
        
        this.batchResults.forEach(result => {
            Object.values(result.attributes).forEach(attr => {
                const status = attr.evaluation.status;
                if (status === '一致') stats.match++;
                else if (status === '部分一致') stats.partial++;
                else if (status === 'エラー') stats.error++;
                else stats.mismatch++;
            });
        });
        
        // 新しいChart.jsグラフを生成
        this.batchStatsChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['完全一致', '部分一致', '不一致', 'エラー'],
                datasets: [{
                    data: [stats.match, stats.partial, stats.mismatch, stats.error],
                    backgroundColor: ['#4CAF50', '#FF9800', '#f44336', '#9E9E9E']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
    
    enableExportButtons() {
        const csvBtn = document.getElementById('export-csv-btn');
        const jsonBtn = document.getElementById('export-json-btn');
        const clearBtn = document.getElementById('clear-results-btn');
        
        if (csvBtn) csvBtn.disabled = false;
        if (jsonBtn) jsonBtn.disabled = false;
        if (clearBtn) clearBtn.disabled = false;
    }
    
    exportResults(format) {
        if (this.batchResults.length === 0) {
            this.showNotification('エクスポートする結果がありません', 'error');
            return;
        }
        
        if (format === 'csv') {
            this.exportAsCSV();
        } else if (format === 'json') {
            this.exportAsJSON();
        }
    }
    
    exportAsCSV() {
        const headers = ['エンティティ', 'エンティティID'];
        const firstResult = this.batchResults[0];
        const attributes = Object.keys(firstResult.attributes);
        
        attributes.forEach(attr => {
            headers.push(`${attr}_Wikidata`, `${attr}_LLM`, `${attr}_評価`, `${attr}_スコア`);
        });
        
        const rows = [headers.join(',')];
        
        this.batchResults.forEach(result => {
            const row = [result.entityName, result.entityId];
            
            attributes.forEach(attr => {
                const attrResult = result.attributes[attr];
                row.push(
                    this.escapeCSV(attrResult.wikidataValue || ''),
                    this.escapeCSV(attrResult.llmValue || ''),
                    attrResult.evaluation.status,
                    attrResult.evaluation.score
                );
            });
            
            rows.push(row.join(','));
        });
        
        const csv = rows.join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `fact_check_batch_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        
        URL.revokeObjectURL(url);
        this.showNotification('CSV ファイルをダウンロードしました', 'success');
    }
    
    exportAsJSON() {
        const exportData = {
            timestamp: new Date().toISOString(),
            category: document.getElementById('category-select')?.value,
            totalEntities: this.batchResults.length,
            results: this.batchResults
        };
        
        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `fact_check_batch_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        this.showNotification('JSON ファイルをダウンロードしました', 'success');
    }
    
    escapeCSV(value) {
        if (typeof value !== 'string') return value;
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }
    
    async queryLLM(entityName, attributes) {
        // 高橋さんの研究手法に基づくカンマ区切りフォーマットでの質問
        const attributeQuestions = {
            'inception': '設立年',
            'location': '所在地',
            'country': '国',
            'website': '公式ウェブサイト',
            'population': '人口',
            'area': '面積',
            'elevation': '標高',
            'length': '長さ',
            'student_count': '学生数'
        };
        
        // 複数属性の場合は配列、単一の場合は文字列として処理
        const attrArray = Array.isArray(attributes) ? attributes : [attributes];
        const attrLabels = attrArray.map(attr => attributeQuestions[attr] || attr);
        
        // カンマ区切り形式での質問（高橋さんの研究手法）
        const prompt = `${entityName}について以下の情報を正確にカンマ区切りで答えてください：

${attrLabels.join(',')}

回答形式例：1877年,東京都,文京区,https://www.u-tokyo.ac.jp/
重要事項：
- 各項目を必ずカンマ(,)で区切ってください
- 所在地は「都道府県,市区町村」の形式で回答してください
- 余分な説明は付けず、データのみ回答してください
- 不明な場合は「不明」と記載してください`;
        
        try {
            const response = await this.callOpenAIAPI(prompt);
            return this.parseLLMResponse(response, attrArray);
        } catch (error) {
            console.error(`LLM query failed for ${entityName} - ${attributes}:`, error);
            throw error;
        }
    }
    
    parseLLMResponse(response, attributes) {
        // レスポンスが文字列でない場合の対処
        if (typeof response !== 'string') {
            console.error('LLM response is not a string:', response);
            const result = {};
            attributes.forEach(attr => {
                result[attr] = '取得エラー';
            });
            return result;
        }
        
        // カンマ区切りレスポンスを解析
        const values = response.split(',').map(v => v.trim());
        const result = {};
        
        attributes.forEach((attr, index) => {
            result[attr] = values[index] || '不明';
        });
        
        console.log('Parsed LLM response:', result);
        return result;
    }
    
    evaluateAnswers(wikidataValue, llmValue, attribute) {
        // 高橋さんの研究手法に基づく改良された評価システム
        console.log('評価開始 - Wikidata:', wikidataValue, 'LLM:', llmValue, 'Attribute:', attribute);
        
        if (!wikidataValue && !llmValue) {
            return { score: 0, status: 'データなし', match: '×', confidence: 0, details: '両方のデータが存在しません' };
        }
        
        if (!wikidataValue) {
            return { score: 0, status: 'Wikidata不明', match: '×', confidence: 0, details: 'Wikidataにデータがありません' };
        }
        
        if (!llmValue || llmValue.trim() === '') {
            return { score: 0, status: 'LLM無回答', match: '×', confidence: 0, details: 'LLMが回答しませんでした' };
        }
        
        // LLMの回答から数値・年を抽出（高橋さんの手法）
        const extractedLLM = this.extractFactualValue(llmValue, attribute);
        const normalizedWiki = this.normalizeValue(wikidataValue, attribute);
        
        console.log('正規化後 - Wikidata:', normalizedWiki, 'LLM抽出値:', extractedLLM);
        
        // 属性別の詳細比較
        return this.compareByAttribute(normalizedWiki, extractedLLM, attribute);
    }
    
    // LLMの回答から事実情報を抽出（高橋さんの研究手法）
    extractFactualValue(llmResponse, attribute) {
        const text = String(llmResponse).trim();
        console.log('🔧 事実抽出開始 - 入力:', text, 'Attribute:', attribute);
        
        switch(attribute) {
            case 'inception':
            case '設立年':
                // 年を抽出（1941年、1941、等）
                const yearMatch = text.match(/(\d{4})/);
                const result = yearMatch ? yearMatch[1] : text;
                console.log('📅 年抽出結果:', result);
                return result;
                
            case 'website':
            case 'ウェブサイト':
                // URLを抽出
                const urlMatch = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+\.[a-z]{2,})/i);
                return urlMatch ? urlMatch[0] : text;
                
            case 'location':
            case '所在地':
            case 'headquarters':
            case '本社所在地':
            case 'country':
            case '国':
                // 高橋さんの研究手法: カンマ区切り形式の処理
                return this.parseLocationCommaFormat(text);
                
            case 'elevation':
            case '標高':
                // 数値+単位を抽出
                const elevationMatch = text.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*[mメートル]/);
                return elevationMatch ? elevationMatch[1].replace(/,/g, '') : text.match(/\d+/)?.[0] || text;
                
            default:
                // その他の場合は文頭の主要な情報を抽出
                return text.split(/[、。]/)[0].trim();
        }
    }
    
    // 値の正規化
    normalizeValue(value, attribute) {
        const str = String(value).trim();
        console.log('🔄 正規化開始 - 入力:', str, 'Attribute:', attribute);
        
        switch(attribute) {
            case 'inception':
            case '設立年':
                // 年のみを抽出
                const year = str.match(/(\d{4})/);
                const result = year ? year[1] : str;
                console.log('📅 Wikidata年正規化結果:', result);
                return result;
                
            case 'website':
            case 'ウェブサイト':
                // プロトコルを除去してドメインを正規化
                return str.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
                
            case 'location':
            case '所在地':
            case 'headquarters':
            case '本社所在地':
                // 所在地の正規化（カンマ区切り対応）
                return this.parseLocationCommaFormat(str);
                
            case 'elevation':
            case '標高':
                // 数値のみを抽出
                const num = str.replace(/[^\d.]/g, '');
                return num || str;
                
            default:
                return str.toLowerCase().trim();
        }
    }
    
    // 属性別の詳細比較
    compareByAttribute(wikidataValue, llmValue, attribute) {
        const wikiNorm = String(wikidataValue).toLowerCase().trim();
        const llmNorm = String(llmValue).toLowerCase().trim();
        
        console.log('比較中:', { wikiNorm, llmNorm, attribute });
        
        // 完全一致
        if (wikiNorm === llmNorm) {
            return { score: 100, status: '完全一致', match: '○', confidence: 100, details: '完全一致' };
        }
        
        // 属性別の特殊比較
        switch(attribute) {
            case 'inception':
            case '設立年':
                if (wikiNorm === llmNorm) {
                    return { score: 100, status: '年一致', match: '○', confidence: 95, details: '年が一致' };
                }
                break;
                
            case 'website':
            case 'ウェブサイト':
                if (this.compareDomains(wikiNorm, llmNorm)) {
                    return { score: 90, status: 'ドメイン一致', match: '○', confidence: 90, details: 'ドメインが一致' };
                }
                break;
                
            case 'location':
            case '所在地':
            case 'headquarters':
            case '本社所在地':
                console.log('🏢 位置情報比較開始:', { wikidata: wikidataValue, llm: llmValue });
                const locationResult = this.compareLocations(wikidataValue, llmValue);
                console.log('🏢 位置情報比較結果:', locationResult);
                if (locationResult.match) {
                    return { 
                        score: locationResult.score, 
                        status: locationResult.status, 
                        match: '○', 
                        confidence: locationResult.confidence, 
                        details: locationResult.details 
                    };
                } else {
                    return { 
                        score: 0, 
                        status: locationResult.status || '位置情報不一致', 
                        match: '×', 
                        confidence: 0, 
                        details: locationResult.details || '位置情報が一致しません' 
                    };
                }
                break;
                
            case 'elevation':
            case '標高':
                const wikiNum = parseFloat(wikiNorm);
                const llmNum = parseFloat(llmNorm);
                if (!isNaN(wikiNum) && !isNaN(llmNum)) {
                    const diff = Math.abs(wikiNum - llmNum) / wikiNum;
                    if (diff < 0.05) {  // 5%以内
                        return { score: 95, status: '数値一致', match: '○', confidence: 95, details: '数値が一致（5%以内）' };
                    }
                }
                break;
        }
        
        // 部分一致チェック
        if (wikiNorm.includes(llmNorm) || llmNorm.includes(wikiNorm)) {
            return { score: 70, status: '部分一致', match: '△', confidence: 70, details: '部分的に一致' };
        }
        
        // 不一致
        return { score: 0, status: '不一致', match: '×', confidence: 0, details: '情報が一致しません' };
    }
    
    // ドメイン比較
    compareDomains(wiki, llm) {
        const wikiDomain = wiki.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        const llmDomain = llm.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        return wikiDomain === llmDomain;
    }
    
    // 高橋さんの研究手法: カンマ区切り所在地の解析
    parseLocationCommaFormat(text) {
        console.log('🌍 カンマ区切り所在地解析開始:', text);
        
        const str = String(text).trim();
        
        // カンマ区切り形式をチェック（例: "広島県、安芸郡府中町"）
        if (str.includes('、') || str.includes(',')) {
            const parts = str.split(/[、,]/).map(part => part.trim());
            console.log('📍 カンマ区切り検出:', parts);
            
            // 行政区分を段階的に特定
            const prefecture = parts.find(part => /[都道府県]$/.test(part));
            const gun = parts.find(part => /[郡]$/.test(part)); // 郡レベルを追加
            const city = parts.find(part => /[市区町村]$/.test(part));
            
            // 階層構造を構築
            const hierarchy = [];
            if (prefecture) hierarchy.push(prefecture);
            if (gun) hierarchy.push(gun);
            if (city) hierarchy.push(city);
            
            // 結果を返す
            if (hierarchy.length > 0) {
                console.log('📍 カンマ区切り階層結果:', hierarchy);
                return hierarchy;
            }
            
            // 行政区分が見つからない場合は全ての部分を返す
            console.log('📍 カンマ区切り全パーツ結果:', parts);
            return parts;
        }
        
        // カンマ区切りでない場合は従来の階層抽出にフォールバック
        return this.extractLocationHierarchy(str);
    }
    
    // 所在地の階層的抽出
    extractLocationHierarchy(text) {
        console.log('🌍 所在地抽出開始:', text);
        
        const str = String(text).trim();
        
        // 郵便番号付きの完全住所から行政区分を抽出
        // 例: "〒572-8530 大阪府寝屋川市初町18-8" → ["大阪府", "寝屋川市"]
        // 例: "〒730-8670 広島県安芸郡府中町新地3-1" → ["広島県", "安芸郡", "府中町"]
        const fullAddressMatch = str.match(/(?:〒\d{3}-\d{4}\s*)?([^0-9]*?[都道府県])([^0-9]*?[郡])?([^0-9]*?[市区町村])/);
        if (fullAddressMatch) {
            const hierarchy = [];
            if (fullAddressMatch[1]) hierarchy.push(fullAddressMatch[1]); // 都道府県
            if (fullAddressMatch[2]) hierarchy.push(fullAddressMatch[2]); // 郡
            if (fullAddressMatch[3]) hierarchy.push(fullAddressMatch[3]); // 市区町村
            console.log('📍 完全住所から階層抽出:', hierarchy);
            return hierarchy;
        }
        
        // 都道府県・郡・市区町村を個別に抽出
        const prefectureMatch = str.match(/([^0-9、。]*?[都道府県])/);
        const gunMatch = str.match(/([^0-9、。]*?[郡])/);
        const cityMatch = str.match(/([^0-9、。]*?[市区町村])/);
        
        const hierarchy = [];
        if (prefectureMatch) hierarchy.push(prefectureMatch[1]);
        if (gunMatch) hierarchy.push(gunMatch[1]);
        if (cityMatch) hierarchy.push(cityMatch[1]);
        
        if (hierarchy.length > 0) {
            console.log('📍 個別抽出階層:', hierarchy);
            return hierarchy;
        }
        
        // マッチしない場合は元のテキストを返す
        console.log('📍 抽出失敗、元テキスト返却:', str);
        return [str];
    }
    
    // 所在地の比較
    compareLocations(wikidataLocation, llmLocation) {
        console.log('🔍 所在地比較開始:', { wikidata: wikidataLocation, llm: llmLocation });
        
        const wikiHierarchy = Array.isArray(wikidataLocation) ? wikidataLocation : this.parseLocationCommaFormat(wikidataLocation);
        const llmHierarchy = Array.isArray(llmLocation) ? llmLocation : this.parseLocationCommaFormat(llmLocation);
        
        console.log('📊 階層データ:', { wikiHierarchy, llmHierarchy });
        
        // 完全一致チェック（全ての階層が一致）
        if (this.arraysEqual(wikiHierarchy, llmHierarchy)) {
            return { 
                match: true, 
                score: 100, 
                status: '完全一致', 
                confidence: 100, 
                details: '所在地が完全に一致' 
            };
        }
        
        // 包含関係チェック（一方が他方を含む）
        const containmentScore = this.checkLocationContainment(wikiHierarchy, llmHierarchy);
        if (containmentScore > 0) {
            return containmentScore;
        }
        
        // 市区町村レベルでの一致チェック
        const cityMatch = this.checkCityLevelMatch(wikiHierarchy, llmHierarchy);
        if (cityMatch) {
            return cityMatch;
        }
        
        return { 
            match: false, 
            score: 0, 
            status: '不一致', 
            confidence: 0, 
            details: '所在地が一致しません' 
        };
    }
    
    // 配列の等価性チェック
    arraysEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;
        return arr1.every((item, index) => item.toLowerCase().trim() === arr2[index].toLowerCase().trim());
    }
    
    // 包含関係チェック（例：「府中町」⊂「広島県、安芸郡府中町」）
    checkLocationContainment(wikiHierarchy, llmHierarchy) {
        console.log('🔍 包含関係チェック:', { wiki: wikiHierarchy, llm: llmHierarchy });
        
        // 階層的包含関係チェック（より詳細な階層が簡潔な階層を含むかチェック）
        const wikiInLlm = this.isHierarchyContained(wikiHierarchy, llmHierarchy);
        const llmInWiki = this.isHierarchyContained(llmHierarchy, wikiHierarchy);
        
        console.log('📊 包含関係結果:', { wikiInLlm, llmInWiki });
        
        if (wikiInLlm || llmInWiki) {
            return {
                match: true,
                score: 95,
                status: '包含一致',
                confidence: 90,
                details: '階層的な所在地の包含関係が確認されました'
            };
        }
        
        return null;
    }
    
    // 階層的包含関係の判定（マツダケース対応強化版）
    isHierarchyContained(shortHierarchy, longHierarchy) {
        console.log('🔍 階層包含関係判定:', { short: shortHierarchy, long: longHierarchy });
        
        // shortHierarchyの全ての要素がlongHierarchyに含まれているかチェック
        return shortHierarchy.every(shortItem => {
            console.log(`📍 要素チェック開始: "${shortItem}"`);
            
            // 1. 完全一致をまずチェック
            const exactMatch = longHierarchy.some(longItem => {
                const match = longItem.toLowerCase().trim() === shortItem.toLowerCase().trim();
                if (match) console.log(`✅ 完全一致: "${shortItem}" === "${longItem}"`);
                return match;
            });
            
            if (exactMatch) return true;
            
            // 2. 町・村の特別処理（郡レベルを考慮）
            if (/[町村]$/.test(shortItem)) {
                const townMatch = longHierarchy.some(longItem => {
                    // 「府中町」が「安芸郡府中町」に含まれるかチェック
                    const isContained = longItem.includes(shortItem) && longItem !== shortItem;
                    if (isContained) {
                        console.log(`✅ 町村包含一致: "${shortItem}" ⊂ "${longItem}"`);
                    }
                    return isContained;
                });
                
                if (townMatch) return true;
            }
            
            // 3. 市区の特別処理
            if (/[市区]$/.test(shortItem)) {
                const cityMatch = longHierarchy.some(longItem => {
                    const isContained = longItem.includes(shortItem);
                    if (isContained) {
                        console.log(`✅ 市区包含一致: "${shortItem}" ⊂ "${longItem}"`);
                    }
                    return isContained;
                });
                
                if (cityMatch) return true;
            }
            
            // 4. 一般的な部分一致チェック
            const partialMatch = longHierarchy.some(longItem => {
                const match = longItem.toLowerCase().includes(shortItem.toLowerCase()) ||
                             shortItem.toLowerCase().includes(longItem.toLowerCase());
                if (match) {
                    console.log(`✅ 部分一致: "${shortItem}" ⟷ "${longItem}"`);
                }
                return match;
            });
            
            const result = partialMatch;
            console.log(`📊 要素 "${shortItem}" の最終判定:`, result);
            return result;
        });
    }
    
    // 市区町村レベルでの一致チェック
    checkCityLevelMatch(wikiHierarchy, llmHierarchy) {
        console.log('🏘️ 市区町村レベルチェック:', { wiki: wikiHierarchy, llm: llmHierarchy });
        
        // 市区町村を抽出
        const wikiCities = wikiHierarchy.filter(item => /[市区町村]$/.test(item));
        const llmCities = llmHierarchy.filter(item => /[市区町村]$/.test(item));
        
        console.log('🏘️ 抽出された市区町村:', { wikiCities, llmCities });
        
        // 市区町村が完全一致する場合
        const exactCityMatch = wikiCities.some(wikiCity => 
            llmCities.some(llmCity => 
                wikiCity.toLowerCase().trim() === llmCity.toLowerCase().trim()
            )
        );
        
        if (exactCityMatch) {
            console.log('✅ 市区町村完全一致');
            return {
                match: true,
                score: 90,
                status: '市区町村完全一致',
                confidence: 90,
                details: '市区町村レベルで完全一致'
            };
        }
        
        // 郡を含む階層での部分一致チェック
        // 例: "府中町" vs ["広島県", "安芸郡", "府中町"]
        const hierarchicalMatch = this.checkHierarchicalCityMatch(wikiHierarchy, llmHierarchy);
        if (hierarchicalMatch) {
            return hierarchicalMatch;
        }
        
        return null;
    }
    
    // 階層的な市区町村一致チェック
    checkHierarchicalCityMatch(wikiHierarchy, llmHierarchy) {
        // より詳細な階層（郡を含む可能性）とシンプルな階層を比較
        const [detailed, simple] = llmHierarchy.length >= wikiHierarchy.length 
            ? [llmHierarchy, wikiHierarchy] 
            : [wikiHierarchy, llmHierarchy];
            
        console.log('🔍 階層的市区町村チェック:', { detailed, simple });
        
        // シンプルな階層の市区町村が詳細な階層に含まれているかチェック
        const simpleCity = simple.find(item => /[市区町村]$/.test(item));
        const detailedCity = detailed.find(item => /[市区町村]$/.test(item));
        
        if (simpleCity && detailedCity && 
            simpleCity.toLowerCase().trim() === detailedCity.toLowerCase().trim()) {
            console.log('✅ 階層的市区町村一致:', { simpleCity, detailedCity });
            return {
                match: true,
                score: 85,
                status: '階層的市区町村一致',
                confidence: 85,
                details: `市区町村「${simpleCity}」が階層構造で一致`
            };
        }
        
        return null;
    }
    
    // 古いメソッドは新しい評価システムに統合済み
    
    // ===========================================
    // 簡易一括検索機能
    // ===========================================
    
    toggleAdvancedSearch() {
        const advancedDiv = document.getElementById('advanced-query-builder');
        const toggleBtn = document.getElementById('toggle-advanced');
        
        if (advancedDiv && toggleBtn) {
            if (advancedDiv.style.display === 'none') {
                advancedDiv.style.display = 'block';
                toggleBtn.textContent = '🔧 高度な動的検索を非表示';
            } else {
                advancedDiv.style.display = 'none';
                toggleBtn.textContent = '🔧 高度な動的検索を表示';
            }
        }
    }
    
    async executeSimpleBatchSearch() {
        const category = document.getElementById('simple-category-select')?.value;
        const selectedAttributes = Array.from(document.querySelectorAll('.simple-attributes input:checked'))
            .map(cb => cb.value);
        
        if (!category) {
            this.showNotification('カテゴリを選択してください', 'error');
            return;
        }
        
        if (selectedAttributes.length === 0) {
            this.showNotification('検証属性を選択してください', 'error');
            return;
        }
        
        if (!this.settings.openaiApiKey) {
            this.showNotification('OpenAI APIキーを設定してください', 'error');
            return;
        }
        
        try {
            this.updateProgress(0, '簡易一括検索を開始...');
            
            // 事前定義されたデータセット
            const datasets = this.getSimpleDataset(category);
            this.updateProgress(30, `${datasets.length}件のデータを準備しました`);
            
            this.batchResults = [];
            let processed = 0;
            
            for (const entity of datasets) {
                processed++;
                const progressPercent = 30 + (processed / datasets.length) * 60;
                this.updateProgress(progressPercent, `検証中: ${entity.name}`);
                
                const entityResult = {
                    entityName: entity.name,
                    entityId: entity.id || 'N/A',
                    attributes: {}
                };
                
                for (const attribute of selectedAttributes) {
                    try {
                        // 事前定義されたWikidataデータ
                        const wikidataValue = entity[attribute] || null;
                        
                        // LLMに質問
                        const llmValue = await this.queryLLM(entity.name, attribute);
                        
                        // 評価
                        const evaluation = this.evaluateAnswers(wikidataValue, llmValue, attribute);
                        
                        entityResult.attributes[attribute] = {
                            wikidataValue,
                            llmValue,
                            evaluation,
                            attribute
                        };
                        
                        // API制限対策
                        await new Promise(resolve => setTimeout(resolve, 200));
                        
                    } catch (error) {
                        console.error(`Error with ${entity.name} - ${attribute}:`, error);
                        entityResult.attributes[attribute] = {
                            wikidataValue: entity[attribute] || null,
                            llmValue: null,
                            evaluation: { score: 0, status: 'エラー', details: error.message },
                            attribute
                        };
                    }
                }
                
                this.batchResults.push(entityResult);
            }
            
            this.updateProgress(100, '簡易一括検索完了');
            this.displayBatchResults();
            this.generateBatchStatistics();
            this.enableExportButtons();
            
            this.showNotification('簡易一括検索が完了しました', 'success');
            
        } catch (error) {
            console.error('Simple batch search error:', error);
            this.updateProgress(0, 'エラーが発生しました');
            this.showNotification(`エラー: ${error.message}`, 'error');
        }
    }
    
    getSimpleDataset(category) {
        const datasets = {
            universities: [
                { name: '東京大学', location: '東京都', inception: '1877', website: 'https://www.u-tokyo.ac.jp/' },
                { name: '京都大学', location: '京都府', inception: '1897', website: 'https://www.kyoto-u.ac.jp/' },
                { name: '大阪大学', location: '大阪府', inception: '1931', website: 'https://www.osaka-u.ac.jp/' },
                { name: '東北大学', location: '宮城県', inception: '1907', website: 'https://www.tohoku.ac.jp/' },
                { name: '名古屋大学', location: '愛知県', inception: '1939', website: 'https://www.nagoya-u.ac.jp/' },
                { name: '九州大学', location: '福岡県', inception: '1911', website: 'https://www.kyushu-u.ac.jp/' },
                { name: '北海道大学', location: '北海道', inception: '1918', website: 'https://www.hokudai.ac.jp/' },
                { name: '筑波大学', location: '茨城県', inception: '1973', website: 'https://www.tsukuba.ac.jp/' },
                { name: '広島大学', location: '広島県', inception: '1929', website: 'https://www.hiroshima-u.ac.jp/' },
                { name: '神戸大学', location: '兵庫県', inception: '1949', website: 'https://www.kobe-u.ac.jp/' }
            ],
            prefectures: [
                { name: '北海道', location: '札幌市', inception: '1869' },
                { name: '青森県', location: '青森市', inception: '1871' },
                { name: '岩手県', location: '盛岡市', inception: '1876' },
                { name: '宮城県', location: '仙台市', inception: '1871' },
                { name: '秋田県', location: '秋田市', inception: '1871' },
                { name: '山形県', location: '山形市', inception: '1876' },
                { name: '福島県', location: '福島市', inception: '1876' },
                { name: '茨城県', location: '水戸市', inception: '1871' },
                { name: '栃木県', location: '宇都宮市', inception: '1873' },
                { name: '群馬県', location: '前橋市', inception: '1871' }
            ],
            mountains: [
                { name: '富士山', location: '静岡県・山梨県', inception: '約10万年前' },
                { name: '北岳', location: '山梨県', inception: '約300万年前' },
                { name: '奥穂高岳', location: '長野県・岐阜県', inception: '約1億年前' },
                { name: '間ノ岳', location: '山梨県・静岡県', inception: '約300万年前' },
                { name: '槍ヶ岳', location: '長野県', inception: '約1億年前' },
                { name: '悪沢岳', location: '静岡県', inception: '約300万年前' },
                { name: '赤石岳', location: '長野県・静岡県', inception: '約300万年前' },
                { name: '涸沢岳', location: '長野県', inception: '約1億年前' },
                { name: '北穂高岳', location: '長野県・岐阜県', inception: '約1億年前' },
                { name: '大喰岳', location: '長野県', inception: '約1億年前' }
            ],
            companies: [
                { name: 'トヨタ自動車', location: '愛知県', inception: '1937', website: 'https://www.toyota.co.jp/' },
                { name: 'ソニー', location: '東京都', inception: '1946', website: 'https://www.sony.com/' },
                { name: 'パナソニック', location: '大阪府', inception: '1918', website: 'https://www.panasonic.com/' },
                { name: '任天堂', location: '京都府', inception: '1889', website: 'https://www.nintendo.co.jp/' },
                { name: 'ホンダ', location: '東京都', inception: '1948', website: 'https://www.honda.co.jp/' },
                { name: '日産自動車', location: '神奈川県', inception: '1933', website: 'https://www.nissan-global.com/' },
                { name:'キヤノン', location: '東京都', inception: '1937', website: 'https://www.canon.co.jp/' },
                { name: '富士通', location: '東京都', inception: '1935', website: 'https://www.fujitsu.com/' },
                { name: 'NEC', location: '東京都', inception: '1899', website: 'https://www.nec.com/' },
                { name: 'ソフトバンク', location: '東京都', inception: '1981', website: 'https://www.softbank.jp/' }
            ]
        };
        
        return datasets[category] || [];
    }
    

    
    clearBatchResults() {
        if (confirm('一括検索の結果をクリアしますか？')) {
            this.batchResults = [];
            
            const tableBody = document.getElementById('batch-table-body');
            const tableHead = document.getElementById('batch-table-head');
            const canvas = document.getElementById('batch-stats-chart');
            
            if (tableBody) tableBody.innerHTML = '';
            if (tableHead) tableHead.innerHTML = '';
            
            // チャートを適切に破棄
            if (this.batchStatsChart) {
                this.batchStatsChart.destroy();
                this.batchStatsChart = null;
            }
            
            this.updateProgress(0, '準備中...');
            
            const csvBtn = document.getElementById('export-csv-btn');
            const jsonBtn = document.getElementById('export-json-btn');
            const clearBtn = document.getElementById('clear-results-btn');
            
            if (csvBtn) csvBtn.disabled = true;
            if (jsonBtn) jsonBtn.disabled = true;
            if (clearBtn) clearBtn.disabled = true;
            
            this.showNotification('結果をクリアしました', 'info');
        }
    }
}

// システム初期化
document.addEventListener('DOMContentLoaded', () => {
    window.factCheckSystem = new FactCheckSystem();
    window.factCheckSystem.init();
});