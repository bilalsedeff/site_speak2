/**
 * Command Palette Service
 *
 * Visual command browsing and help system that provides a comprehensive
 * interface for discovering and executing voice commands. Supports search,
 * filtering, categorization, and help integration.
 *
 * Features:
 * - Full command catalog with search and filtering
 * - Category-based organization and navigation
 * - Keyboard shortcuts and accessibility support
 * - Recent and popular command tracking
 * - Contextual help and examples
 * - Voice command integration
 * - Performance optimized with virtualization
 */

import {
  CommandPaletteConfig,
  CommandPaletteState,
  CommandGroup,
  CommandSuggestion,
  SuggestionCategory,
  UserSuggestionProfile,
  SuggestionContext
} from '@shared/types/suggestion.types';

interface CommandCatalog {
  allCommands: CommandSuggestion[];
  groups: CommandGroup[];
  recentCommands: CommandSuggestion[];
  popularCommands: CommandSuggestion[];
  favoriteCommands: CommandSuggestion[];
}

interface SearchResult {
  commands: CommandSuggestion[];
  searchTime: number;
  totalResults: number;
  hasMore: boolean;
}

export class CommandPaletteService {
  private state: CommandPaletteState;
  private config: CommandPaletteConfig;
  private catalog: CommandCatalog;
  private searchCache = new Map<string, SearchResult>();
  private userProfile: UserSuggestionProfile | null = null;

  constructor(config: Partial<CommandPaletteConfig> = {}) {
    this.config = {
      enableSearch: true,
      enableCategories: true,
      enableKeyboardShortcuts: true,
      enableHelp: true,
      showRecentCommands: true,
      showPopularCommands: true,
      maxRecentCommands: 10,
      maxPopularCommands: 8,
      ...config
    };

    this.state = {
      isOpen: false,
      searchQuery: '',
      filteredCommands: [],
      recentCommands: [],
      popularCommands: [],
      helpVisible: false
    };

    this.catalog = {
      allCommands: [],
      groups: [],
      recentCommands: [],
      popularCommands: [],
      favoriteCommands: []
    };

    this.initializeDefaultCommands();
  }

  /**
   * Open command palette with optional initial state
   */
  async openPalette(options: {
    searchQuery?: string;
    category?: SuggestionCategory;
    context?: SuggestionContext;
  } = {}): Promise<void> {
    this.state.isOpen = true;

    if (options.searchQuery) {
      this.state.searchQuery = options.searchQuery;
      await this.updateSearchQuery(options.searchQuery);
    }

    if (options.category) {
      this.selectCategory(options.category);
    }

    if (!options.searchQuery && !options.category) {
      this.state.filteredCommands = this.getDefaultView();
    }

    this.notifyStateChange();
  }

  /**
   * Close command palette
   */
  closePalette(): void {
    this.state.isOpen = false;
    this.state.searchQuery = '';
    delete this.state.selectedCategory;
    delete this.state.selectedCommandId;
    this.state.helpVisible = false;
    this.notifyStateChange();
  }

  /**
   * Search commands with fuzzy matching and ranking
   */
  async searchCommands(query: string): Promise<SearchResult> {
    const startTime = performance.now();

    // Check cache first
    const cacheKey = query.toLowerCase().trim();
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) {
      const result = {
        commands: this.getDefaultView(),
        searchTime: performance.now() - startTime,
        totalResults: this.catalog.allCommands.length,
        hasMore: false
      };
      return result;
    }

    // Perform multi-faceted search
    const results = this.catalog.allCommands
      .map(command => ({
        command,
        score: this.calculateSearchScore(command, normalizedQuery)
      }))
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(result => result.command);

    const searchResult = {
      commands: results.slice(0, 50), // Limit results for performance
      searchTime: performance.now() - startTime,
      totalResults: results.length,
      hasMore: results.length > 50
    };

    // Cache the result
    this.searchCache.set(cacheKey, searchResult);

    // Cleanup cache if it gets too large
    if (this.searchCache.size > 100) {
      const firstKey = this.searchCache.keys().next().value;
      if (firstKey) {
        this.searchCache.delete(firstKey);
      }
    }

    return searchResult;
  }

  /**
   * Update search query and perform search
   */
  async updateSearchQuery(query: string): Promise<void> {
    this.state.searchQuery = query;

    const searchResult = await this.searchCommands(query);
    this.state.filteredCommands = searchResult.commands;

    this.notifyStateChange();
  }

  /**
   * Select a category and filter commands
   */
  selectCategory(category: SuggestionCategory | undefined): void {
    if (category) {
      this.state.selectedCategory = category;
    } else {
      delete this.state.selectedCategory;
    }

    if (category) {
      this.state.filteredCommands = this.catalog.allCommands.filter(
        command => command.category === category
      );
    } else {
      this.state.filteredCommands = this.getDefaultView();
    }

    this.notifyStateChange();
  }

  /**
   * Select a specific command
   */
  selectCommand(commandId: string): void {
    this.state.selectedCommandId = commandId;
    this.notifyStateChange();
  }

  /**
   * Execute a command and track usage
   */
  executeCommand(command: CommandSuggestion): void {
    // Track command usage
    this.trackCommandUsage(command);

    // Update recent commands
    this.addToRecentCommands(command);

    // Close palette after execution
    this.closePalette();

    // Notify external handlers
    this.notifyCommandExecution(command);
  }

  /**
   * Add commands to the catalog
   */
  addCommands(commands: CommandSuggestion[]): void {
    // Add new commands to catalog
    this.catalog.allCommands.push(...commands);

    // Deduplicate commands
    this.catalog.allCommands = this.deduplicateCommands(this.catalog.allCommands);

    // Update groups
    this.updateGroups();

    // Update popular commands
    this.updatePopularCommands();

    // Clear search cache
    this.searchCache.clear();
  }

  /**
   * Set user profile for personalization
   */
  setUserProfile(profile: UserSuggestionProfile): void {
    this.userProfile = profile;

    // Update recent commands from profile
    if (profile.learningData.commandHistory.length > 0) {
      const recentFromHistory = profile.learningData.commandHistory
        .slice(-this.config.maxRecentCommands)
        .map(history => this.findCommandByText(history.command))
        .filter(Boolean) as CommandSuggestion[];

      this.catalog.recentCommands = recentFromHistory;
      this.state.recentCommands = recentFromHistory;
    }

    // Update popular commands based on frequency
    this.updatePopularCommandsFromProfile();

    this.notifyStateChange();
  }

  /**
   * Toggle help view
   */
  toggleHelp(): void {
    this.state.helpVisible = !this.state.helpVisible;
    this.notifyStateChange();
  }

  /**
   * Get current palette state
   */
  getState(): CommandPaletteState {
    return { ...this.state };
  }

  /**
   * Get command groups for category navigation
   */
  getGroups(): CommandGroup[] {
    return this.catalog.groups;
  }

  /**
   * Get help content for the palette
   */
  getHelpContent(): {
    title: string;
    sections: Array<{
      title: string;
      content: string;
      examples?: string[];
    }>;
  } {
    return {
      title: 'Voice Command Help',
      sections: [
        {
          title: 'Getting Started',
          content: 'Use voice commands to navigate and interact with the website. Simply speak naturally and the system will understand your intent.',
          examples: [
            'Go to the home page',
            'Search for products',
            'Click the submit button'
          ]
        },
        {
          title: 'Navigation Commands',
          content: 'Navigate around the website using voice commands.',
          examples: [
            'Go to [page name]',
            'Navigate to [section]',
            'Scroll to [element]',
            'Open the menu'
          ]
        },
        {
          title: 'Action Commands',
          content: 'Perform actions on page elements.',
          examples: [
            'Click [button name]',
            'Fill [field name] with [value]',
            'Select [option]',
            'Submit the form'
          ]
        },
        {
          title: 'Search Commands',
          content: 'Search for content and information.',
          examples: [
            'Search for [query]',
            'Find [item]',
            'Filter by [criteria]',
            'Show me [category]'
          ]
        },
        {
          title: 'Help Commands',
          content: 'Get assistance and discover available commands.',
          examples: [
            'What can I do here?',
            'Help me navigate',
            'Show me examples',
            'How do I [task]?'
          ]
        }
      ]
    };
  }

  // ======================= PRIVATE METHODS =======================

  private initializeDefaultCommands(): void {
    const defaultCommands: CommandSuggestion[] = [
      {
        id: 'help-general',
        command: 'What can I do here?',
        intent: 'help_request',
        confidence: 0.9,
        priority: 'high',
        context: {} as SuggestionContext,
        category: 'help',
        description: 'Discover available voice commands for this page',
        examples: ['Show me options', 'What are my choices?'],
        keywords: ['help', 'options', 'commands'],
        variations: ['What can I say?', 'Show me commands'],
        reasoning: 'General help command',
        metadata: {
          frequency: 0,
          successRate: 0.9,
          avgExecutionTime: 500,
          isLearned: false,
          source: 'template'
        }
      },
      {
        id: 'navigate-home',
        command: 'Go to home page',
        intent: 'navigate_to_page',
        confidence: 0.9,
        priority: 'high',
        context: {} as SuggestionContext,
        category: 'navigation',
        description: 'Navigate to the main home page',
        examples: ['Take me home', 'Go to main page'],
        keywords: ['home', 'main', 'navigate'],
        variations: ['Navigate home', 'Return to home'],
        reasoning: 'Common navigation command',
        metadata: {
          frequency: 0,
          successRate: 0.9,
          avgExecutionTime: 1000,
          isLearned: false,
          source: 'template'
        }
      },
      {
        id: 'search-general',
        command: 'Search for something',
        intent: 'search_content',
        confidence: 0.8,
        priority: 'medium',
        context: {} as SuggestionContext,
        category: 'query',
        description: 'Search for content on the website',
        examples: ['Find products', 'Look for information'],
        keywords: ['search', 'find', 'look'],
        variations: ['Find something', 'Look for content'],
        reasoning: 'General search command',
        metadata: {
          frequency: 0,
          successRate: 0.8,
          avgExecutionTime: 1200,
          isLearned: false,
          source: 'template'
        }
      }
    ];

    this.catalog.allCommands = defaultCommands;
    this.updateGroups();
    this.state.filteredCommands = this.getDefaultView();
  }

  private calculateSearchScore(command: CommandSuggestion, query: string): number {
    let score = 0;

    // Exact command match
    if (command.command.toLowerCase().includes(query)) {
      score += 100;
    }

    // Keyword matches
    const queryWords = query.split(/\s+/);
    const keywordMatches = queryWords.filter(word =>
      command.keywords.some(keyword => keyword.toLowerCase().includes(word))
    );
    score += keywordMatches.length * 20;

    // Description match
    if (command.description.toLowerCase().includes(query)) {
      score += 30;
    }

    // Example matches
    const exampleMatches = command.examples.filter(example =>
      example.toLowerCase().includes(query)
    );
    score += exampleMatches.length * 15;

    // Variation matches
    const variationMatches = command.variations.filter(variation =>
      variation.toLowerCase().includes(query)
    );
    score += variationMatches.length * 10;

    // Boost by frequency and confidence
    score += command.metadata.frequency * 2;
    score += command.confidence * 10;

    // Boost recent commands
    if (this.catalog.recentCommands.some(recent => recent.id === command.id)) {
      score += 25;
    }

    // Boost popular commands
    if (this.catalog.popularCommands.some(popular => popular.id === command.id)) {
      score += 15;
    }

    return score;
  }

  private getDefaultView(): CommandSuggestion[] {
    const defaultCommands: CommandSuggestion[] = [];

    // Add recent commands if enabled
    if (this.config.showRecentCommands && this.catalog.recentCommands.length > 0) {
      defaultCommands.push(...this.catalog.recentCommands.slice(0, 5));
    }

    // Add popular commands if enabled
    if (this.config.showPopularCommands && this.catalog.popularCommands.length > 0) {
      const popularNotInRecent = this.catalog.popularCommands.filter(popular =>
        !defaultCommands.some(cmd => cmd.id === popular.id)
      );
      defaultCommands.push(...popularNotInRecent.slice(0, 5));
    }

    // Fill with general commands if needed
    if (defaultCommands.length < 10) {
      const generalCommands = this.catalog.allCommands
        .filter(cmd => !defaultCommands.some(existing => existing.id === cmd.id))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 10 - defaultCommands.length);

      defaultCommands.push(...generalCommands);
    }

    return defaultCommands;
  }

  private updateGroups(): void {
    const categories: SuggestionCategory[] = [
      'navigation', 'action', 'content', 'query', 'control', 'help', 'discovery'
    ];

    this.catalog.groups = categories.map(category => {
      const commands = this.catalog.allCommands.filter(cmd => cmd.category === category);

      return {
        category,
        label: this.getCategoryLabel(category),
        description: this.getCategoryDescription(category),
        icon: this.getCategoryIcon(category),
        commands,
        expanded: false
      };
    }).filter(group => group.commands.length > 0);
  }

  private getCategoryLabel(category: SuggestionCategory): string {
    const labels: Record<SuggestionCategory, string> = {
      navigation: 'Navigation',
      action: 'Actions',
      content: 'Content',
      query: 'Search & Query',
      control: 'Controls',
      help: 'Help & Support',
      discovery: 'Discovery'
    };
    return labels[category];
  }

  private getCategoryDescription(category: SuggestionCategory): string {
    const descriptions: Record<SuggestionCategory, string> = {
      navigation: 'Move around the website and access different pages',
      action: 'Interact with buttons, forms, and page elements',
      content: 'Edit, create, and manage content',
      query: 'Search for information and filter results',
      control: 'Control system behavior and manage sessions',
      help: 'Get assistance and learn about available features',
      discovery: 'Explore and discover new capabilities'
    };
    return descriptions[category];
  }

  private getCategoryIcon(category: SuggestionCategory): string {
    const icons: Record<SuggestionCategory, string> = {
      navigation: 'navigation',
      action: 'mouse-pointer',
      content: 'message-square',
      query: 'search',
      control: 'settings',
      help: 'help-circle',
      discovery: 'lightbulb'
    };
    return icons[category];
  }

  private trackCommandUsage(command: CommandSuggestion): void {
    // Update frequency in metadata
    command.metadata.frequency++;
    command.metadata.lastUsed = new Date();

    // Update user profile if available
    if (this.userProfile) {
      this.userProfile.learningData.commandHistory.push({
        command: command.command,
        intent: command.intent,
        context: 'palette',
        success: true,
        confidence: command.confidence,
        timestamp: new Date(),
        executionTime: 0
      });

      // Keep history limited
      if (this.userProfile.learningData.commandHistory.length > 1000) {
        this.userProfile.learningData.commandHistory =
          this.userProfile.learningData.commandHistory.slice(-500);
      }
    }
  }

  private addToRecentCommands(command: CommandSuggestion): void {
    // Remove if already exists
    this.catalog.recentCommands = this.catalog.recentCommands.filter(
      recent => recent.id !== command.id
    );

    // Add to beginning
    this.catalog.recentCommands.unshift(command);

    // Limit size
    this.catalog.recentCommands = this.catalog.recentCommands.slice(
      0,
      this.config.maxRecentCommands
    );

    this.state.recentCommands = [...this.catalog.recentCommands];
  }

  private updatePopularCommands(): void {
    this.catalog.popularCommands = this.catalog.allCommands
      .filter(cmd => cmd.metadata.frequency > 0)
      .sort((a, b) => b.metadata.frequency - a.metadata.frequency)
      .slice(0, this.config.maxPopularCommands);

    this.state.popularCommands = [...this.catalog.popularCommands];
  }

  private updatePopularCommandsFromProfile(): void {
    if (!this.userProfile) {return;}

    // Get command frequency from user profile
    const commandFrequency = new Map<string, number>();

    this.userProfile.learningData.commandHistory.forEach(history => {
      const current = commandFrequency.get(history.command) || 0;
      commandFrequency.set(history.command, current + 1);
    });

    // Find corresponding commands and update frequency
    const popularFromProfile = Array.from(commandFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.config.maxPopularCommands)
      .map(([commandText]) => this.findCommandByText(commandText))
      .filter(Boolean) as CommandSuggestion[];

    this.catalog.popularCommands = popularFromProfile;
    this.state.popularCommands = [...this.catalog.popularCommands];
  }

  private findCommandByText(commandText: string): CommandSuggestion | null {
    return this.catalog.allCommands.find(cmd =>
      cmd.command.toLowerCase() === commandText.toLowerCase()
    ) || null;
  }

  private deduplicateCommands(commands: CommandSuggestion[]): CommandSuggestion[] {
    const seen = new Set<string>();
    return commands.filter(command => {
      const key = command.command.toLowerCase();
      if (seen.has(key)) {return false;}
      seen.add(key);
      return true;
    });
  }

  private notifyStateChange(): void {
    // This would trigger React state updates
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('commandPaletteStateChange', {
        detail: this.state
      }));
    }
  }

  private notifyCommandExecution(command: CommandSuggestion): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('commandPaletteExecution', {
        detail: command
      }));
    }
  }
}

export const commandPaletteService = new CommandPaletteService();