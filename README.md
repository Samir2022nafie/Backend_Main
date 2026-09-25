# HobbyHub Backend API

![CI/CD](https://github.com/nexus-project-team/Backend/actions/workflows/ci.yml/badge.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-10.4-E0234E?logo=nestjs&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-30.5-C21325?logo=jest&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED?logo=docker&logoColor=white)

REST API backend for the HobbyHub community platform, built with NestJS, Prisma ORM, and PostgreSQL.

---

## Prerequisites

- Node.js 20.x or higher
- npm 10.x or higher
- PostgreSQL 16 (or Docker)

---

## Quick Start

### 1. Environment Setup

Copy the example environment file and populate the required variables:

```bash
cp .env.example .env
```

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string (supports Neon Serverless pool URLs).
- `BETTER_AUTH_SECRET`: Secret key for Better Auth session signing & cryptographic verification.
- `PORT`: Application port (default: `3000`).
- `ENVIRONMENT`: Runtime mode (`dev` for detailed verbose HTTP logs, `production` for standard logging).

---

### 2. Install Dependencies

```bash
npm install
```

---

### 3. Database Migration & Seeding

Generate Prisma client and apply database migrations:

```bash
npx prisma generate
npx prisma migrate dev
```

Seed initial taxonomy and categories:

```bash
npm run seed
```

---

### 4. Run Application

#### Development Mode (with hot-reload):
```bash
npm run start:dev
```

#### Production Build & Run:
```bash
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3000/api/v1`.

---

### 5. Docker Deployment

#### Using Docker Compose (PostgreSQL + Backend):
```bash
docker compose up -d --build
```

#### Standalone Container Build:
```bash
docker build -t hobbyhub-backend .
docker run -p 3000:3000 --env-file .env hobbyhub-backend
```

---

## Testing

Run unit and integration test suites:

```bash
# Run all 35 test suites
npm test

# Run tests in watch mode
npm run test:watch

# Run test coverage report
npm run test:cov
```

---

## API Specification

Complete `.http` contracts and example requests/responses are documented in the `api_contracts/` directory:
- `api_contracts/auth/auth.http`
- `api_contracts/communities/communities.http`
- `api_contracts/posts/posts.http`
- `api_contracts/comments/comments.http`
- `api_contracts/events/events.http`
- `api_contracts/hangouts/hangouts.http`
- `api_contracts/reports/reports.http`
- `api_contracts/social/social.http`
