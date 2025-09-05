import { createLogger } from '../../../../shared/utils.js';

const logger = createLogger({ service: 'rrf-ranker' });

/**
 * Reciprocal Rank Fusion (RRF) Ranker
 * 
 * Implements RRF algorithm for combining multiple ranked lists (e.g., vector similarity + FTS).
 * RRF computes scores as: score = sum(1 / (k + rank_i)) for each ranking system.
 * 
 * Based on: "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods"
 * (Cormack, Clarke, Buettcher, 2009)
 * 
 * Features:
 * - Multiple ranking system combination
 * - Configurable RRF constant (k) parameter
 * - Weighted fusion for different ranking systems
 * - Score normalization and threshold filtering
 * - Performance monitoring and logging
 */
export class RRFRanker {
  private readonly k: number;
  private readonly normalizeScores: boolean;
  
  constructor(k: number = 60, normalizeScores: boolean = true) {
    this.k = k;
    this.normalizeScores = normalizeScores;
    
    logger.debug('RRF Ranker initialized', { k, normalizeScores });
  }

  /**
   * Combine multiple ranked lists using RRF algorithm
   */
  fuseRankings<T extends RankableItem>(
    rankings: RankingInput<T>[],
    options: RRFOptions = {}
  ): RRFResult<T>[] {
    const startTime = Date.now();
    
    logger.debug('Starting RRF fusion', {
      rankingsCount: rankings.length,
      totalItems: rankings.reduce((sum, r) => sum + r.items.length, 0),
      options
    });

    // Validate inputs
    this.validateRankings(rankings);
    
    // Apply weights (default to equal weighting)
    const weights = options.weights || rankings.map(() => 1.0);
    if (weights.length !== rankings.length) {
      throw new Error('Weights array length must match rankings array length');
    }

    // Normalize weights to sum to 1
    const weightSum = weights.reduce((sum, w) => sum + w, 0);
    const normalizedWeights = weights.map(w => w / weightSum);

    // Build item score map
    const itemScores = new Map<string, ItemScoreInfo<T>>();

    // Process each ranking system
    rankings.forEach((ranking, systemIndex) => {
      const systemWeight = normalizedWeights[systemIndex] || 0;
      const systemName = ranking.systemName || `system_${systemIndex}`;
      
      ranking.items.forEach((item, rank) => {
        const rrfScore = systemWeight * (1.0 / (this.k + rank + 1)); // +1 because ranks are 0-based
        
        if (!itemScores.has(item.id)) {
          itemScores.set(item.id, {
            item,
            totalScore: 0,
            systemScores: new Map(),
            systemRanks: new Map(),
            appearsInSystems: 0
          });
        }

        const scoreInfo = itemScores.get(item.id)!;
        scoreInfo.totalScore += rrfScore;
        scoreInfo.systemScores.set(systemName, rrfScore);
        scoreInfo.systemRanks.set(systemName, rank + 1); // +1 for human-readable ranking
        scoreInfo.appearsInSystems++;
      });
    });

    // Convert to array and sort by total RRF score
    let results = Array.from(itemScores.values())
      .map((scoreInfo): RRFResult<T> => ({
        item: scoreInfo.item,
        rrfScore: scoreInfo.totalScore,
        normalizedScore: 0, // Will be computed below
        systemScores: Object.fromEntries(scoreInfo.systemScores),
        systemRanks: Object.fromEntries(scoreInfo.systemRanks),
        appearsInSystems: scoreInfo.appearsInSystems,
        fusionRank: 0 // Will be assigned below
      }))
      .sort((a, b) => b.rrfScore - a.rrfScore);

    // Assign fusion ranks
    results.forEach((result, index) => {
      result.fusionRank = index + 1;
    });

    // Normalize scores if requested
    if (this.normalizeScores && results.length > 0) {
      const maxScore = results[0]?.rrfScore || 0;
      const minScore = results[results.length - 1]?.rrfScore || 0;
      const scoreRange = maxScore - minScore;

      results.forEach(result => {
        result.normalizedScore = scoreRange > 0 
          ? (result.rrfScore - minScore) / scoreRange
          : 1.0;
      });
    } else {
      // If not normalizing, use raw RRF score
      results.forEach(result => {
        result.normalizedScore = result.rrfScore;
      });
    }

    // Apply threshold filtering
    if (options.minScore !== undefined) {
      const scoreField = this.normalizeScores ? 'normalizedScore' : 'rrfScore';
      results = results.filter(r => r[scoreField] >= options.minScore!);
    }

    // Apply consensus filtering (must appear in at least N systems)
    if (options.minConsensus !== undefined) {
      const minConsensus = options.minConsensus;
      results = results.filter(r => r.appearsInSystems >= minConsensus);
    }

    // Limit results
    if (options.maxResults !== undefined) {
      results = results.slice(0, options.maxResults);
    }

    const duration = Date.now() - startTime;
    logger.info('RRF fusion completed', {
      inputSystems: rankings.length,
      totalInputItems: rankings.reduce((sum, r) => sum + r.items.length, 0),
      outputItems: results.length,
      duration,
      topScore: results[0]?.rrfScore,
      avgSystemsPerItem: results.length > 0 ? results.reduce((sum, r) => sum + r.appearsInSystems, 0) / results.length : 0
    });

    return results;
  }

  /**
   * Combine vector similarity and full-text search results
   */
  fuseVectorAndFTS<T extends RankableItem>(
    vectorResults: T[],
    ftsResults: T[],
    options: {
      vectorWeight?: number;
      ftsWeight?: number;
      minScore?: number;
      maxResults?: number;
    } = {}
  ): RRFResult<T>[] {
    const vectorWeight = options.vectorWeight || 0.7;
    const ftsWeight = options.ftsWeight || 0.3;

    const rankings: RankingInput<T>[] = [
      {
        systemName: 'vector_similarity',
        items: vectorResults
      },
      {
        systemName: 'full_text_search', 
        items: ftsResults
      }
    ];

    return this.fuseRankings(rankings, {
      weights: [vectorWeight, ftsWeight],
      ...(options.minScore !== undefined && { minScore: options.minScore }),
      ...(options.maxResults !== undefined && { maxResults: options.maxResults }),
      minConsensus: 1 // At least one system must have the item
    });
  }

  /**
   * Analyze ranking system agreement
   */
  analyzeConsensus<T extends RankableItem>(
    rankings: RankingInput<T>[],
    topK: number = 10
  ): ConsensusAnalysis {
    // Get top K from each system
    const topKSets = rankings.map(ranking => 
      new Set(ranking.items?.slice(0, topK).map(item => item.id) || [])
    );

    // Calculate pairwise overlaps
    const pairwiseOverlaps: Array<{ 
      system1: string; 
      system2: string; 
      overlap: number; 
      jaccard: number; 
    }> = [];

    for (let i = 0; i < rankings.length - 1; i++) {
      for (let j = i + 1; j < rankings.length; j++) {
        const set1 = topKSets[i] || new Set();
        const set2 = topKSets[j] || new Set();
        const intersection = new Set([...set1].filter(x => set2?.has(x)));
        const union = new Set([...set1, ...set2]);
        
        pairwiseOverlaps.push({
          system1: rankings[i]?.systemName || `system_${i}`,
          system2: rankings[j]?.systemName || `system_${j}`,
          overlap: intersection.size,
          jaccard: intersection.size / union.size
        });
      }
    }

    // Calculate overall consensus (items in multiple systems)
    const itemCounts = new Map<string, number>();
    rankings.forEach(ranking => {
      ranking.items?.slice(0, topK).forEach(item => {
        itemCounts.set(item.id, (itemCounts.get(item.id) || 0) + 1);
      });
    });

    const consensusItems = Array.from(itemCounts.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1]);

    return {
      totalSystems: rankings.length,
      topK,
      pairwiseOverlaps,
      consensusItems: consensusItems.map(([itemId, systemCount]) => ({
        itemId,
        systemCount,
        consensusRatio: systemCount / rankings.length
      })),
      avgPairwiseJaccard: pairwiseOverlaps.length > 0 
        ? pairwiseOverlaps.reduce((sum, overlap) => sum + overlap.jaccard, 0) / pairwiseOverlaps.length 
        : 0,
      strongConsensusCount: consensusItems.filter(([_, count]) => count >= Math.ceil(rankings.length * 0.7)).length
    };
  }

  /**
   * Validate ranking inputs
   */
  private validateRankings<T extends RankableItem>(rankings: RankingInput<T>[]): void {
    if (rankings.length === 0) {
      throw new Error('At least one ranking is required');
    }

    rankings.forEach((ranking, index) => {
      if (!ranking.items || ranking.items.length === 0) {
        logger.warn('Empty ranking detected', { 
          systemName: ranking.systemName || `system_${index}`,
          index 
        });
      }

      // Validate that all items have IDs
      ranking.items.forEach((item, itemIndex) => {
        if (!item.id) {
          throw new Error(`Item at index ${itemIndex} in ranking ${index} is missing ID`);
        }
      });
    });
  }
}

/**
 * Rankable item interface
 */
export interface RankableItem {
  id: string;
  [key: string]: any;
}

/**
 * Ranking system input
 */
export interface RankingInput<T extends RankableItem> {
  systemName?: string;
  items: T[];
}

/**
 * RRF fusion options
 */
export interface RRFOptions {
  weights?: number[]; // Weight for each ranking system
  minScore?: number; // Minimum score threshold
  maxResults?: number; // Maximum number of results to return
  minConsensus?: number; // Minimum number of systems item must appear in
}

/**
 * RRF result for a single item
 */
export interface RRFResult<T extends RankableItem> {
  item: T;
  rrfScore: number; // Raw RRF score
  normalizedScore: number; // Normalized score [0-1]
  systemScores: Record<string, number>; // Score from each system
  systemRanks: Record<string, number>; // Rank in each system (1-based)
  appearsInSystems: number; // Number of systems containing this item
  fusionRank: number; // Final ranking after fusion (1-based)
}

/**
 * Internal score information
 */
interface ItemScoreInfo<T extends RankableItem> {
  item: T;
  totalScore: number;
  systemScores: Map<string, number>;
  systemRanks: Map<string, number>;
  appearsInSystems: number;
}

/**
 * Consensus analysis result
 */
export interface ConsensusAnalysis {
  totalSystems: number;
  topK: number;
  pairwiseOverlaps: Array<{
    system1: string;
    system2: string;
    overlap: number;
    jaccard: number;
  }>;
  consensusItems: Array<{
    itemId: string;
    systemCount: number;
    consensusRatio: number;
  }>;
  avgPairwiseJaccard: number;
  strongConsensusCount: number;
}

/**
 * Factory function
 */
export function createRRFRanker(k: number = 60, normalizeScores: boolean = true): RRFRanker {
  return new RRFRanker(k, normalizeScores);
}

// Export default instance
export const rrfRanker = createRRFRanker();