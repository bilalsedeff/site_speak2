/**
 * Buffer utilities for handling ArrayBuffer and SharedArrayBuffer conversions
 */

/**
 * Converts a SharedArrayBuffer to ArrayBuffer by copying the data
 * @param sharedBuffer - The SharedArrayBuffer to convert
 * @returns A new ArrayBuffer with copied data
 */
export function sharedArrayBufferToArrayBuffer(sharedBuffer: SharedArrayBuffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(sharedBuffer.byteLength);
  new Uint8Array(arrayBuffer).set(new Uint8Array(sharedBuffer));
  return arrayBuffer;
}

/**
 * Safely converts any buffer-like object to ArrayBuffer
 * @param buffer - The buffer to convert (ArrayBuffer or SharedArrayBuffer)
 * @returns An ArrayBuffer
 */
export function toArrayBuffer(buffer: ArrayBuffer | SharedArrayBuffer): ArrayBuffer {
  if (buffer instanceof SharedArrayBuffer) {
    return sharedArrayBufferToArrayBuffer(buffer);
  }
  return buffer;
}

/**
 * Creates an ArrayBuffer from a Buffer, handling SharedArrayBuffer cases
 * @param buffer - Node.js Buffer object
 * @returns ArrayBuffer with the buffer's data
 */
export function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  if (buffer.buffer instanceof SharedArrayBuffer) {
    // Copy data from SharedArrayBuffer to ArrayBuffer
    const arrayBuffer = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(arrayBuffer).set(new Uint8Array(buffer));
    return arrayBuffer;
  }

  // Return a slice of the underlying ArrayBuffer
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}