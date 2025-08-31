import { createLogger } from '../../../../shared/utils.js';

const logger = createLogger({ service: 'language-detection' });

export interface LanguageGuess {
  tag: string;           // BCP-47
  confidence: number;    // 0..1
  script?: string;       // e.g., Latn, Cyrl
  isReliable: boolean;
}

export interface LanguageDetectionConfig {
  minConfidence: number;
  fallbackLocale: string;
  enablePatternMatching: boolean;
  enableWordAnalysis: boolean;
  enableCharacterAnalysis: boolean;
}

/**
 * Language detection service using multiple strategies
 * Detects query language, normalizes to BCP-47 tags, and routes to appropriate locale
 * 
 * Supports multiple detection strategies:
 * - Pattern matching (URLs, emails, etc.)
 * - Common words analysis
 * - Character set analysis
 * - Script detection
 */
export class LanguageDetectionService {
  private config: LanguageDetectionConfig;
  
  // Language patterns for pattern-based detection
  private readonly LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
    'tr-TR': [
      /\b(merhaba|selam|nasılsın|teşekkür|lütfen|evet|hayır)\b/i,
      /[çğıöşü]/,
      /\b(ve|veya|ile|için|olan|olan)\b/i,
    ],
    'en-US': [
      /\b(hello|hi|thank|please|yes|no|the|and|or|with)\b/i,
      /\b(what|where|when|how|why|who)\b/i,
    ],
    'es-ES': [
      /\b(hola|gracias|por favor|sí|no|el|la|y|o|con)\b/i,
      /\b(qué|dónde|cuándo|cómo|por qué|quién)\b/i,
      /[ñáéíóú]/,
    ],
    'fr-FR': [
      /\b(bonjour|merci|s'il vous plaît|oui|non|le|la|et|ou|avec)\b/i,
      /\b(qu|où|quand|comment|pourquoi|qui)\b/i,
      /[àâäéèêëïîôöùûüÿç]/,
    ],
    'de-DE': [
      /\b(hallo|danke|bitte|ja|nein|der|die|und|oder|mit)\b/i,
      /\b(was|wo|wann|wie|warum|wer)\b/i,
      /[äöüß]/,
    ],
    'it-IT': [
      /\b(ciao|grazie|per favore|sì|no|il|la|e|o|con)\b/i,
      /\b(cosa|dove|quando|come|perché|chi)\b/i,
      /[àèéìíîòóù]/,
    ],
    'pt-PT': [
      /\b(olá|obrigado|por favor|sim|não|o|a|e|ou|com)\b/i,
      /\b(o que|onde|quando|como|por que|quem)\b/i,
      /[ãáâàçéêíóôõú]/,
    ],
    'ru-RU': [
      /[абвгдеёжзийклмнопрстуфхцчшщъыьэюя]/i,
      /\b(привет|спасибо|пожалуйста|да|нет)\b/i,
    ],
    'ja-JP': [
      /[ひらがなカタカナ漢字]/,
      /[あ-んア-ンー一-龯]/,
    ],
    'ko-KR': [
      /[가-힣]/,
      /[ㄱ-ㅎㅏ-ㅣ]/,
    ],
    'zh-CN': [
      /[一-龯]/,
      /\b(你好|谢谢|请|是|不)\b/,
    ],
    'ar-SA': [
      /[ا-ي]/,
      /\b(مرحبا|شكرا|من فضلك|نعم|لا)\b/,
    ],
  };

  // Common words by language
  private readonly COMMON_WORDS: Record<string, string[]> = {
    'en-US': ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'],
    'tr-TR': ['ve', 'veya', 'ile', 'için', 'olan', 'bu', 'şu', 'o', 'bir', 'de', 'da', 'ki'],
    'es-ES': ['el', 'la', 'y', 'o', 'pero', 'en', 'con', 'para', 'de', 'que', 'es', 'un'],
    'fr-FR': ['le', 'la', 'et', 'ou', 'mais', 'dans', 'avec', 'pour', 'de', 'que', 'est', 'un'],
    'de-DE': ['der', 'die', 'das', 'und', 'oder', 'aber', 'in', 'mit', 'für', 'von', 'zu', 'ein'],
    'it-IT': ['il', 'la', 'e', 'o', 'ma', 'in', 'con', 'per', 'di', 'che', 'è', 'un'],
    'pt-PT': ['o', 'a', 'e', 'ou', 'mas', 'em', 'com', 'para', 'de', 'que', 'é', 'um'],
  };

  // Supported languages
  private readonly SUPPORTED_LANGUAGES = [
    'en-US', 'tr-TR', 'es-ES', 'fr-FR', 'de-DE', 
    'it-IT', 'pt-PT', 'ru-RU', 'ja-JP', 'ko-KR', 
    'zh-CN', 'ar-SA'
  ];

  constructor(config: Partial<LanguageDetectionConfig> = {}) {
    this.config = {
      minConfidence: config.minConfidence || 0.6,
      fallbackLocale: config.fallbackLocale || 'en-US',
      enablePatternMatching: config.enablePatternMatching !== false,
      enableWordAnalysis: config.enableWordAnalysis !== false,
      enableCharacterAnalysis: config.enableCharacterAnalysis !== false,
    };

    logger.info('Language Detection Service initialized', { config: this.config });
  }

  /**
   * Detect language from text with multiple strategies
   */
  async detect(text: string, browserLanguage?: string): Promise<string> {
    if (!text?.trim()) {
      logger.warn('Empty text provided for language detection');
      return this.config.fallbackLocale;
    }

    const normalizedText = text.toLowerCase().trim();
    
    // If text is very short, use browser language as hint
    if (normalizedText.length < 10 && browserLanguage) {
      const normalizedBrowserLang = this.normalizeTag(browserLanguage);
      if (this.SUPPORTED_LANGUAGES.includes(normalizedBrowserLang)) {
        logger.info('Using browser language for short text', {
          text: normalizedText,
          browserLanguage: normalizedBrowserLang,
        });
        return normalizedBrowserLang;
      }
    }

    const candidates: Array<{ language: string; confidence: number }> = [];

    // Strategy 1: Pattern matching
    if (this.config.enablePatternMatching) {
      const patternResult = this.detectByPatterns(normalizedText);
      if (patternResult) {
        candidates.push(patternResult);
      }
    }

    // Strategy 2: Common words analysis
    if (this.config.enableWordAnalysis) {
      const wordResult = this.detectByCommonWords(normalizedText);
      if (wordResult) {
        candidates.push(wordResult);
      }
    }

    // Strategy 3: Character set analysis
    if (this.config.enableCharacterAnalysis) {
      const charResult = this.detectByCharacterSet(normalizedText);
      if (charResult) {
        candidates.push(charResult);
      }
    }

    // If no candidates found, return fallback
    if (candidates.length === 0) {
      logger.warn('No language candidates found, using fallback', {
        text: normalizedText.substring(0, 50),
        fallback: this.config.fallbackLocale,
      });
      return this.config.fallbackLocale;
    }

    // Sort by confidence and return highest
    candidates.sort((a, b) => b.confidence - a.confidence);
    const detected = candidates[0];

    if (!detected) {
      logger.warn('No language detection candidates found, falling back to default');
      return this.config.fallbackLocale;
    }

    // Check if confidence meets minimum threshold
    if (detected.confidence < this.config.minConfidence) {
      logger.info('Detection confidence below threshold, using fallback', {
        detected: detected.language,
        confidence: detected.confidence,
        threshold: this.config.minConfidence,
        fallback: this.config.fallbackLocale,
      });
      return this.config.fallbackLocale;
    }

    logger.info('Language detected', {
      language: detected.language,
      confidence: detected.confidence,
      candidateCount: candidates.length
    });

    return detected.language;
  }

  /**
   * Detect language using regex patterns
   */
  private detectByPatterns(text: string): { language: string; confidence: number } | null {
    const scores: Record<string, number> = {};

    for (const [language, patterns] of Object.entries(this.LANGUAGE_PATTERNS)) {
      let matchCount = 0;
      let totalMatches = 0;

      for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) {
          matchCount++;
          totalMatches += matches.length;
        }
      }

      if (matchCount > 0) {
        // Score based on pattern matches and frequency
        scores[language] = (matchCount / patterns.length) * 0.7 + 
                          Math.min(totalMatches / 10, 0.3);
      }
    }

    const bestMatch = Object.entries(scores).reduce(
      (best, [lang, score]) => score > best.score ? { language: lang, score } : best,
      { language: '', score: 0 }
    );

    return bestMatch.score > 0 ? {
      language: bestMatch.language,
      confidence: Math.min(bestMatch.score, 1.0)
    } : null;
  }

  /**
   * Detect language using common words
   */
  private detectByCommonWords(text: string): { language: string; confidence: number } | null {
    const words = text.split(/\s+/).filter(word => word.length > 1);
    if (words.length === 0) return null;

    const scores: Record<string, number> = {};

    for (const [language, commonWords] of Object.entries(this.COMMON_WORDS)) {
      let matchCount = 0;

      for (const word of words) {
        if (commonWords.includes(word.toLowerCase())) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        scores[language] = matchCount / words.length;
      }
    }

    const bestMatch = Object.entries(scores).reduce(
      (best, [lang, score]) => score > best.score ? { language: lang, score } : best,
      { language: '', score: 0 }
    );

    return bestMatch.score > 0 ? {
      language: bestMatch.language,
      confidence: Math.min(bestMatch.score * 2, 1.0) // Boost confidence for word matches
    } : null;
  }

  /**
   * Detect language using character set analysis
   */
  private detectByCharacterSet(text: string): { language: string; confidence: number } | null {
    const scores: Record<string, number> = {};

    // Cyrillic detection
    const cyrillicRatio = (text.match(/[а-яё]/gi) || []).length / text.length;
    if (cyrillicRatio > 0.3) {
      scores['ru-RU'] = cyrillicRatio;
    }

    // Arabic detection
    const arabicRatio = (text.match(/[ا-ي]/g) || []).length / text.length;
    if (arabicRatio > 0.3) {
      scores['ar-SA'] = arabicRatio;
    }

    // CJK detection
    const cjkRatio = (text.match(/[一-龯ひらがなカタカナ가-힣]/g) || []).length / text.length;
    if (cjkRatio > 0.1) {
      // Distinguish between Chinese, Japanese, Korean
      const hanziRatio = (text.match(/[一-龯]/g) || []).length / text.length;
      const hiraganaRatio = (text.match(/[あ-ん]/g) || []).length / text.length;
      const katakanaRatio = (text.match(/[ア-ン]/g) || []).length / text.length;
      const hangulRatio = (text.match(/[가-힣]/g) || []).length / text.length;

      if (hangulRatio > 0.1) {
        scores['ko-KR'] = hangulRatio + cjkRatio;
      } else if (hiraganaRatio > 0.05 || katakanaRatio > 0.05) {
        scores['ja-JP'] = hiraganaRatio + katakanaRatio + hanziRatio;
      } else if (hanziRatio > 0.1) {
        scores['zh-CN'] = hanziRatio;
      }
    }

    // Turkish detection (specific characters)
    const turkishRatio = (text.match(/[çğıöşü]/gi) || []).length / text.length;
    if (turkishRatio > 0.02) {
      scores['tr-TR'] = Math.min(turkishRatio * 10, 0.8);
    }

    const bestMatch = Object.entries(scores).reduce(
      (best, [lang, score]) => score > best.score ? { language: lang, score } : best,
      { language: '', score: 0 }
    );

    return bestMatch.score > 0 ? {
      language: bestMatch.language,
      confidence: Math.min(bestMatch.score, 1.0)
    } : null;
  }

  /**
   * Normalize language tag to BCP-47 format
   */
  normalizeTag(tag: string): string {
    if (!tag) return this.config.fallbackLocale;

    // Common mappings
    const mappings: Record<string, string> = {
      'en': 'en-US',
      'tr': 'tr-TR',
      'es': 'es-ES',
      'fr': 'fr-FR',
      'de': 'de-DE',
      'it': 'it-IT',
      'pt': 'pt-PT',
      'ru': 'ru-RU',
      'ja': 'ja-JP',
      'ko': 'ko-KR',
      'zh': 'zh-CN',
      'ar': 'ar-SA',
    };

    const normalized = tag.toLowerCase().replace('_', '-');
    
    // Check if already properly formatted
    if (this.SUPPORTED_LANGUAGES.includes(normalized)) {
      return normalized;
    }

    // Check mappings
    const baseLanguage = normalized.split('-')[0];
    if (mappings[baseLanguage]) {
      return mappings[baseLanguage];
    }

    // Try to find in supported languages
    const found = this.SUPPORTED_LANGUAGES.find(lang => 
      lang.toLowerCase().startsWith(baseLanguage)
    );

    return found || this.config.fallbackLocale;
  }

  /**
   * Get list of supported languages
   */
  getSupportedLanguages(): string[] {
    return [...this.SUPPORTED_LANGUAGES];
  }

  /**
   * Get language information
   */
  getLanguageInfo(tag: string): {
    name: string;
    nativeName: string;
    direction: 'ltr' | 'rtl';
    script: string;
  } | null {
    const info: Record<string, any> = {
      'en-US': { name: 'English', nativeName: 'English', direction: 'ltr', script: 'Latn' },
      'tr-TR': { name: 'Turkish', nativeName: 'Türkçe', direction: 'ltr', script: 'Latn' },
      'es-ES': { name: 'Spanish', nativeName: 'Español', direction: 'ltr', script: 'Latn' },
      'fr-FR': { name: 'French', nativeName: 'Français', direction: 'ltr', script: 'Latn' },
      'de-DE': { name: 'German', nativeName: 'Deutsch', direction: 'ltr', script: 'Latn' },
      'it-IT': { name: 'Italian', nativeName: 'Italiano', direction: 'ltr', script: 'Latn' },
      'pt-PT': { name: 'Portuguese', nativeName: 'Português', direction: 'ltr', script: 'Latn' },
      'ru-RU': { name: 'Russian', nativeName: 'Русский', direction: 'ltr', script: 'Cyrl' },
      'ja-JP': { name: 'Japanese', nativeName: '日本語', direction: 'ltr', script: 'Jpan' },
      'ko-KR': { name: 'Korean', nativeName: '한국어', direction: 'ltr', script: 'Kore' },
      'zh-CN': { name: 'Chinese', nativeName: '中文', direction: 'ltr', script: 'Hans' },
      'ar-SA': { name: 'Arabic', nativeName: 'العربية', direction: 'rtl', script: 'Arab' },
    };

    return info[tag] || null;
  }
}

// Export singleton instance
export const languageDetectionService = new LanguageDetectionService();