#!/usr/bin/env node

/**
 * Comprehensive Voice System Testing Script
 *
 * Tests all voice components end-to-end:
 * 1. Voice WebSocket endpoint (ws://localhost:5000/voice-ws)
 * 2. Socket.IO voice endpoint connection
 * 3. Voice API endpoints (/api/v1/voice/*)
 * 4. OpenAI Realtime API integration
 * 5. Audio processing pipeline
 * 6. Voice authentication system
 * 7. UnifiedVoiceOrchestrator functionality
 * 8. Sub-300ms latency verification
 * 9. Voice health checks and AI Tools system
 */

import WebSocket from 'ws';
import { io } from 'socket.io-client';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class VoiceSystemTester {
  constructor() {
    this.baseURL = 'http://localhost:5000';
    this.wsURL = 'ws://localhost:5000';
    this.results = {
      webSocket: null,
      socketIO: null,
      apiEndpoints: [],
      realtimeAPI: null,
      audioProcessing: null,
      authentication: null,
      orchestrator: null,
      latency: null,
      healthChecks: null
    };
    this.performanceMetrics = {
      firstTokenLatency: [],
      partialLatency: [],
      bargeInLatency: [],
      connectionTimes: []
    };
  }

  log(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  error(message, error = null) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ERROR: ${message}`);
    if (error) {
      console.error(error);
    }
  }

  /**
   * Test 1: Voice WebSocket Endpoint
   */
  async testVoiceWebSocket() {
    this.log('Testing Voice WebSocket endpoint at ws://localhost:5000/voice-ws');

    return new Promise((resolve) => {
      const startTime = Date.now();
      const ws = new WebSocket(`${this.wsURL}/voice-ws`, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-Id': 'test-tenant',
          'X-Site-Id': 'test-site',
          'X-User-Id': 'test-user'
        }
      });

      let connected = false;
      let authResponse = false;

      const timeout = setTimeout(() => {
        if (!connected) {
          this.error('WebSocket connection timeout');
          ws.terminate();
          resolve({
            success: false,
            error: 'Connection timeout',
            connectionTime: Date.now() - startTime
          });
        }
      }, 10000);

      ws.on('open', () => {
        connected = true;
        const connectionTime = Date.now() - startTime;
        this.performanceMetrics.connectionTimes.push(connectionTime);
        this.log(`WebSocket connected in ${connectionTime}ms`);

        // Test authentication
        ws.send(JSON.stringify({
          type: 'auth',
          token: 'test-token',
          tenantId: 'test-tenant',
          siteId: 'test-site',
          userId: 'test-user'
        }));

        // Test voice session start
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'start_session',
            config: {
              locale: 'en-US',
              voice: 'alloy',
              audioConfig: {
                sampleRate: 24000,
                frameMs: 20
              }
            }
          }));
        }, 100);
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.log('WebSocket message received', { type: message.type });

          if (message.type === 'auth_success') {
            authResponse = true;
          }

          if (message.type === 'session_ready') {
            clearTimeout(timeout);
            ws.close();
            resolve({
              success: true,
              connectionTime: Date.now() - startTime,
              authenticated: authResponse,
              sessionReady: true
            });
          }
        } catch (error) {
          this.error('Failed to parse WebSocket message', error);
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        this.error('WebSocket error', error);
        resolve({
          success: false,
          error: error.message,
          connectionTime: Date.now() - startTime
        });
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        if (!connected) {
          resolve({
            success: false,
            error: 'Connection closed before establishing',
            connectionTime: Date.now() - startTime
          });
        }
      });
    });
  }

  /**
   * Test 2: Socket.IO Voice Endpoint
   */
  async testSocketIOVoice() {
    this.log('Testing Socket.IO voice endpoint connection');

    return new Promise((resolve) => {
      const startTime = Date.now();
      const socket = io(`${this.baseURL}`, {
        transports: ['websocket'],
        auth: {
          token: 'test-token',
          tenantId: 'test-tenant',
          siteId: 'test-site',
          userId: 'test-user'
        }
      });

      let connected = false;
      let voiceSupport = false;

      const timeout = setTimeout(() => {
        socket.disconnect();
        resolve({
          success: false,
          error: 'Socket.IO connection timeout',
          connectionTime: Date.now() - startTime
        });
      }, 10000);

      socket.on('connect', () => {
        connected = true;
        const connectionTime = Date.now() - startTime;
        this.performanceMetrics.connectionTimes.push(connectionTime);
        this.log(`Socket.IO connected in ${connectionTime}ms`);

        // Test voice capabilities
        socket.emit('voice:capabilities');
        socket.emit('voice:start_session', {
          sessionId: 'test-session-' + Date.now(),
          config: {
            locale: 'en-US',
            voice: 'alloy'
          }
        });
      });

      socket.on('voice:capabilities_response', (data) => {
        voiceSupport = true;
        this.log('Voice capabilities received', data);
      });

      socket.on('voice:session_ready', (data) => {
        clearTimeout(timeout);
        socket.disconnect();
        resolve({
          success: true,
          connectionTime: Date.now() - startTime,
          voiceSupport: voiceSupport,
          sessionData: data
        });
      });

      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        this.error('Socket.IO connection error', error);
        resolve({
          success: false,
          error: error.message,
          connectionTime: Date.now() - startTime
        });
      });

      socket.on('disconnect', () => {
        clearTimeout(timeout);
        if (!connected) {
          resolve({
            success: false,
            error: 'Socket disconnected before establishing connection',
            connectionTime: Date.now() - startTime
          });
        }
      });
    });
  }

  /**
   * Test 3: Voice API Endpoints
   */
  async testVoiceAPIEndpoints() {
    this.log('Testing Voice API endpoints at /api/v1/voice/*');

    const endpoints = [
      { path: '/api/v1/voice/status', method: 'GET' },
      { path: '/api/v1/voice/health', method: 'GET' },
      { path: '/api/v1/voice/sessions', method: 'GET' },
      { path: '/api/v1/voice/capabilities', method: 'GET' },
      {
        path: '/api/v1/voice/sessions',
        method: 'POST',
        data: {
          tenantId: 'test-tenant',
          siteId: 'test-site',
          userId: 'test-user',
          config: { locale: 'en-US' }
        }
      }
    ];

    const results = [];

    for (const endpoint of endpoints) {
      try {
        const startTime = Date.now();
        const config = {
          method: endpoint.method,
          url: `${this.baseURL}${endpoint.path}`,
          headers: {
            'Authorization': 'Bearer test-token',
            'X-Tenant-Id': 'test-tenant',
            'Content-Type': 'application/json'
          },
          timeout: 5000
        };

        if (endpoint.data) {
          config.data = endpoint.data;
        }

        const response = await axios(config);
        const responseTime = Date.now() - startTime;

        results.push({
          endpoint: endpoint.path,
          method: endpoint.method,
          success: true,
          status: response.status,
          responseTime,
          data: response.data
        });

        this.log(`API endpoint ${endpoint.method} ${endpoint.path}: ${response.status} (${responseTime}ms)`);
      } catch (error) {
        const responseTime = Date.now() - startTime;
        results.push({
          endpoint: endpoint.path,
          method: endpoint.method,
          success: false,
          status: error.response?.status || 0,
          responseTime,
          error: error.message
        });

        this.error(`API endpoint ${endpoint.method} ${endpoint.path} failed`, error.message);
      }
    }

    return results;
  }

  /**
   * Test 4: OpenAI Realtime API Integration
   */
  async testRealtimeAPIIntegration() {
    this.log('Testing OpenAI Realtime API integration');

    try {
      // Test connection pool status
      const poolResponse = await axios.get(`${this.baseURL}/api/v1/voice/realtime/pool-status`, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-Id': 'test-tenant'
        },
        timeout: 5000
      });

      this.log('Realtime API pool status', poolResponse.data);

      // Test connection acquisition
      const connectionResponse = await axios.post(`${this.baseURL}/api/v1/voice/realtime/acquire-connection`, {
        sessionId: 'test-session-' + Date.now()
      }, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-Id': 'test-tenant',
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      return {
        success: true,
        poolStatus: poolResponse.data,
        connectionAcquisition: connectionResponse.data
      };
    } catch (error) {
      this.error('Realtime API integration test failed', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test 5: Audio Processing Pipeline
   */
  async testAudioProcessingPipeline() {
    this.log('Testing audio processing pipeline');

    try {
      // Test audio format support
      const formatsResponse = await axios.get(`${this.baseURL}/api/v1/voice/audio/formats`, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-Id': 'test-tenant'
        },
        timeout: 5000
      });

      // Test Opus framer status
      const opusResponse = await axios.get(`${this.baseURL}/api/v1/voice/audio/opus-status`, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-Id': 'test-tenant'
        },
        timeout: 5000
      });

      // Test audio converter status
      const converterResponse = await axios.get(`${this.baseURL}/api/v1/voice/audio/converter-status`, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-Id': 'test-tenant'
        },
        timeout: 5000
      });

      return {
        success: true,
        formats: formatsResponse.data,
        opusFramer: opusResponse.data,
        audioConverter: converterResponse.data
      };
    } catch (error) {
      this.error('Audio processing pipeline test failed', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test 6: Voice Authentication System
   */
  async testVoiceAuthentication() {
    this.log('Testing voice authentication system');

    try {
      // Test valid authentication
      const validAuthResponse = await axios.post(`${this.baseURL}/api/v1/voice/auth/validate`, {
        token: 'test-token',
        tenantId: 'test-tenant',
        siteId: 'test-site'
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      // Test invalid authentication
      let invalidAuthResponse;
      try {
        await axios.post(`${this.baseURL}/api/v1/voice/auth/validate`, {
          token: 'invalid-token',
          tenantId: 'test-tenant'
        }, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 5000
        });
      } catch (error) {
        invalidAuthResponse = { status: error.response?.status, error: error.message };
      }

      return {
        success: true,
        validAuth: validAuthResponse.data,
        invalidAuth: invalidAuthResponse
      };
    } catch (error) {
      this.error('Voice authentication test failed', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test 7: UnifiedVoiceOrchestrator Functionality
   */
  async testUnifiedVoiceOrchestrator() {
    this.log('Testing UnifiedVoiceOrchestrator functionality');

    try {
      // Test orchestrator status
      const statusResponse = await axios.get(`${this.baseURL}/api/v1/voice/orchestrator/status`, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-Id': 'test-tenant'
        },
        timeout: 5000
      });

      // Test performance metrics
      const metricsResponse = await axios.get(`${this.baseURL}/api/v1/voice/orchestrator/metrics`, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-Id': 'test-tenant'
        },
        timeout: 5000
      });

      return {
        success: true,
        status: statusResponse.data,
        metrics: metricsResponse.data
      };
    } catch (error) {
      this.error('UnifiedVoiceOrchestrator test failed', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test 8: Sub-300ms Latency Verification
   */
  async testLatencyTargets() {
    this.log('Testing sub-300ms latency targets');

    try {
      // Test latency measurement endpoint
      const latencyResponse = await axios.get(`${this.baseURL}/api/v1/voice/performance/latency`, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-Id': 'test-tenant'
        },
        timeout: 5000
      });

      const latencyData = latencyResponse.data;

      // Check if latency targets are met
      const targets = {
        firstToken: 200, // ms
        partial: 100,    // ms
        bargeIn: 30      // ms
      };

      const results = {
        firstTokenLatency: latencyData.firstTokenLatency || 0,
        partialLatency: latencyData.partialLatency || 0,
        bargeInLatency: latencyData.bargeInLatency || 0,
        meetsTargets: {
          firstToken: (latencyData.firstTokenLatency || 0) <= targets.firstToken,
          partial: (latencyData.partialLatency || 0) <= targets.partial,
          bargeIn: (latencyData.bargeInLatency || 0) <= targets.bargeIn
        }
      };

      return {
        success: true,
        targets,
        current: results,
        overall: Object.values(results.meetsTargets).every(Boolean)
      };
    } catch (error) {
      this.error('Latency targets test failed', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test 9: Voice Health Checks and AI Tools System
   */
  async testHealthChecksAndAITools() {
    this.log('Testing voice health checks and AI Tools system');

    try {
      // Test general health check
      const healthResponse = await axios.get(`${this.baseURL}/api/v1/voice/health`, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-Id': 'test-tenant'
        },
        timeout: 5000
      });

      // Test AI tools availability
      const aiToolsResponse = await axios.get(`${this.baseURL}/api/v1/voice/ai-tools/status`, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-Id': 'test-tenant'
        },
        timeout: 5000
      });

      // Test specific tool availability
      const toolsListResponse = await axios.get(`${this.baseURL}/api/v1/voice/ai-tools/list`, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-Id': 'test-tenant'
        },
        timeout: 5000
      });

      return {
        success: true,
        health: healthResponse.data,
        aiToolsStatus: aiToolsResponse.data,
        availableTools: toolsListResponse.data
      };
    } catch (error) {
      this.error('Health checks and AI Tools test failed', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    this.log('Starting comprehensive voice system testing');
    console.log('='.repeat(60));

    try {
      // Test 1: Voice WebSocket
      this.log('Test 1/9: Voice WebSocket Endpoint');
      this.results.webSocket = await this.testVoiceWebSocket();
      console.log('');

      // Test 2: Socket.IO
      this.log('Test 2/9: Socket.IO Voice Endpoint');
      this.results.socketIO = await this.testSocketIOVoice();
      console.log('');

      // Test 3: Voice API Endpoints
      this.log('Test 3/9: Voice API Endpoints');
      this.results.apiEndpoints = await this.testVoiceAPIEndpoints();
      console.log('');

      // Test 4: OpenAI Realtime API
      this.log('Test 4/9: OpenAI Realtime API Integration');
      this.results.realtimeAPI = await this.testRealtimeAPIIntegration();
      console.log('');

      // Test 5: Audio Processing Pipeline
      this.log('Test 5/9: Audio Processing Pipeline');
      this.results.audioProcessing = await this.testAudioProcessingPipeline();
      console.log('');

      // Test 6: Voice Authentication
      this.log('Test 6/9: Voice Authentication System');
      this.results.authentication = await this.testVoiceAuthentication();
      console.log('');

      // Test 7: UnifiedVoiceOrchestrator
      this.log('Test 7/9: UnifiedVoiceOrchestrator Functionality');
      this.results.orchestrator = await this.testUnifiedVoiceOrchestrator();
      console.log('');

      // Test 8: Latency Verification
      this.log('Test 8/9: Sub-300ms Latency Verification');
      this.results.latency = await this.testLatencyTargets();
      console.log('');

      // Test 9: Health Checks and AI Tools
      this.log('Test 9/9: Voice Health Checks and AI Tools');
      this.results.healthChecks = await this.testHealthChecksAndAITools();
      console.log('');

      this.generateReport();
    } catch (error) {
      this.error('Test suite failed', error);
    }
  }

  /**
   * Generate comprehensive test report
   */
  generateReport() {
    console.log('='.repeat(60));
    this.log('COMPREHENSIVE VOICE SYSTEM TEST REPORT');
    console.log('='.repeat(60));

    // Summary
    const totalTests = Object.keys(this.results).length;
    const passedTests = Object.values(this.results).filter(result =>
      result && (result.success || (Array.isArray(result) && result.some(r => r.success)))
    ).length;

    console.log(`\nSUMMARY: ${passedTests}/${totalTests} test categories passed`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    // Performance metrics
    if (this.performanceMetrics.connectionTimes.length > 0) {
      const avgConnectionTime = this.performanceMetrics.connectionTimes.reduce((a, b) => a + b, 0) / this.performanceMetrics.connectionTimes.length;
      console.log(`Average Connection Time: ${avgConnectionTime.toFixed(1)}ms`);
    }

    // Detailed results
    console.log('\nDETAILED RESULTS:');
    console.log('-'.repeat(40));

    Object.entries(this.results).forEach(([testName, result]) => {
      const status = this.getTestStatus(result);
      console.log(`${testName.padEnd(20)}: ${status}`);

      if (result && typeof result === 'object' && !Array.isArray(result)) {
        if (result.error) {
          console.log(`  Error: ${result.error}`);
        }
        if (result.connectionTime) {
          console.log(`  Connection Time: ${result.connectionTime}ms`);
        }
      }
    });

    // Performance targets verification
    if (this.results.latency && this.results.latency.success) {
      console.log('\nPERFORMANCE TARGETS:');
      console.log('-'.repeat(40));
      const latency = this.results.latency;
      console.log(`First Token Latency: ${latency.current?.firstTokenLatency || 'N/A'}ms (Target: ≤${latency.targets?.firstToken || 200}ms)`);
      console.log(`Partial Latency: ${latency.current?.partialLatency || 'N/A'}ms (Target: ≤${latency.targets?.partial || 100}ms)`);
      console.log(`Barge-in Latency: ${latency.current?.bargeInLatency || 'N/A'}ms (Target: ≤${latency.targets?.bargeIn || 30}ms)`);
      console.log(`Overall Target Met: ${latency.overall ? 'YES' : 'NO'}`);
    }

    // Recommendations
    console.log('\nRECOMMENDATIONS:');
    console.log('-'.repeat(40));
    this.generateRecommendations();

    // Save detailed report
    const reportPath = path.join(__dirname, 'voice-system-test-report-detailed.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        totalTests,
        passedTests,
        successRate: (passedTests / totalTests) * 100
      },
      results: this.results,
      performanceMetrics: this.performanceMetrics
    }, null, 2));

    console.log(`\nDetailed report saved to: ${reportPath}`);
  }

  getTestStatus(result) {
    if (!result) return 'FAILED (No result)';
    if (Array.isArray(result)) {
      const passed = result.filter(r => r.success).length;
      return `${passed}/${result.length} endpoints passed`;
    }
    return result.success ? 'PASSED' : 'FAILED';
  }

  generateRecommendations() {
    const recommendations = [];

    // Check WebSocket connectivity
    if (!this.results.webSocket?.success) {
      recommendations.push('- Fix Voice WebSocket endpoint connectivity issues');
    }

    // Check Socket.IO
    if (!this.results.socketIO?.success) {
      recommendations.push('- Resolve Socket.IO voice endpoint connection problems');
    }

    // Check API endpoints
    if (Array.isArray(this.results.apiEndpoints)) {
      const failedEndpoints = this.results.apiEndpoints.filter(ep => !ep.success);
      if (failedEndpoints.length > 0) {
        recommendations.push(`- Fix ${failedEndpoints.length} failed API endpoints`);
      }
    }

    // Check latency targets
    if (this.results.latency && !this.results.latency.overall) {
      recommendations.push('- Optimize performance to meet sub-300ms latency targets');
    }

    // Check Realtime API
    if (!this.results.realtimeAPI?.success) {
      recommendations.push('- Address OpenAI Realtime API integration issues');
    }

    if (recommendations.length === 0) {
      console.log('✅ All systems are functioning properly!');
    } else {
      recommendations.forEach(rec => console.log(rec));
    }
  }
}

// Run the tests
if (import.meta.url === `file://${__filename}`) {
  const tester = new VoiceSystemTester();
  tester.runAllTests().catch(error => {
    console.error('Test suite execution failed:', error);
    process.exit(1);
  });
}

export default VoiceSystemTester;