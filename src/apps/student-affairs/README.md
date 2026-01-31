# Student Affairs App

> **Status**: 🚧 In Development
> **Created**: January 31, 2026

## Overview

The Student Affairs application manages all student welfare services including grievances, scholarships, counseling, disciplinary actions, clubs, and elections.

## Directory Structure

```
student-affairs/
├── index.js                    # App entry point (Express Router)
├── constants/
│   └── index.js                # App-wide constants
├── modules/
│   ├── grievance/              # Student grievance management
│   │   ├── grievance.controller.js
│   │   ├── grievance.service.js
│   │   ├── grievance.routes.js
│   │   ├── grievance.validation.js
│   │   └── grievance.constants.js
│   ├── scholarship/            # Scholarship applications
│   ├── counseling/             # Counseling appointments
│   ├── disciplinary/           # Disciplinary actions
│   ├── clubs/                  # Student clubs & organizations
│   └── elections/              # Student body elections
└── README.md
```

## Modules

### Grievance Module 🎯
Handle student complaints and grievances with status tracking, assignment, and resolution.

**Endpoints:**
- `POST /grievances` - Submit a grievance
- `GET /grievances` - List grievances (filtered by role)
- `GET /grievances/:id` - Get grievance details
- `PATCH /grievances/:id/status` - Update status
- `PATCH /grievances/:id/assign` - Assign to staff
- `DELETE /grievances/:id` - Delete (pending only)
- `GET /grievances/stats` - Statistics

### Scholarship Module 💰
Manage scholarship applications, reviews, and disbursements.

**Endpoints:**
- `POST /scholarships` - Apply for scholarship
- `GET /scholarships` - List applications
- `GET /scholarships/:id` - Get application details
- `PATCH /scholarships/:id/status` - Update status
- `GET /scholarships/stats` - Statistics

### Counseling Module 🧠
Schedule and manage counseling sessions.

**Endpoints:**
- `POST /counseling/request` - Request appointment
- `GET /counseling/appointments` - List appointments
- `PATCH /counseling/:id/schedule` - Schedule appointment
- `PATCH /counseling/:id/complete` - Mark as complete
- `GET /counseling/slots` - Available slots

### Disciplinary Module ⚖️
Handle disciplinary cases, hearings, and actions.

**Endpoints:**
- `POST /disciplinary/report` - Report incident
- `GET /disciplinary/cases` - List cases
- `PATCH /disciplinary/:id/investigate` - Start investigation
- `POST /disciplinary/:id/hearing` - Schedule hearing
- `PATCH /disciplinary/:id/action` - Take action

### Clubs Module 🎭
Manage student clubs and organizations.

**Endpoints:**
- `POST /clubs` - Create club
- `GET /clubs` - List clubs
- `POST /clubs/:id/join` - Join club
- `POST /clubs/:id/events` - Create event
- `GET /clubs/:id/members` - List members

### Elections Module 🗳️
Handle student body elections.

**Endpoints:**
- `POST /elections` - Create election
- `POST /elections/:id/nominate` - Submit nomination
- `POST /elections/:id/vote` - Cast vote
- `GET /elections/:id/results` - Get results

## API Base Path

All endpoints are prefixed with:
```
/api/v1/student-affairs
```

## Authentication

All routes require authentication via the shared auth middleware. Authorization is handled per-endpoint based on roles defined in `constants/index.js`.

## Usage

```javascript
// Import in main app.js
import studentAffairsApp from './apps/student-affairs/index.js';

// Mount
app.use('/api/v1/student-affairs', studentAffairsApp);
```

## Development Guidelines

1. Each module follows the exact same structure
2. Services extend `BaseService` from shared
3. Controllers use `asyncHandler` - no try-catch
4. All routes have validation middleware
5. Constants are defined in module's constants file
6. Use shared utilities for common operations
