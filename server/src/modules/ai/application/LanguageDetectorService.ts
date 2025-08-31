import { createLogger } from '../../../shared/utils.js';

const logger = createLogger({ service: 'language-detector' });

/**
 * Language detection service
 * 
 * Detects user's language for STT/TTS locale selection
 * Uses multiple strategies for accuracy:
 * 1. Explicit language indicators in text
 * 2. Character set analysis
 * 3. Common word pattern matching
 * 4. Browser language hints (when available)
 */
export class LanguageDetectorService {
  private languagePatterns: Map<string, RegExp[]> = new Map();
  private commonWords: Map<string, string[]> = new Map();

  constructor() {
    this.initializePatterns();
  }

  /**
   * Detect language from text input
   */
  async detect(text: string, browserLanguage?: string): Promise<string> {
    logger.debug('Detecting language', { 
      textLength: text.length,
      browserLanguage 
    });

    // Normalize text for analysis
    const normalizedText = text.toLowerCase().trim();

    if (normalizedText.length === 0) {
      return browserLanguage || 'en-US';
    }

    // Try multiple detection strategies
    const candidates: Array<{ language: string; confidence: number }> = [];

    // 1. Pattern-based detection
    const patternResult = this.detectByPatterns(normalizedText);
    if (patternResult) {
      candidates.push(patternResult);
    }

    // 2. Common words detection
    const wordResult = this.detectByCommonWords(normalizedText);
    if (wordResult) {
      candidates.push(wordResult);
    }

    // 3. Character set analysis
    const charsetResult = this.detectByCharacterSet(normalizedText);
    if (charsetResult) {
      candidates.push(charsetResult);
    }

    // 4. Browser language as fallback with lower confidence
    if (browserLanguage) {
      candidates.push({
        language: browserLanguage,
        confidence: 0.3,
      });
    }

    // Select best candidate
    if (candidates.length === 0) {
      return 'en-US';
    }

    // Sort by confidence and return highest
    candidates.sort((a, b) => b.confidence - a.confidence);
    const detected = candidates[0];

    if (!detected) {
      logger.warn('No language detection candidates found, falling back to default');
      return 'en-US';
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
    let bestMatch: { language: string; confidence: number } | null = null;

    for (const [language, patterns] of this.languagePatterns) {
      let matches = 0;
      let totalPatterns = patterns.length;

      for (const pattern of patterns) {
        if (pattern.test(text)) {
          matches++;
        }
      }

      if (matches > 0) {
        const confidence = matches / totalPatterns;
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { language, confidence };
        }
      }
    }

    return bestMatch && bestMatch.confidence > 0.3 ? bestMatch : null;
  }

  /**
   * Detect language by common words
   */
  private detectByCommonWords(text: string): { language: string; confidence: number } | null {
    const words = text.split(/\s+/).filter(word => word.length > 2);
    
    if (words.length === 0) {
      return null;
    }

    let bestMatch: { language: string; confidence: number } | null = null;

    for (const [language, commonWords] of this.commonWords) {
      let matches = 0;

      for (const word of words) {
        if (commonWords.includes(word)) {
          matches++;
        }
      }

      if (matches > 0) {
        const confidence = matches / words.length;
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { language, confidence };
        }
      }
    }

    return bestMatch && bestMatch.confidence > 0.1 ? bestMatch : null;
  }

  /**
   * Detect language by character set patterns
   */
  private detectByCharacterSet(text: string): { language: string; confidence: number } | null {
    // Chinese characters
    if (/[\u4e00-\u9fff]/.test(text)) {
      const traditionalCount = (text.match(/[\u7e41\u9ad4\u4e2d\u6587]/g) || []).length;
      const simplifiedCount = (text.match(/[\u7b80\u4f53\u4e2d\u6587]/g) || []).length;
      
      if (traditionalCount > simplifiedCount) {
        return { language: 'zh-TW', confidence: 0.8 };
      } else {
        return { language: 'zh-CN', confidence: 0.8 };
      }
    }

    // Japanese characters (Hiragana, Katakana, Kanji)
    if (/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(text)) {
      return { language: 'ja-JP', confidence: 0.8 };
    }

    // Korean characters
    if (/[\uac00-\ud7af]/.test(text)) {
      return { language: 'ko-KR', confidence: 0.8 };
    }

    // Arabic script
    if (/[\u0600-\u06ff]/.test(text)) {
      return { language: 'ar-SA', confidence: 0.8 };
    }

    // Cyrillic script (Russian)
    if (/[\u0400-\u04ff]/.test(text)) {
      return { language: 'ru-RU', confidence: 0.7 };
    }

    // Latin script with accents (various European languages)
    if (/[àáâãäåçèéêëìíîïñòóôõöùúûüýÿ]/.test(text)) {
      // More specific detection could be added here
      return { language: 'es-ES', confidence: 0.5 }; // Default to Spanish for now
    }

    return null;
  }

  /**
   * Initialize language detection patterns and word lists
   */
  private initializePatterns(): void {
    // English patterns
    this.languagePatterns.set('en-US', [
      /\b(the|and|for|are|but|not|you|all|can|her|was|one|our|out|day|get|has|him|his|how|its|new|now|old|see|two|who|boy|did)\b/g,
      /\b(is|it|of|to|in|a|have|i|that|he|she|they|we|at|be|this|with|from|up|about|would|there)\b/g,
    ]);

    // Spanish patterns
    this.languagePatterns.set('es-ES', [
      /\b(el|la|de|que|y|a|en|un|es|se|no|te|lo|le|da|su|por|son|con|para|al|del|los|las)\b/g,
      /\b(está|este|hola|gracias|por favor|hasta luego|buenos días|buenas noches)\b/g,
    ]);

    // French patterns  
    this.languagePatterns.set('fr-FR', [
      /\b(le|de|et|à|un|il|être|et|en|avoir|que|pour|dans|ce|son|une|sur|avec|ne|se|pas|tout)\b/g,
      /\b(bonjour|merci|s'il vous plaît|au revoir|bonsoir|comment allez-vous)\b/g,
    ]);

    // German patterns
    this.languagePatterns.set('de-DE', [
      /\b(der|die|und|in|den|von|zu|das|mit|sich|des|auf|für|ist|im|dem|nicht|ein|eine|als|auch|es|an|werden|aus|er|hat|dass)\b/g,
      /\b(guten tag|danke|bitte|auf wiedersehen|guten morgen|gute nacht)\b/g,
    ]);

    // Portuguese patterns
    this.languagePatterns.set('pt-BR', [
      /\b(o|de|a|e|do|da|em|um|para|é|com|não|uma|os|no|se|na|por|mais|as|dos|como|mas|foi|ao|ele|das|tem|à|seu|sua|ou|ser|quando|muito|há|nos|já|está|eu|também|só|pelo|pela|até|isso|ela|entre|era|depois|sem|mesmo|aos|ter|seus|quem|nas|me|esse|eles|estão|você|tinha|foram|essa|num|nem|suas|meu|às|minha|têm|numa|pelos|elas|havia|seja|qual|será|nós|tenho|lhe|deles|essas|esses|pelas|este|fosse|dele)\b/g,
    ]);

    // Common words for each language
    this.commonWords.set('en-US', [
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one',
      'hello', 'thank', 'please', 'goodbye', 'morning', 'evening', 'night', 'good'
    ]);

    this.commonWords.set('es-ES', [
      'hola', 'gracias', 'por', 'favor', 'hasta', 'luego', 'buenos', 'días', 'buenas', 'noches',
      'el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'se', 'no', 'te', 'lo', 'le'
    ]);

    this.commonWords.set('fr-FR', [
      'bonjour', 'merci', 'vous', 'plaît', 'revoir', 'bonsoir', 'comment', 'allez',
      'le', 'de', 'et', 'à', 'un', 'il', 'être', 'avoir', 'que', 'pour', 'dans', 'ce'
    ]);

    this.commonWords.set('de-DE', [
      'guten', 'tag', 'danke', 'bitte', 'auf', 'wiedersehen', 'morgen', 'nacht',
      'der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich', 'des'
    ]);

    this.commonWords.set('pt-BR', [
      'olá', 'obrigado', 'obrigada', 'por', 'favor', 'tchau', 'bom', 'dia', 'boa', 'noite',
      'o', 'de', 'a', 'e', 'do', 'da', 'em', 'um', 'para', 'é', 'com', 'não', 'uma'
    ]);
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return [
      'en-US', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR',
      'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'ar-SA', 'ru-RU'
    ];
  }

  /**
   * Get language name from code
   */
  getLanguageName(code: string): string {
    const names: Record<string, string> = {
      'en-US': 'English (US)',
      'es-ES': 'Spanish',
      'fr-FR': 'French',
      'de-DE': 'German',
      'pt-BR': 'Portuguese (Brazil)',
      'zh-CN': 'Chinese (Simplified)',
      'zh-TW': 'Chinese (Traditional)',
      'ja-JP': 'Japanese',
      'ko-KR': 'Korean',
      'ar-SA': 'Arabic',
      'ru-RU': 'Russian',
    };

    return names[code] || code;
  }
}

// Export singleton instance
export const languageDetectorService = new LanguageDetectorService();