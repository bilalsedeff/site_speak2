/**
 * Content Hash Value Object
 * 
 * Immutable value object representing a content hash with its metadata.
 * Ensures hash integrity and provides comparison methods.
 */
export class ContentHash {
  constructor(
    private readonly _value: string,
    private readonly _algorithm: HashAlgorithm,
    private readonly _createdAt: Date = new Date()
  ) {
    this.validateHash(_value, _algorithm);
  }

  /**
   * Get hash value
   */
  get value(): string {
    return this._value;
  }

  /**
   * Get hash algorithm
   */
  get algorithm(): HashAlgorithm {
    return this._algorithm;
  }

  /**
   * Get creation timestamp
   */
  get createdAt(): Date {
    return new Date(this._createdAt.getTime()); // Return copy to maintain immutability
  }

  /**
   * Check if this hash equals another hash
   */
  equals(other: ContentHash): boolean {
    return this._value === other._value && this._algorithm === other._algorithm;
  }

  /**
   * Check if hash value matches a string
   */
  matches(hashValue: string): boolean {
    return this._value === hashValue;
  }

  /**
   * Get hash length based on algorithm
   */
  get length(): number {
    return this._value.length;
  }

  /**
   * Check if hash is valid for its algorithm
   */
  get isValid(): boolean {
    return this.validateHash(this._value, this._algorithm, false);
  }

  /**
   * Get expected length for algorithm
   */
  get expectedLength(): number {
    return getExpectedHashLength(this._algorithm);
  }

  /**
   * Convert to string representation
   */
  toString(): string {
    return `${this._algorithm}:${this._value}`;
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): ContentHashData {
    return {
      value: this._value,
      algorithm: this._algorithm,
      createdAt: this._createdAt.toISOString()
    };
  }

  /**
   * Get hash prefix for quick comparison
   */
  getPrefix(length: number = 8): string {
    return this._value.substring(0, Math.min(length, this._value.length));
  }

  /**
   * Check if hash is strong (cryptographically secure)
   */
  get isStrong(): boolean {
    return ['sha256', 'sha512'].includes(this._algorithm);
  }

  /**
   * Check if hash is from a deprecated algorithm
   */
  get isDeprecated(): boolean {
    return ['md5', 'sha1'].includes(this._algorithm);
  }

  /**
   * Get age in milliseconds
   */
  get ageMs(): number {
    return Date.now() - this._createdAt.getTime();
  }

  /**
   * Check if hash is stale (older than specified age)
   */
  isStale(maxAgeMs: number): boolean {
    return this.ageMs > maxAgeMs;
  }

  /**
   * Create a new ContentHash with updated timestamp
   */
  refresh(): ContentHash {
    return new ContentHash(this._value, this._algorithm, new Date());
  }

  /**
   * Validate hash value and algorithm
   */
  private validateHash(value: string, algorithm: HashAlgorithm, throwOnError: boolean = true): boolean {
    if (!value) {
      if (throwOnError) {throw new Error('Hash value cannot be empty');}
      return false;
    }

    if (!algorithm) {
      if (throwOnError) {throw new Error('Hash algorithm must be specified');}
      return false;
    }

    // Check if value contains only valid hex characters
    const hexPattern = /^[a-fA-F0-9]+$/;
    if (!hexPattern.test(value)) {
      if (throwOnError) {throw new Error('Hash value must contain only hexadecimal characters');}
      return false;
    }

    // Check expected length for algorithm
    const expectedLength = getExpectedHashLength(algorithm);
    if (value.length !== expectedLength) {
      if (throwOnError) {
        throw new Error(`Hash length ${value.length} does not match expected length ${expectedLength} for ${algorithm}`);
      }
      return false;
    }

    return true;
  }
}

/**
 * Supported hash algorithms
 */
export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha512';

/**
 * Content hash data for serialization
 */
export interface ContentHashData {
  value: string;
  algorithm: HashAlgorithm;
  createdAt: string;
}

/**
 * Hash comparison result
 */
export interface HashComparison {
  isEqual: boolean;
  algorithm1: HashAlgorithm;
  algorithm2: HashAlgorithm;
  sameAlgorithm: boolean;
}

/**
 * Get expected hash length for algorithm
 */
export function getExpectedHashLength(algorithm: HashAlgorithm): number {
  const lengths: Record<HashAlgorithm, number> = {
    md5: 32,
    sha1: 40,
    sha256: 64,
    sha512: 128
  };

  return lengths[algorithm];
}

/**
 * Create ContentHash from string representation
 */
export function createContentHashFromString(hashString: string): ContentHash {
  const parts = hashString.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid hash string format. Expected "algorithm:hash"');
  }

  const [algorithm, value] = parts;
  if (!isValidHashAlgorithm(algorithm)) {
    throw new Error(`Unsupported hash algorithm: ${algorithm}`);
  }

  return new ContentHash(value, algorithm as HashAlgorithm);
}

/**
 * Create ContentHash from JSON data
 */
export function createContentHashFromJSON(data: ContentHashData): ContentHash {
  return new ContentHash(
    data.value,
    data.algorithm,
    new Date(data.createdAt)
  );
}

/**
 * Check if string is a valid hash algorithm
 */
export function isValidHashAlgorithm(algorithm: string): boolean {
  return ['md5', 'sha1', 'sha256', 'sha512'].includes(algorithm);
}

/**
 * Compare two ContentHash objects
 */
export function compareContentHashes(hash1: ContentHash, hash2: ContentHash): HashComparison {
  return {
    isEqual: hash1.equals(hash2),
    algorithm1: hash1.algorithm,
    algorithm2: hash2.algorithm,
    sameAlgorithm: hash1.algorithm === hash2.algorithm
  };
}

/**
 * Create ContentHash from raw values
 */
export function createContentHash(
  value: string, 
  algorithm: HashAlgorithm = 'sha256'
): ContentHash {
  return new ContentHash(value, algorithm);
}

/**
 * Validate hash string format
 */
export function isValidHashString(hashString: string): boolean {
  try {
    createContentHashFromString(hashString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get strongest available algorithm
 */
export function getStrongestAlgorithm(): HashAlgorithm {
  return 'sha512';
}

/**
 * Get fastest algorithm for given security requirements
 */
export function getFastestAlgorithm(secure: boolean = true): HashAlgorithm {
  return secure ? 'sha256' : 'md5';
}

/**
 * ContentHash collection utilities
 */
export class ContentHashCollection {
  constructor(private hashes: ContentHash[]) {}

  /**
   * Find hash by value
   */
  findByValue(value: string): ContentHash | undefined {
    return this.hashes.find(hash => hash.value === value);
  }

  /**
   * Find hashes by algorithm
   */
  findByAlgorithm(algorithm: HashAlgorithm): ContentHash[] {
    return this.hashes.filter(hash => hash.algorithm === algorithm);
  }

  /**
   * Get unique hashes (by value)
   */
  getUnique(): ContentHash[] {
    const seen = new Set<string>();
    return this.hashes.filter(hash => {
      if (seen.has(hash.value)) {
        return false;
      }
      seen.add(hash.value);
      return true;
    });
  }

  /**
   * Get stale hashes
   */
  getStale(maxAgeMs: number): ContentHash[] {
    return this.hashes.filter(hash => hash.isStale(maxAgeMs));
  }

  /**
   * Get deprecated hashes
   */
  getDeprecated(): ContentHash[] {
    return this.hashes.filter(hash => hash.isDeprecated);
  }

  /**
   * Convert to array
   */
  toArray(): ContentHash[] {
    return [...this.hashes];
  }

  /**
   * Get count
   */
  get count(): number {
    return this.hashes.length;
  }
}