# Vritti Core Backend 🚀

Vritti is a parametric micro-insurance platform designed for gig workers. This repository contains the core Node.js/TypeScript backend that handles telemetry processing, disruption analysis, and automated claim payouts.

## 🌟 Key Features
- **Parametric Claims**: Automated payouts (₹500) triggered by zonal disruptions (weather/news/activity drops).
- **Edge Engine Integration**: Real-time processing of high-frequency sensor telemetry.
- **Unified Dashboard**: Single-call aggregation of earnings, premiums, and notifications.
- **Notification System**: Real-time status updates for payout events and system alerts.

---

## 🛠️ Tech Stack
- **Runtime**: Node.js (v20+)
- **Language**: TypeScript
- **Database**: PostgreSQL (hosted on Render/Neon)
- **ORM**: Prisma (v7.6.0)
- **Framework**: Express.js (v5)

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have `node` and `npm` installed.

### 2. Installation
```bash
git clone https://github.com/aadithyaa/vritti.git
cd vritti
npm install
```

### 3. Environment Setup
Create a `.env` file in the root directory:
```env
DATABASE_URL="your_postgresql_connection_string"
PYTHON_SCRAPER_URL="http://localhost:8000"
OPENWEATHER_API_KEY="your_api_key"
```

### 4. Database Sync
Synchronize the schema and generate the Prisma Client:
```bash
npx prisma generate
npx prisma db push
```

### 5. Running the App
```bash
npm run dev
```
The server will start at `http://localhost:3000`.

---

## 📡 API Contract (v1)

### Dashboard
- `GET /api/v1/user/dashboard/:userId` - Returns unified state (wallet, earnings, notifications).

### Telemetry & Heartbeat
- `POST /api/v1/telemetry/heartbeat` - Sync live sensor data and GPS status.
- `GET /api/v1/user/heartbeat/:userId` - Poll for fraud status and latest beats.

### Claims
- `POST /api/v1/claims/trigger` - Manual/One-Touch claim trigger.

### Demo & Simulation
- `POST /api/demo/simulate-week` - Mock a week of driving (earnings/SIP).
- `npx tsx src/seed.ts` - Seed the database with demo users.

---

## 🏗️ Project Structure
- `src/modules/` - Feature-based modules (Dashboard, Disruption, Fraud).
- `src/services/` - Cross-functional services (Notification, Payout).
- `prisma/` - Database schema and configurations.
- `dist/` - Compilation output (build-isolated).

---

## 🧹 Maintenance
- `npm run clean` - Remove all build artifacts from root and `src`.
- `npm run build-production` - Perform a clean production build to `dist/`.

---

## 🎯 Demo Ready
Run the seed script to instantly populate the database with a "Success Case" and a "Fraud Case":
```bash
npm run clean
npx tsx src/seed.ts
```
Check the server logs for the generated User IDs!
