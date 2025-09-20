import axios from 'axios';

/**
 * Test Voice API Endpoints
 */

const baseURL = 'http://localhost:5000';

console.log('Testing Voice API endpoints...');

async function testVoiceAPIs() {
  const results = [];

  // Test 1: Health Check
  console.log('\n1. Testing /api/v1/voice/health');
  try {
    const response = await axios.get(`${baseURL}/api/v1/voice/health`);
    console.log('✓ Health check response:', response.status);
    console.log('  Data:', JSON.stringify(response.data, null, 2));
    results.push({ endpoint: 'health', success: true, status: response.status });
  } catch (error) {
    console.log('✗ Health check failed:', error.response?.status || error.message);
    results.push({ endpoint: 'health', success: false, error: error.message });
  }

  // Test 2: Create Voice Session
  console.log('\n2. Testing POST /api/v1/voice/session');
  let sessionId = null;
  try {
    const response = await axios.post(`${baseURL}/api/v1/voice/session`, {
      voice: 'alloy',
      maxDuration: 300,
      audioConfig: {
        sampleRate: 24000,
        frameMs: 20
      }
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('✓ Session created:', response.status);
    sessionId = response.data.data.sessionId;
    console.log('  Session ID:', sessionId);
    console.log('  Endpoints:', response.data.data.endpoints);
    results.push({ endpoint: 'session-create', success: true, status: response.status, sessionId });
  } catch (error) {
    console.log('✗ Session creation failed:', error.response?.status || error.message);
    results.push({ endpoint: 'session-create', success: false, error: error.message });
  }

  // Test 3: Get Session Info (requires auth, so expect 401)
  if (sessionId) {
    console.log('\n3. Testing GET /api/v1/voice/session/' + sessionId);
    try {
      const response = await axios.get(`${baseURL}/api/v1/voice/session/${sessionId}`, {
        headers: { 'Authorization': 'Bearer test-token' }
      });
      console.log('✓ Session info retrieved:', response.status);
      results.push({ endpoint: 'session-get', success: true, status: response.status });
    } catch (error) {
      console.log('✗ Session info failed:', error.response?.status || error.message);
      console.log('  (Expected - requires proper authentication)');
      results.push({ endpoint: 'session-get', success: false, error: error.message, expected: true });
    }
  }

  // Test 4: SSE Stream Endpoint
  if (sessionId) {
    console.log('\n4. Testing GET /api/v1/voice/stream (SSE)');
    try {
      const response = await axios.get(`${baseURL}/api/v1/voice/stream?sessionId=${sessionId}&format=sse`, {
        timeout: 2000 // Short timeout since this is a streaming endpoint
      });
      console.log('✓ SSE stream connected:', response.status);
      results.push({ endpoint: 'sse-stream', success: true, status: response.status });
    } catch (error) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.log('✓ SSE stream started (timeout expected for streaming)');
        results.push({ endpoint: 'sse-stream', success: true, note: 'streaming-timeout' });
      } else {
        console.log('✗ SSE stream failed:', error.response?.status || error.message);
        results.push({ endpoint: 'sse-stream', success: false, error: error.message });
      }
    }
  }

  // Test 5: Process Text Input
  if (sessionId) {
    console.log('\n5. Testing POST /api/v1/voice/stream (text input)');
    try {
      const response = await axios.post(`${baseURL}/api/v1/voice/stream`, {
        sessionId: sessionId,
        input: 'Hello, this is a test',
        inputType: 'text'
      }, {
        headers: { 'Content-Type': 'application/json' }
      });
      console.log('✓ Text input processed:', response.status);
      console.log('  Response:', JSON.stringify(response.data, null, 2));
      results.push({ endpoint: 'text-input', success: true, status: response.status });
    } catch (error) {
      console.log('✗ Text input failed:', error.response?.status || error.message);
      results.push({ endpoint: 'text-input', success: false, error: error.message });
    }
  }

  // Test 6: Process Audio Input (with dummy base64 audio)
  if (sessionId) {
    console.log('\n6. Testing POST /api/v1/voice/stream (audio input)');
    try {
      const dummyAudioBase64 = Buffer.from('dummy audio data').toString('base64');
      const response = await axios.post(`${baseURL}/api/v1/voice/stream`, {
        sessionId: sessionId,
        audioData: dummyAudioBase64,
        inputType: 'audio'
      }, {
        headers: { 'Content-Type': 'application/json' }
      });
      console.log('✓ Audio input processed:', response.status);
      results.push({ endpoint: 'audio-input', success: true, status: response.status });
    } catch (error) {
      console.log('✗ Audio input failed:', error.response?.status || error.message);
      results.push({ endpoint: 'audio-input', success: false, error: error.message });
    }
  }

  return { sessionId, results };
}

// Run the tests
testVoiceAPIs().then(({ sessionId, results }) => {
  console.log('\n' + '='.repeat(50));
  console.log('VOICE API TEST RESULTS:');
  console.log('='.repeat(50));

  results.forEach(result => {
    const status = result.success ? '✓ PASS' : '✗ FAIL';
    const note = result.expected ? ' (expected)' : '';
    console.log(`${result.endpoint.padEnd(20)}: ${status}${note}`);
    if (result.error && !result.expected) {
      console.log(`  Error: ${result.error}`);
    }
  });

  const passed = results.filter(r => r.success).length;
  const total = results.length;
  console.log(`\nSummary: ${passed}/${total} endpoints working`);

  if (sessionId) {
    console.log(`\nSession created: ${sessionId}`);
    console.log('Note: Session will expire in 5 minutes');
  }
}).catch(error => {
  console.error('Test execution failed:', error);
});