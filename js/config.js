// ファクトチェックシステム - 設定とマスターデータ

// デフォルト設定
export const DEFAULT_SETTINGS = {
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

// API料金表
export const API_COSTS = {
    'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-5': { input: 0.10, output: 0.30 }
};

// 利用可能モデル一覧
export const AVAILABLE_MODELS = [
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: '高速・低コスト' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'バランス型' },
    { id: 'gpt-4o', name: 'GPT-4o', description: '高性能' },
    { id: 'gpt-4', name: 'GPT-4', description: '最高品質' },
    { id: 'gpt-5', name: 'GPT-5', description: '次世代AI（Preview）' }
];

// 属性ラベル
export const ATTRIBUTE_LABELS = {
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
    
    // 物理属性
    height: "高さ",
    width: "幅",
    length: "長さ",
    area: "面積",
    volume: "体積",
    weight: "重量",
    elevation: "標高",
    depth: "深さ",
    
    // 人物属性
    occupation: "職業",
    nationality: "国籍",
    alma_mater: "出身校",
    spouse: "配偶者",
    children: "子供",
    parents: "両親",
    
    // 組織属性
    founded_by: "創設者",
    headquarters: "本社所在地",
    employees: "従業員数",
    revenue: "収益",
    industry: "業界",
    ceo: "CEO",
    
    // 地理属性
    population: "人口",
    capital: "首都",
    currency: "通貨",
    official_language: "公用語",
    time_zone: "タイムゾーン",
    
    // 作品属性
    director: "監督",
    author: "作者",
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

// エンティティタイプ別推奨属性
export const ENTITY_TYPE_ATTRIBUTES = {
    // 人物 (Q5)
    'Q5': ['birth_date', 'death_date', 'occupation', 'nationality', 'educated_at', 'notable_work'],
    
    // 大学 (Q3918)
    'Q3918': ['inception', 'location', 'student_count', 'faculty_count', 'official_website'],
    
    // 企業 (Q4830453)
    'Q4830453': ['inception', 'founded_by', 'headquarters', 'industry', 'employees', 'revenue', 'official_website'],
    
    // 映画 (Q11424)
    'Q11424': ['director', 'publication_date', 'genre', 'duration', 'cast'],
    
    // 書籍 (Q571)
    'Q571': ['author', 'publication_date', 'genre', 'publisher', 'language'],
    
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

// プロンプトパターン
export const PROMPT_PATTERNS = {
    direct: "{entity}の{attribute}を教えてください。",
    polite: "恐れ入りますが、{entity}の{attribute}を教えていただけますでしょうか。", 
    accuracy: "正確な情報として、{entity}の{attribute}を詳細に確認して教えてください。",
    reliability: "信頼できる情報源に基づいて、{entity}の{attribute}を根拠と共に教えてください。",
    detailed: "{entity}の{attribute}について、詳細な調査と背景情報を含めて教えてください。"
};

// 既知のエンティティタイプ（直接マッピング）
export const KNOWN_ENTITY_TYPES = {
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

// カテゴリ別検証可能属性
export const CATEGORY_ATTRIBUTES = {
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

// 地域フィルター
export const LOCATION_NAMES = {
    'Q17': '日本',
    'Q30': 'アメリカ', 
    'Q29': 'スペイン',
    'Q142': 'フランス',
    'Q183': 'ドイツ',
    'Q145': 'イギリス',
    'Q148': '中国',
    'Q668': 'インド'
};