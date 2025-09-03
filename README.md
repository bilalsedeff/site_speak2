# SiteSpeak - Voice-First Website Builder

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/sitespeak/sitespeak)
[![Voice Services](https://img.shields.io/badge/voice-realtime-blue)](./docs/voice-services.md)
[![API Docs](https://img.shields.io/badge/api-documented-success)](./docs/api/voice-endpoints.md)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

SiteSpeak is a Wix/GoDaddy-class website builder where every published site ships with a built-in, **voice-first, agentic assistant** that can understand the site, take actions (navigate, filter, add to cart, book, etc.), and stay fresh by recrawling and updating its own knowledge base.

## 🎙️ Real-Time Voice System

Our voice system delivers industry-leading performance with:

- **≤300ms first token latency** - Real-time streaming responses
- **≤150ms partial transcription** - Live speech-to-text feedback  
- **≤50ms barge-in response** - Instant TTS interruption when user speaks
- **AudioWorklet processing** - Low-latency audio capture and VAD
- **Opus 20ms framing** - Optimal network efficiency
- **OpenAI Realtime API** - Streaming STT/TTS integration

## 🆕 Neler Yeni (Core Geliştirmeler)

- Intent Engine: Theme-agnostic, tool‑sözlüğü destekli niyet sınıflandırma
- Tool Registry + Extensibility SDK: Aksiyon kayıt/çağırma, timeouts
- Dynamic Crawling: Opsiyonel Playwright adaptörü entegrasyonu
- KB Enrichment: Özet, konu etiketleri, S‑Q&A, varlık/ilişki çıkarımı
- Dialog Memory ve Language/Tone: EN varsayılan, TR opsiyonel
- Centralized Error Handling ve Security/Privacy katmanları
- Observability (Prometheus) ve Analytics uçları
- Experiments (feature flags, A/B)

## 🚀 **Hızlı Başlangıç**

### ⚡ **Docker ile Kurulum (Önerilen)**

```bash
# 1. Repo'yu klonlayın
git clone <repository-url>
cd site_speak

# 2. Environment dosyasını hazırlayın
cp environment.example .env

# 3. .env dosyasını düzenleyin (ZORUNLU!)
# Aşağıdaki değişkenleri mutlaka doldurun:
# OPENAI_API_KEY=sk-your_openai_api_key_here
# JWT_SECRET=your_long_random_secret_here (32+ karakter)
# ENCRYPTION_KEY=your_32_character_encryption_key_ (tam 32 karakter)

# 4. Tüm servisleri başlatın
npm run docker:dev

# 5. Servisler hazır olana kadar bekleyin (2-3 dakika)
npm run docker:dev:logs


```

### 📋 **Erişim Adresleri**

- **🏠 Ana Uygulama**: [http://localhost:3000](http://localhost:3000)
- **🔌 API Server**: [http://localhost:5000/api/health](http://localhost:5000/api/health)
- **💾 Database Admin**: [http://localhost:8081](http://localhost:8081) (opsiyonel)

---

## 📖 **Detaylı Kurulum**

### 🔧 **Sistem Gereksinimleri**

- **Docker & Docker Compose** (güncel versiyon)
- **Node.js 18.x veya 20.x** (manuel kurulum için)
- **PostgreSQL 15+** (manuel kurulum için)
- **Redis 6+** (manuel kurulum için)
- **En az 4GB RAM** (Docker için)

### 🏗️ **Manuel Kurulum**

```bash
# 1. Dependencies yükleyin
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

# 2. Database servisleri başlatın
docker-compose -f docker-compose.dev.yml up -d sitespeak-postgres-dev sitespeak-redis-dev

# 3. Database migrations çalıştırın
cd server && npm run db:migrate && npm run db:seed

# 4. Development serverları başlatın
npm run dev
```

### 🔑 **Environment Değişkenleri**

`.env` dosyasında mutlaka doldurmanız gerekenler:

```env
# 🔥 ZORUNLU - OpenAI API Key
OPENAI_API_KEY=sk-your_openai_api_key_here

# 🔒 ZORUNLU - JWT Secret (uzun random string)
JWT_SECRET=your_super_long_random_secret_key_here_min_32_chars

# 🔐 ZORUNLU - Encryption Key (tam 32 karakter)
ENCRYPTION_KEY=your_32_character_encryption_key_

# 🗄️ Database (Docker kullanıyorsanız değiştirmeyin)
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/sitespeak_dev_db
REDIS_URL=redis://localhost:6380

# 🌐 Application URLs
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:5000
WIDGET_URL=http://localhost:8080

# 🎭 AI Configuration
AI_MODEL=gpt-4o
# Not: varsayılan embedding modeli backend'de text-embedding-3-small olarak ayarlanmıştır
# aşağıdaki değer yalnızca bilgilendiricidir
EMBEDDING_MODEL=text-embedding-3-small
MAX_TOKENS=4000

# 📊 Development/Production
NODE_ENV=development
LOG_LEVEL=info

# Feature flags / pipelines
INTENT_ENGINE_ENABLED=true
ENABLE_VECTOR_PERSIST=false
USE_PLAYWRIGHT_CRAWLER=false
# Advanced extraction (HTML+DB+logs)
ADVANCED_EXTRACTION=false
# Schedule periodic re-indexing (cron expr)
AUTO_INDEX_CRON=
# Silence KB logs in dev/CI
SITESPEAK_KB_QUIET=false
```

---

## 🗣️ **Voice AI Testi (Genel)**

Yerel veya staging ortamınızdaki herhangi bir SiteSpeak sitesi ile voice agent'ı test edebilirsiniz. Herhangi bir hardcoded demo veya örnek içeriğe ihtiyaç yoktur.

Önerilen test akışı:

1. Yayınlanmış siteye gidin ve alt sağdaki mikrofon butonunu etkinleştirin
2. Tarayıcı mikrofon iznini verin
3. Sitenizin içeriğine dair sorular sorun (ör. çalışma saatleri, hizmetler, ürünler)
4. Yanıtları AI Training Dashboard üzerinden iyileştirin (Custom Q&A ekleyin) ve Reindex tetikleyin
5. Gerekirse ses yerine metinle test edin (text fallback desteklenir)

---

## 🏗️ **Geliştirme Ortamı**

### 📁 **Proje Yapısı**

```plaintext
site_speak/
├── 🎨 client/                 # React frontend
│   ├── src/components/
│   │   ├── voice/            # Voice widget components
│   │   ├── editor/           # Drag-drop editor
│   │   └── ai/               # AI admin panels
│   └── src/pages/            # Application pages
├── 🔧 server/                 # Node.js backend
│   ├── src/services/ai/      # AI services
│   ├── src/routes/           # API endpoints
│   └── src/db/               # Database schema

├── 🐳 docker-compose.dev.yml  # Development environment
└── 📝 scripts/               # Setup scripts
```

### 🔄 **Development Workflow**

```bash
# 🐳 Docker ile geliştirme
npm run docker:dev          # Start all services
npm run docker:dev:logs     # Watch logs
npm run docker:dev:stop     # Stop services
npm run docker:dev:reset    # Complete reset

# 🔧 Manuel development
npm run dev                  # Start frontend + backend
npm run dev:client          # Only frontend (port 3000)
npm run dev:server          # Only backend (port 5000)

# 🧪 Testing
npm run test                 # Run tests
npm run test:e2e            # End-to-end tests
npm run test:performance    # Performance tests

# 🗄️ Database yönetimi
npm run db:migrate          # Run migrations
npm run db:seed             # Seed data
npm run db:reset            # Reset database
```

### 🎯 **API Endpoints**

#### **Voice AI Endpoints**

```http
POST /api/ai/voice/text          # Text interaction (fallback to voice)
POST /api/ai/voice/tts           # Text-to-speech
GET  /api/ai/voice/health        # Health check
```

#### **Knowledge Base Endpoints**

```http
POST /api/ai/knowledge/search/:siteId    # Search knowledge base
POST /api/ai/knowledge/index/:siteId     # Trigger indexing
GET  /api/ai/knowledge/status/:siteId    # Indexing status
```

#### **Admin Endpoints**

```http
GET  /api/ai/sites/:siteId/ai/config     # Get AI config
PUT  /api/ai/sites/:siteId/ai/config     # Update AI config
GET  /api/ai/sites/:siteId/ai/analytics  # Analytics data (byType, total, conversationTrends)
```

---

## 🧪 **Testing & Debugging**

### 🔍 **Voice Agent Test Adımları**

1. **🏃‍♂️ Sistemi Başlatın**:

   ```bash
   npm run docker:dev
   # Wait for "All services ready" message
   ```

2. **👤 Demo Account Oluşturun**:
   - [http://localhost:3000](http://localhost:3000) → Sign Up
   - Email: `test@sitespeak.com`
   - Password: `test123456`

3. **🏗️ Yeni Site Oluşturun**:
   - Dashboard → "Create New Site"
   - Restaurant template seçin
   - Site adı: "Test Restaurant"

4. **🤖 AI Agent Yapılandırın**:
   - Voice AI Dashboard → AI Configuration
   - Agent Name: "Restaurant Assistant"
   - Personality: "Friendly and helpful"
   - Actions: Enable reservations, menu queries

5. **🗣️ Voice Test Edin**:
   - Published site URL'sine gidin
   - Voice widget → Enable voice mode
   - Test queries yukarıdaki senaryolarla

### 🐛 **Common Issues & Solutions**

#### **❌ Voice Çalışmıyor**

```bash
# Çözüm 1: Tarayıcı izinleri kontrol et
# Chrome → Settings → Privacy → Site Settings → Microphone

# Çözüm 2: HTTPS gerekiyor (production için)
# Development'ta localhost üzerinde çalışır

# Çözüm 3: OpenAI API key kontrol et
curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models
```

#### **❌ Database Connection Error**

```bash
# Database status kontrol et
docker exec sitespeak-postgres-dev pg_isready -U postgres -d sitespeak_dev_db

# Database restart
docker-compose -f docker-compose.dev.yml restart sitespeak-postgres-dev

# Complete reset
npm run docker:dev:reset
```

#### **❌ AI Responses Yavaş**

```bash
# Redis cache kontrol et
docker exec sitespeak-redis-dev redis-cli ping

# OpenAI API status
curl https://status.openai.com/api/v2/status.json

# Model değiştir (cheaper/faster) veya cache ayarlarını güncelleyin
# .env dosyasında: AI_MODEL=gpt-4o-mini
```

### 📊 **Performance Monitoring**

```bash
# Docker resource usage
docker stats

# API response times
curl -w "@curl-format.txt" http://localhost:5000/api/health

# Database queries
docker exec sitespeak-postgres-dev psql -U postgres -d sitespeak_dev_db -c "SELECT * FROM pg_stat_activity;"
```

---

## 🚀 **Production Deployment**

### 🌐 **Production Hazırlık**

```bash
# 1. Production environment dosyası
cp .env.example .env.production

# 2. Production değerlerini güncelleyin
NODE_ENV=production
DATABASE_URL=postgresql://user:password@production-db:5432/sitespeak_prod
REDIS_URL=redis://production-redis:6379
FRONTEND_URL=https://yourdomain.com
BACKEND_URL=https://api.yourdomain.com

# 3. Production build
docker build -t sitespeak:latest .

# 4. Production services
docker-compose -f docker-compose.yml up -d
```

### 🔒 **Production Security Checklist**

- [ ] **SSL/HTTPS** certificates configured
- [ ] **Environment variables** secured and rotated
- [ ] **Database backups** automated
- [ ] **Rate limiting** configured
- [ ] **API keys** rotated and secured
- [ ] **CORS** properly configured
- [ ] **Input validation** on all endpoints
- [ ] **Error logging** without sensitive data
- [ ] **Resource monitoring** (CPU, memory, disk)
- [ ] **Uptime monitoring** configured

### 📈 **Scaling Considerations**

```yaml
# docker-compose.production.yml örneği
version: '3.8'
services:
  sitespeak-app:
    image: sitespeak:latest
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis-cluster:6379
      - DATABASE_URL=postgresql://postgres:password@postgres-cluster/sitespeak_prod
```

---

## 📚 **Architecture & Technology Stack**

### 🏗️ **System Architecture**

```plaintext
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │────│   API Gateway   │────│   Microservices │
│   React + TS    │    │   Express.js    │    │   AI, Voice,    │
│   Voice Widget  │    │   Auth, Proxy   │    │   Knowledge Base│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         v                       v                       v
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CDN Assets    │    │   Load Balancer │    │   Vector Store  │
│   Static Files  │    │   NGINX/HAProxy │    │   PostgreSQL    │
│   Voice Widgets │    │   SSL, Caching  │    │   pgvector      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 🛠️ **Technology Stack**

#### **Frontend**

- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **Radix UI** for components
- **Zustand** for state management
- **React Query** for API calls

#### **Backend**

- **Node.js 20** with Express.js
- **TypeScript** for type safety
- **Drizzle ORM** for database
- **PostgreSQL** with pgvector
- **Redis** for caching
- **Socket.io** for real-time

#### **AI & Voice**

- OpenAI GPT‑4o (conversation)
- Whisper API (STT)
- ElevenLabs/Azure (TTS)
- Tool calling + dynamic intent mapping
- Vector embeddings (semantic search)

---

## 📖 Documentation

- API Overview: `docs/api/overview.md`
- Training Guides: `docs/training/` → quickstart, voice‑agent, actions‑and‑tools
- Knowledge Base Protocol: `docs/knowledge-base-protocol.md`

### **Infrastructure**

- **Docker & Kubernetes** for containers
- **AWS/GCP** for cloud hosting
- **Cloudflare** for CDN
- **NGINX** for reverse proxy
- **GitHub Actions** for CI/CD

---

## 🤝 **Contributing**

### 🔄 **Development Process**

1. **Fork** the repository
2. **Create** feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** changes: `git commit -m 'Add amazing feature'`
4. **Push** to branch: `git push origin feature/amazing-feature`
5. **Open** Pull Request

### 📋 **Code Standards**

```bash
# Code formatting
npm run format          # Prettier
npm run lint           # ESLint
npm run type-check     # TypeScript

# Testing requirements
npm run test           # Unit tests
npm run test:e2e       # E2E tests
npm run test:coverage  # Coverage report

# Commit message format
feat: add voice widget component
fix: resolve database connection issue
docs: update API documentation
```

### 🐛 **Bug Reports**

Issue template:

```markdown
**Bug Description**
Clear description of the bug

**To Reproduce**

1. Go to '...'
2. Click on '...'
3. See error

**Expected Behavior**
What should happen

**Environment**

- OS: [e.g. Windows 11]
- Browser: [e.g. Chrome 120]
- Docker Version: [e.g. 24.0.7]
```

---

## 📝 **License & Credits**

### 📄 **License**

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

### 🙏 **Credits**

- **OpenAI** for GPT-4o and Whisper APIs
- **Vercel** for Next.js inspiration
- **Tailwind Labs** for design system
- **Radix UI** for accessible components
- **React** and **Node.js** communities

### 🌟 **Acknowledgments**

- Inspired by **Wix ADI** for AI-powered site building
- **GoDaddy Websites** for platform scalability patterns
- **Webflow** for sophisticated visual editor design
- **Shopify** for robust API and e-commerce integrations

---

## 📞 **Support & Documentation**

### 💬 **Getting Help**

- **📖 Documentation**: [Full docs](https://docs.sitespeak.com)
- **💭 Discussions**: [GitHub Discussions](https://github.com/username/sitespeak/discussions)
- **🐛 Issues**: [Bug Reports](https://github.com/username/sitespeak/issues)
- **💬 Discord**: [Community Chat](https://discord.gg/sitespeak)

### 🔗 **Useful Links**

- **🎥 Video Tutorials**: [YouTube Playlist](https://youtube.com/sitespeak)
- **📝 Blog**: [Latest Updates](https://blog.sitespeak.com)
- **🐦 Twitter**: [@SiteSpeak](https://twitter.com/sitespeak)
- **📧 Email**: [support@sitespeak.com](mailto:support@sitespeak.com)

---

<!-- markdownlint-disable MD033 -->

<p align="center">

<strong>🎉 SiteSpeak ile geleceğin websitelerini bugün oluşturun!</strong>

Made with ❤️ by the SiteSpeak Team

[⭐ Star us on GitHub](https://github.com/username/sitespeak) &nbsp;|&nbsp; [🐦 Follow on Twitter](https://twitter.com/sitespeak) &nbsp;|&nbsp; [📖 Read the Docs](https://docs.sitespeak.com)

</p>

<!-- markdownlint-enable MD033 -->
