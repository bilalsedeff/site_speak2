import WebSocket from 'ws';
import { io } from 'socket.io-client';

/**
 * Test Voice WebSocket Connections
 */

console.log('Testing Voice WebSocket and Socket.IO connections...');

// Test 1: Raw WebSocket at /voice-ws
function testRawWebSocket() {
  return new Promise((resolve) => {
    console.log('\n1. Testing Raw WebSocket at ws://localhost:5000/voice-ws');

    const ws = new WebSocket('ws://localhost:5000/voice-ws', {
      headers: {
        'Authorization': 'Bearer test-token',
        'X-Tenant-Id': 'test-tenant',
        'X-Site-Id': 'test-site'
      }
    });

    const startTime = Date.now();
    let authSent = false;

    ws.on('open', () => {
      const connectionTime = Date.now() - startTime;
      console.log(`✓ Raw WebSocket connected in ${connectionTime}ms`);

      // Send authentication
      ws.send(JSON.stringify({
        type: 'auth',
        token: 'test-token',
        tenantId: 'test-tenant',
        siteId: 'test-site'
      }));
      authSent = true;
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`✓ Received: ${message.type}`);

        if (message.type === 'auth_success' || message.type === 'ready') {
          ws.close();
          resolve({
            success: true,
            connectionTime: Date.now() - startTime,
            authenticated: message.type === 'auth_success'
          });
        }
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('✗ Raw WebSocket error:', error.message);
      resolve({
        success: false,
        error: error.message,
        connectionTime: Date.now() - startTime
      });
    });

    ws.on('close', () => {
      if (!authSent) {
        resolve({
          success: false,
          error: 'Connection closed before auth',
          connectionTime: Date.now() - startTime
        });
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      ws.terminate();
      resolve({
        success: false,
        error: 'Connection timeout',
        connectionTime: Date.now() - startTime
      });
    }, 10000);
  });
}

// Test 2: Socket.IO connection
function testSocketIO() {
  return new Promise((resolve) => {
    console.log('\n2. Testing Socket.IO at ws://localhost:5000/socket.io');

    const startTime = Date.now();
    const socket = io('http://localhost:5000', {
      transports: ['websocket'],
      auth: {
        token: 'test-token',
        tenantId: 'test-tenant',
        siteId: 'test-site'
      }
    });

    socket.on('connect', () => {
      const connectionTime = Date.now() - startTime;
      console.log(`✓ Socket.IO connected in ${connectionTime}ms`);

      // Test voice capabilities
      socket.emit('voice:capabilities');

      setTimeout(() => {
        socket.disconnect();
        resolve({
          success: true,
          connectionTime: connectionTime
        });
      }, 1000);
    });

    socket.on('voice:capabilities_response', (data) => {
      console.log('✓ Voice capabilities:', data);
    });

    socket.on('connect_error', (error) => {
      console.error('✗ Socket.IO connection error:', error.message);
      resolve({
        success: false,
        error: error.message,
        connectionTime: Date.now() - startTime
      });
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      socket.disconnect();
      resolve({
        success: false,
        error: 'Connection timeout',
        connectionTime: Date.now() - startTime
      });
    }, 10000);
  });
}

// Run tests
async function runTests() {
  console.log('='.repeat(50));

  try {
    const rawWSResult = await testRawWebSocket();
    console.log('Raw WebSocket Result:', rawWSResult);

    const socketIOResult = await testSocketIO();
    console.log('Socket.IO Result:', socketIOResult);

    console.log('\n='.repeat(50));
    console.log('SUMMARY:');
    console.log(`Raw WebSocket: ${rawWSResult.success ? 'PASS' : 'FAIL'}`);
    console.log(`Socket.IO: ${socketIOResult.success ? 'PASS' : 'FAIL'}`);

    if (rawWSResult.success && socketIOResult.success) {
      console.log('✓ All voice connection tests passed!');
    } else {
      console.log('✗ Some voice connection tests failed');
    }
  } catch (error) {
    console.error('Test execution failed:', error);
  }
}

runTests();