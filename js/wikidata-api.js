// Wikidata API処理モジュール

import { KNOWN_ENTITY_TYPES } from './config.js';

export class WikidataAPI {
    constructor() {
        this.searchCache = new Map();
        this.entityCache = new Map();
    }

    // ===========================================
    // エンティティ検索
    // ===========================================
    
    async searchEntities(query, limit = 10) {
        console.log('🔍 WikidataAPI.searchEntities called with query:', query, 'limit:', limit);
        
        if (!query || query.length < 2) return [];
        
        // キャッシュチェック
        const cacheKey = `${query}-${limit}`;
        if (this.searchCache.has(cacheKey)) {
            console.log('📋 Using cached results for:', query);
            return this.searchCache.get(cacheKey);
        }

        try {
            const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=ja&format=json&origin=*&limit=${limit}`;

            
            const response = await fetch(searchUrl);

            
            const data = await response.json();
            
            const results = data.search || [];
            
            // キャッシュに保存
            this.searchCache.set(cacheKey, results);
            
            return results;
        } catch (error) {
            console.error('Wikidata search error:', error);
            return [];
        }
    }

    // ===========================================
    // エンティティタイプ検索
    // ===========================================
    
    async searchEntityTypes(query) {
        if (!query || query.length < 2) return [];
        
        // 既知のエンティティタイプを優先
        const directMatch = KNOWN_ENTITY_TYPES[query.toLowerCase()];
        if (directMatch) {
            return [directMatch];
        }

        try {
            const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=ja&type=item&format=json&origin=*&limit=15`;
            
            const response = await fetch(searchUrl);
            const data = await response.json();
            
            if (data.search && data.search.length > 0) {
                return this.filterEntityTypeResults(data.search, query);
            }
            
            return [];
        } catch (error) {
            console.error('Entity type search error:', error);
            return [];
        }
    }

    filterEntityTypeResults(results, query) {
        return results.filter(item => {
            const desc = (item.description || '').toLowerCase();
            const label = (item.label || '').toLowerCase();
            
            // 既知の良いエンティティタイプを優先
            if (KNOWN_ENTITY_TYPES[label]) return true;
            
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
        }).slice(0, 10);
    }

    // ===========================================
    // エンティティ詳細取得
    // ===========================================
    
    async getEntityDetails(entityId) {
        if (!entityId) return null;
        
        // キャッシュチェック
        if (this.entityCache.has(entityId)) {
            return this.entityCache.get(entityId);
        }

        try {
            const detailsUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&languages=ja|en&format=json&origin=*`;
            
            const response = await fetch(detailsUrl);
            const data = await response.json();
            
            const entity = data.entities?.[entityId];
            
            if (entity) {
                // キャッシュに保存
                this.entityCache.set(entityId, entity);
            }
            
            return entity;
        } catch (error) {
            console.error('Failed to get entity details:', error);
            return null;
        }
    }

    // ===========================================
    // プロパティ値取得（複数対応）
    // ===========================================
    
    async getEntityProperties(entityId, properties) {
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
                        result[propConfig.id] = await this.processPropertyValue(
                            value, 
                            claim.mainsnak.datatype
                        );
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

    async processPropertyValue(value, datatype) {
        switch (datatype) {
            case 'wikibase-item':
                const itemId = value.id;
                const label = await this.resolveEntityLabel(itemId);
                return label || itemId;
                
            case 'time':
                return this.formatWikidataTime(value.time);
                
            case 'quantity':
                return value.amount.replace('+', '');
                
            case 'url':
                return value;
                
            default:
                return String(value);
        }
    }

    // ===========================================
    // SPARQL クエリ実行
    // ===========================================
    
    async executeSparqlQuery(query) {
        try {
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
        } catch (error) {
            console.error('SPARQL execution failed:', error);
            throw error;
        }
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

    // ===========================================
    // ユーティリティメソッド
    // ===========================================
    
    async resolveEntityLabel(entityId) {
        try {
            const entity = await this.getEntityDetails(entityId);
            
            if (entity?.labels) {
                // 日本語ラベル優先、次に英語、最後にID
                return entity.labels.ja?.value || 
                       entity.labels.en?.value || 
                       entityId;
            }
            
            return entityId;
        } catch (error) {
            console.error('Failed to resolve entity label:', error);
            return entityId;
        }
    }

    formatWikidataTime(timeString) {
        try {
            // Wikidataの時刻フォーマット: +1877-00-00T00:00:00Z
            const match = timeString.match(/^([+-])(\d{4})-(\d{2})-(\d{2})/);
            
            if (match) {
                const [, sign, year, month, day] = match;
                
                // 年のみの場合
                if (month === '00' && day === '00') {
                    return year;
                }
                
                // 年月の場合
                if (day === '00') {
                    return `${year}年${month}月`;
                }
                
                // 完全な日付の場合
                return `${year}年${month}月${day}日`;
            }
            
            return timeString;
        } catch (error) {
            console.error('Failed to format Wikidata time:', error);
            return timeString;
        }
    }

    formatCommaString(data, attributes) {
        // Wikidataデータをカンマ区切り文字列に変換（高橋さんの研究手法）
        return attributes.map(attr => {
            const value = data[attr];
            return value || '不明';
        }).join(',');
    }

    // ===========================================
    // SPARQL クエリ生成
    // ===========================================
    
    generateDynamicSPARQLQuery(entityTypeId, locationFilter = '', limit = 10, selectedAttributes = []) {
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
        
        // エンティティタイプの指定
        if (this.isKnownEntityType(entityTypeId)) {
            query += `    ?item wdt:P31/wdt:P279* wd:${entityTypeId} .\n`;
        } else {
            query += `    ?item wdt:P31 wd:${entityTypeId} .\n`;
        }
        
        // 地域フィルタ
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
        const knownTypes = ['Q3918', 'Q8502', 'Q4830453', 'Q515', 'Q6256', 'Q4022'];
        return knownTypes.includes(entityTypeId);
    }
}