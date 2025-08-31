/**
 * Simple Integration Tests for SiteSpeak Backend
 */

import { describe, test, expect } from '@jest/globals';
import { languageDetectorService } from '../modules/ai/application/LanguageDetectorService';

describe('Simple Integration Tests', () => {
  describe('Language Detector Service', () => {
    test('should detect English', async () => {
      const result = await languageDetectorService.detect('Hello world, this is an English sentence.');
      expect(result).toBe('en-US');
    });

    test('should detect Spanish', async () => {
      const result = await languageDetectorService.detect('Hola mundo, esta es una oración en español.');
      expect(result).toBe('es-ES');
    });

    test('should handle empty input gracefully', async () => {
      const result = await languageDetectorService.detect('');
      expect(result).toBe('en-US'); // Default fallback
    });

    test('should return supported languages list', () => {
      const languages = languageDetectorService.getSupportedLanguages();
      expect(languages).toContain('en-US');
      expect(languages).toContain('es-ES');
      expect(languages).toContain('fr-FR');
      expect(languages.length).toBeGreaterThan(5);
    });
  });
});