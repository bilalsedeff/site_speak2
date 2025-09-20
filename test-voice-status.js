import axios from 'axios';

/**
 * Test Voice System Status and Integration
 */

const baseURL = 'http://localhost:5000';

async function checkVoiceSystemStatus() {
  console.log('Checking Voice System Status...\n');

  // Test general server health
  console.log('1. General Server Health:');
  try {
    const response = await axios.get(`${baseURL}/health`);
    console.log('✓ Server is healthy');
    console.log('  Uptime:', response.data.uptime, 'seconds');
    console.log('  Process Type:', response.data.processType);
  } catch (error) {
    console.log('✗ Server health check failed:', error.message);
  }

  // Test voice health with more details
  console.log('\n2. Voice Service Health:');
  try {
    const response = await axios.get(`${baseURL}/api/v1/voice/health`);
    console.log('✓ Voice service is healthy');
    console.log('  Status:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('✗ Voice service is unhealthy');
    if (error.response && error.response.data) {
      console.log('  Error details:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('  Error:', error.message);
    }
  }

  // Check if OpenAI Realtime API is configured
  console.log('\n3. OpenAI Realtime API Configuration:');
  try {
    // Try to access a config endpoint that might reveal API status
    const response = await axios.get(`${baseURL}/api/v1/ai/status`, {
      headers: { 'Authorization': 'Bearer test-token' }
    });
    console.log('✓ AI service status available');
    console.log('  Status:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('✗ AI service status not available:', error.response?.status || error.message);
  }

  // Check if we can inspect the voice session storage
  console.log('\n4. Voice Session Management:');
  try {
    // Create a session first
    const sessionResponse = await axios.post(`${baseURL}/api/v1/voice/session`, {
      voice: 'alloy',
      maxDuration: 300
    });
    const sessionId = sessionResponse.data.data.sessionId;
    console.log('✓ Session created:', sessionId);

    // Try to access session details
    try {
      const sessionInfo = await axios.get(`${baseURL}/api/v1/voice/session/${sessionId}`, {
        headers: { 'Authorization': 'Bearer valid-test-token' }
      });
      console.log('✓ Session info accessible with auth');
    } catch (authError) {
      console.log('✗ Session info requires proper authentication (expected)');
      console.log('  Auth error:', authError.response?.status || authError.message);
    }
  } catch (error) {
    console.log('✗ Session management test failed:', error.message);
  }

  // Check Voice WebSocket Handler
  console.log('\n5. Voice WebSocket Handler Status:');
  try {
    // Check if there's a status endpoint for WebSocket
    const response = await axios.get(`${baseURL}/api/v1/websocket/status`);
    console.log('✓ WebSocket status available');
    console.log('  Status:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('✗ WebSocket status not available:', error.response?.status || error.message);
  }

  // Check if there are any active voice sessions
  console.log('\n6. Active Voice Sessions:');
  try {
    const response = await axios.get(`${baseURL}/api/v1/voice/sessions`, {
      headers: { 'Authorization': 'Bearer test-token' }
    });
    console.log('✓ Voice sessions endpoint accessible');
    console.log('  Sessions:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('✗ Voice sessions endpoint error:', error.response?.status || error.message);
  }

  // Check the environment and OpenAI key status
  console.log('\n7. Environment Check:');
  console.log('  Node.js version:', process.version);
  console.log('  Platform:', process.platform);
  console.log('  OPENAI_API_KEY configured:', process.env.OPENAI_API_KEY ? 'Yes (length: ' + process.env.OPENAI_API_KEY.length + ')' : 'No');

  console.log('\n' + '='.repeat(60));
  console.log('RECOMMENDATIONS:');
  console.log('='.repeat(60));

  console.log('1. Voice service health is failing - check voice orchestrator initialization');
  console.log('2. Raw WebSocket (/voice-ws) connection issues - verify WebSocket handler setup');
  console.log('3. Session creation works but session access requires proper authentication');
  console.log('4. OpenAI Realtime API integration status needs verification');
  console.log('5. Audio processing pipeline components need individual testing');
}

checkVoiceSystemStatus().catch(error => {
  console.error('Status check failed:', error);
});