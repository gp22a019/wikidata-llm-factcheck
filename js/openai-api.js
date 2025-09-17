// OpenAI API処理モジュール

import { API_COSTS } from './config.js';

export class OpenAIAPI {
    constructor(factCheckSystem) {
        this.factCheckSystem = factCheckSystem;
    }

    // ===========================================
    // APIキー検証
    // ===========================================
    
    validateApiKey(apiKey) {
        if (!apiKey) return false;
        
        // 新しいOpenAI APIキーフォーマット対応
        const validPrefixes = ['sk-', 'sk-proj-', 'sk-org-'];
        const hasValidPrefix = validPrefixes.some(prefix => apiKey.startsWith(prefix));
        
        if (!hasValidPrefix) return false;
        
        // 長さチェック（40-200文字）
        if (apiKey.length < 40 || apiKey.length > 200) return false;
        
        // ASCII文字、ハイフン、アンダースコアのみ
        const validCharPattern = /^[A-Za-z0-9\-_]+$/;
        return validCharPattern.test(apiKey);
    }

    async testApiKey(apiKey = null) {
        const key = apiKey || this.factCheckSystem.settings.openaiApiKey;
        
        if (!this.validateApiKey(key)) {
            throw new Error('無効なAPIキー形式です');
        }

        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                return { success: true, message: 'APIキーが有効です' };
            } else if (response.status === 401) {
                throw new Error('APIキーが無効です');
            } else {
                throw new Error(`API接続エラー: ${response.status}`);
            }
        } catch (error) {
            console.error('API test failed:', error);
            throw error;
        }
    }

    // ===========================================
    // 使用量制限チェック
    // ===========================================
    
    checkUsageLimits() {
        const usage = this.factCheckSystem.usage;
        const settings = this.factCheckSystem.settings;
        
        // 日付リセットチェック
        const currentDay = new Date().toDateString();
        if (usage.lastDayReset !== currentDay) {
            usage.daily = 0;
            usage.lastDayReset = currentDay;
        }
        
        // 時間リセットチェック
        const currentHour = new Date().getHours();
        if (usage.lastHourReset !== currentHour) {
            usage.hourly = 0;
            usage.lastHourReset = currentHour;
        }
        
        // 制限チェック（オーバーライドされていない場合）
        if (!usage.dailyLimitOverride && usage.daily >= settings.dailyLimit) {
            throw new Error(`1日の使用上限（${settings.dailyLimit}回）に達しました`);
        }
        
        if (!usage.hourlyLimitOverride && usage.hourly >= settings.hourlyLimit) {
            throw new Error(`1時間の使用上限（${settings.hourlyLimit}回）に達しました`);
        }
        
        return true;
    }

    updateUsageCount() {
        const usage = this.factCheckSystem.usage;
        
        usage.daily++;
        usage.hourly++;
        usage.totalApiCalls++;
        usage.totalDailyCalls++;
        usage.totalHourlyCalls++;
        
        this.factCheckSystem.saveUsage();
        this.factCheckSystem.updateUsageDisplay();
    }

    calculateCost(model, inputTokens, outputTokens) {
        const costs = API_COSTS[model];
        if (!costs) return 0;
        
        const inputCost = (inputTokens / 1000) * costs.input;
        const outputCost = (outputTokens / 1000) * costs.output;
        
        return inputCost + outputCost;
    }

    // ===========================================
    // API呼び出し
    // ===========================================
    
    async callAPI(prompt) {
        const settings = this.factCheckSystem.settings;
        
        // 使用量制限チェック
        this.checkUsageLimits();
        
        // 確認ダイアログ（設定されている場合）
        if (settings.confirmBeforeApi) {
            const cost = this.estimateCost(prompt, settings.llmModel);
            const confirmed = confirm(
                `OpenAI APIを実行しますか？\n` +
                `モデル: ${settings.llmModel}\n` +
                `推定コスト: $${cost.toFixed(4)}\n` +
                `今日の使用回数: ${this.factCheckSystem.usage.daily}/${settings.dailyLimit}`
            );
            
            if (!confirmed) {
                throw new Error('ユーザーによってキャンセルされました');
            }
        }

        try {
            // モデル別のパラメータ構成
            const requestBody = {
                model: settings.llmModel,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            };

            // 新しいAPIではmax_completion_tokensを使用
            requestBody.max_completion_tokens = 500;

            // モデル別のtemperature設定
            // GPT-4o, GPT-4o-mini, GPT-5: temperatureデフォルト値(1)のみサポート
            // GPT-3.5-turbo, GPT-4: カスタムtemperature値サポート
            if (settings.llmModel.includes('gpt-4o') || 
                settings.llmModel === 'gpt-5') {
                // temperatureパラメータを省略してデフォルト値(1)を使用
                console.log(`モデル ${settings.llmModel} はtemperatureデフォルト値を使用します`);
            } else {
                // 従来のモデルはカスタムtemperature値を設定
                requestBody.temperature = 0.1;
                console.log(`モデル ${settings.llmModel} はtemperature=0.1を使用します`);
            }

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${settings.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            
            // 使用量を更新
            this.updateUsageCount();
            
            // コストを計算・追加
            if (data.usage) {
                const cost = this.calculateCost(
                    settings.llmModel,
                    data.usage.prompt_tokens,
                    data.usage.completion_tokens
                );
                
                this.factCheckSystem.usage.totalCost += cost;
                this.factCheckSystem.saveUsage();
                this.factCheckSystem.updateUsageDisplay();
            }
            
            return data.choices[0]?.message?.content || '';
            
        } catch (error) {
            console.error('OpenAI API call failed:', error);
            throw error;
        }
    }

    estimateCost(prompt, model) {
        // 簡易的なトークン数推定（1トークン ≈ 4文字）
        const estimatedTokens = Math.ceil(prompt.length / 4);
        const costs = API_COSTS[model];
        
        if (!costs) return 0;
        
        return (estimatedTokens / 1000) * costs.input + 
               (estimatedTokens / 1000) * costs.output;
    }

    // ===========================================
    // 高橋さんの手法：カンマ区切り質問
    // ===========================================
    
    async queryWithCommaFormat(entityName, attributes) {
        // 属性を日本語ラベルに変換
        const attributeLabels = attributes.map(attr => 
            this.factCheckSystem.attributeLabels[attr] || attr
        );
        
        // カンマ区切り形式での質問（高橋さんの研究手法）
        const prompt = `${entityName}について以下の情報を正確にカンマ区切りで答えてください：

${attributeLabels.join('、')}

回答形式例：1877年,東京都文京区,https://www.u-tokyo.ac.jp/
重要：各項目をカンマで区切り、余分な説明は付けないでください。不明な場合は「不明」と記載してください。`;

        try {
            const response = await this.callAPI(prompt);
            return this.parseLLMResponse(response, attributes);
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

    // ===========================================
    // 使用量制限管理
    // ===========================================
    
    overrideLimits() {
        const usage = this.factCheckSystem.usage;
        
        usage.dailyLimitOverride = true;
        usage.hourlyLimitOverride = true;
        usage.overrideTimestamp = new Date().toISOString();
        
        this.factCheckSystem.saveUsage();
        this.factCheckSystem.updateUsageDisplay();
        
        this.factCheckSystem.showNotification(
            '使用制限を一時的に解除しました（データは保持されます）', 
            'success'
        );
    }

    restoreLimits() {
        const usage = this.factCheckSystem.usage;
        
        usage.dailyLimitOverride = false;
        usage.hourlyLimitOverride = false;
        usage.overrideTimestamp = null;
        
        this.factCheckSystem.saveUsage();
        this.factCheckSystem.updateUsageDisplay();
        
        this.factCheckSystem.showNotification(
            '使用制限を復元しました', 
            'info'
        );
    }

    resetUsage() {
        if (!confirm('使用量統計をリセットしますか？この操作は取り消せません。')) {
            return;
        }
        
        const usage = this.factCheckSystem.usage;
        
        // 基本カウンターのみリセット（累計は保持）
        usage.daily = 0;
        usage.hourly = 0;
        usage.totalCost = 0;
        usage.lastDayReset = new Date().toDateString();
        usage.lastHourReset = new Date().getHours();
        
        this.factCheckSystem.saveUsage();
        this.factCheckSystem.updateUsageDisplay();
        
        this.factCheckSystem.showNotification(
            '使用量統計をリセットしました', 
            'success'
        );
    }
}