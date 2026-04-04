# Vritti Core Backend

## Overview

Vritti is a parametric income-protection platform built for gig workers. It operates as an automated micro-insurance system that replaces lost daily earnings when verifiable civic or environmental disruptions (e.g., severe cyclones, extreme flooding, transport strikes) halt city operations.

The core philosophy of the system is: the disruption is verifiable, the loss is calculable, and the payout is automatic.

This repository houses the central Node.js backend. It acts as the orchestration layer, connecting the mobile client's edge telemetry, the machine learning pricing engine, and the automated news/weather scrapers to execute payouts autonomously.

## System Architecture

The backend serves as the nervous system connecting four primary components:

1. **Core API (This Repository):** Manages user authentication, wallet balances, active policies, telemetry ingestion, and triggers the automated claim evaluation pipeline.
    
2. **Pricing Engine:** A Python-based ML service that calculates dynamic weekly premiums based on predictive weather, civic risk, and rider history.
    
3. **Event Scraper:** A Python/Gemini-powered pipeline that continuously monitors RSS feeds and weather APIs (Open-Meteo) to declare city-wide disruptions.
    
4. **Edge Trust Layer:** A Flutter mobile application that runs physics-based GPS/Accelerometer correlation to detect location spoofing locally, sending only encrypted "heartbeats" to this backend.
    

## Tech Stack

- **Runtime:** Node.js (v22+)
    
- **Language:** TypeScript
    
- **Framework:** Express.js
    
- **Database:** PostgreSQL
    
- **ORM:** Prisma Client (v7.6.0)
    
- **HTTP Client:** Axios
    

## Getting Started

### Prerequisites

- Node.js installed on your local machine.
    
- A running instance of PostgreSQL.
    
- Access to the external Python ML Engine and Scraper services (or mock endpoints for local testing).
    

### Environment Configuration

Create a `.env` file in the root directory and populate it with the required configuration:

### Installation

1. Clone the repository:
    
2. Install dependencies:
    
3. Synchronize the database schema and generate the Prisma client:
    
4. (Optional) Seed the database with initial demo data:
    

### Running the Application

To run the application in development mode with hot-reloading:

To build and run for production:

## Project Structure

The source code is modularized by domain within the `src/modules` directory:

## Key API Domains

### Authentication

- `POST /api/v1/auth/request-otp` - Initiates the login sequence.
    
- `POST /api/v1/auth/verify-otp` - Completes login and provisions a new user wallet/policy.
    

### Telemetry & Anti-Fraud

- `POST /api/v1/telemetry/heartbeat` - Receives 10-second interval sensor data from the mobile app. Flags anomalies to prevent location spoofing.
    

### Parametric Claims

- `POST /api/v1/claims/one-touch` - Evaluates a user for a payout. This endpoint cross-references the user's active policy, the live weather API (Open-Meteo), the News Scraper, and the local Edge Fraud status before executing a wallet transfer.
    

### Machine Learning Pricing

- `GET /api/v1/pricing/quote/:userId` - Fetches a dynamic premium quote by compiling user history and passing it to the external ML model.
    
- `POST /api/v1/premium/renew` - Batch processes all active users for their weekly policy renewal.
    

## Automated Schedules

The backend operates several time-based routines (typically configured via cron or external schedulers):

- **Afternoon/Evening Disruption Checks:** Automatically evaluates city-wide metrics to determine if a mass payout event should be triggered.
    
- **Weekly Policy Renewals:** Runs every Saturday night to calculate the upcoming week's dynamic premium, deduct it from user wallets, and generate new active policies.
    

## Security & Anti-Fraud

To protect the system from mass GPS spoofing attacks, Vritti does not rely solely on server-side location tracking. The mobile application computes a Pearson correlation between physical device vibration (accelerometer) and GPS speed.

The backend records the resulting `isDeviceSecure` status during the heartbeat sync. If a user attempts to file a claim while their device telemetry is flagged as fraudulent or static, the `/one-touch` claim endpoint will automatically reject the transaction, citing inconsistent edge telemetry.