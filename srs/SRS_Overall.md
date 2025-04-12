# Software Requirements Specification (SRS)

# Hostel Management System (HMS)

**Version:** 1.0
**Date:** 2024-08-02

## Table of Contents

1.  **Introduction**
    1.1 Purpose
    1.2 Scope
    1.3 Definitions, Acronyms, and Abbreviations
    1.4 References
    1.5 Overview
2.  **Overall Description**
    2.1 Product Perspective
    2.2 Product Functions
    2.3 User Characteristics
    2.4 Constraints
    2.5 Assumptions and Dependencies
3.  **Specific Requirements**
    3.1 Functional Requirements
    3.1.1 Authentication and Authorization
    3.1.2 Student Module
    3.1.3 Warden Module
    3.1.4 Admin Module
    3.1.5 Security Module
    3.1.6 Super Admin Module
    3.1.7 Complaint Management
    3.1.8 Lost and Found Management
    3.1.9 Event Management
    3.1.10 Hostel Management
    3.1.11 Statistics and Reporting
    3.1.12 Feedback Management
    3.1.13 File Upload Management
    3.1.14 Visitor Management
    3.1.15 Notification Management
    3.1.16 Disciplinary Committee (DisCo) Management
    3.1.17 Payment Management
    3.1.18 External API Integrations
    3.2 Non-Functional Requirements
    3.2.1 Performance
    3.2.2 Security
    3.2.3 Usability
    3.2.4 Reliability
    3.2.5 Maintainability
    3.3 Interface Requirements
    3.3.1 User Interfaces
    3.3.2 Software Interfaces
    3.3.3 Hardware Interfaces
    3.3.4 Communication Interfaces
    3.4 Database Requirements

## 1. Introduction

### 1.1 Purpose

This document defines the Software Requirements Specification (SRS) for the Hostel Management System (HMS). The purpose of the HMS is to provide a centralized, web-based platform to manage various hostel operations efficiently, catering to the needs of students, wardens, administrative staff, security personnel, and super administrators.

### 1.2 Scope

The HMS will manage:

- User authentication and role-based access.
- Student information and activities (profile, complaints, fees, events).
- Warden responsibilities (student management, complaint handling, approvals).
- Administrative tasks (hostel setup, user management, fee configuration, reporting).
- Security operations (visitor logging).
- Super administrative oversight and configuration.
- Core hostel functions like complaint lodging, lost and found reporting, event scheduling, fee payments, visitor tracking, and notifications.
- Integration with external services for payments (Razorpay) and file storage (Azure Blob Storage).

### 1.3 Definitions, Acronyms, and Abbreviations

- **HMS:** Hostel Management System
- **SRS:** Software Requirements Specification
- **Admin:** Administrative staff managing hostel operations.
- **Warden:** Staff responsible for specific hostel blocks/floors and student welfare.
- **Student:** Resident of the hostel.
- **Security:** Personnel responsible for hostel security and visitor management.
- **Super Admin:** Top-level administrator with full system control.
- **DisCo:** Disciplinary Committee.
- **JWT:** JSON Web Token
- **API:** Application Programming Interface
- **UI:** User Interface
- **CRUD:** Create, Read, Update, Delete

### 1.4 References

- Project Codebase (including `server.js`, `package.json`, route files)
- Node.js, Express.js, MongoDB, Mongoose documentation
- Razorpay API Documentation
- Azure Blob Storage Documentation

### 1.5 Overview

This SRS document is organized into three main sections: Introduction, Overall Description, and Specific Requirements. Section 1 provides the purpose, scope, and context. Section 2 gives a high-level overview of the product, its functions, users, and constraints. Section 3 details the specific functional, non-functional, interface, and database requirements.

## 2. Overall Description

### 2.1 Product Perspective

The HMS is a self-contained, web-based application intended to replace or augment manual hostel management processes. It interfaces with external systems for payment processing (Razorpay) and cloud file storage (Azure Blob Storage). It operates using a standard client-server architecture with a web frontend (implied by CORS configuration) interacting with a Node.js/Express.js backend API connected to a MongoDB database.

### 2.2 Product Functions

The major functions provided by the HMS include:

- Secure user login and registration.
- Role-based dashboards and functionalities.
- Student profile management.
- Hostel and room information management.
- Online complaint registration and tracking.
- Lost and found item reporting and management.
- Event creation and notification.
- Online fee payment processing and history tracking.
- Visitor entry/exit logging.
- Feedback submission and viewing.
- System statistics and report generation.
- Notification delivery to users.
- Management of disciplinary actions.
- File uploads for various purposes (profiles, attachments).

### 2.3 User Characteristics

- **Students:** Tech-savvy residents needing access to personal info, hostel services, and communication channels.
- **Wardens:** Staff requiring tools to manage students, address issues, and communicate notices within their assigned areas.
- **Admin Staff:** Users needing oversight of overall hostel operations, user management, financial aspects, and system configuration.
- **Security Personnel:** Users focused on managing access control and logging visitor information.
- **Super Admin:** Technical or high-level administrators responsible for system-wide configuration, user roles, and potentially multi-hostel management.
- **(Potential) Disciplinary Committee Members:** Users needing access to view and record disciplinary cases.

All users are expected to have basic web browsing skills.

### 2.4 Constraints

- The system must run on a server environment supporting Node.js.
- A stable internet connection is required for users and the server.
- MongoDB must be used as the primary database.
- Azure Blob Storage is required for file storage.
- A Razorpay account is necessary for payment gateway integration.
- The backend is built using Express.js framework.
- Authentication relies on JWT.
- Password hashing uses bcrypt.

### 2.5 Assumptions and Dependencies

- Users will have valid credentials to access the system.
- The underlying infrastructure (server, database, network) is reliable.
- External services (Razorpay, Azure) are available and functional.
- The frontend application consuming the API exists or will be developed separately.
- Data provided by users (e.g., registration details, complaint info) is accurate to a reasonable extent.

## 3. Specific Requirements

### 3.1 Functional Requirements

#### 3.1.1 Authentication and Authorization (`/api/auth`)

- FR1.1.1: The system shall allow new users (students, potentially others depending on workflow) to register.
- FR1.1.2: Registered users shall be able to log in using their credentials (e.g., email/username and password).
- FR1.1.3: The system shall implement password hashing (bcrypt) for secure storage.
- FR1.1.4: The system shall use JSON Web Tokens (JWT) for session management and API authentication.
- FR1.1.5: The system shall implement role-based access control (RBAC) to restrict access to functionalities based on user roles (Student, Warden, Admin, Security, Super Admin).
- FR1.1.6: The system should provide a mechanism for password recovery/reset.
- FR1.1.7: Users shall be able to log out.

#### 3.1.2 Student Module (`/api/student`)

- FR1.2.1: Students shall be able to view and update their profile information.
- FR1.2.2: Students shall be able to view their allocated hostel/room details.
- FR1.2.3: Students shall be able to submit complaints (See 3.1.7).
- FR1.2.4: Students shall be able to report lost/found items (See 3.1.8).
- FR1.2.5: Students shall be able to view upcoming events (See 3.1.9).
- FR1.2.6: Students shall be able to view their fee dues and payment history (See 3.1.17).
- FR1.2.7: Students shall be able to submit feedback (See 3.1.12).
- FR1.2.8: Students shall be able to view notifications relevant to them (See 3.1.15).

#### 3.1.3 Warden Module (`/api/warden`)

- FR1.3.1: Wardens shall be able to view details of students under their supervision.
- FR1.3.2: Wardens shall be able to manage/view room allocations within their jurisdiction.
- FR1.3.3: Wardens shall be able to view and manage complaints assigned to them (See 3.1.7).
- FR1.3.4: Wardens shall be able to manage lost and found items reported within their area (See 3.1.8).
- FR1.3.5: Wardens shall be able to post notices or announcements visible to their students.
- FR1.3.6: Wardens shall be able to view student feedback.
- FR1.3.7: Wardens shall receive relevant notifications (See 3.1.15).

#### 3.1.4 Admin Module (`/api/admin`)

- FR1.4.1: Admins shall be able to perform CRUD operations on user accounts (Students, Wardens, Security).
- FR1.4.2: Admins shall be able to manage user roles and permissions.
- FR1.4.3: Admins shall be able to manage hostel structure (blocks, rooms) (See 3.1.10).
- FR1.4.4: Admins shall be able to manage room allocations.
- FR1.4.5: Admins shall have oversight of the complaint management system (See 3.1.7).
- FR1.4.6: Admins shall have oversight of the lost and found system (See 3.1.8).
- FR1.4.7: Admins shall manage system-wide events and announcements (See 3.1.9).
- FR1.4.8: Admins shall manage fee structures and monitor payments (See 3.1.17).
- FR1.4.9: Admins shall be able to view system statistics and generate reports (See 3.1.11).
- FR1.4.10: Admins shall manage feedback responses (See 3.1.12).
- FR1.4.11: Admins shall manage system notifications (See 3.1.15).
- FR1.4.12: Admins shall have oversight of disciplinary actions (See 3.1.16).

#### 3.1.5 Security Module (`/api/security`)

- FR1.5.1: Security personnel shall be able to log visitor entries and exits (See 3.1.14).
- FR1.5.2: Security personnel shall be able to view a log of recent visitor activity.
- FR1.5.3: (Optional) Security might manage student check-in/check-out logs if applicable.

#### 3.1.6 Super Admin Module (`/api/super-admin`)

- FR1.6.1: Super Admins shall have all privileges of Admins.
- FR1.6.2: Super Admins shall be able to manage Admin accounts.
- FR1.6.3: Super Admins shall manage system-level configurations (e.g., integration keys, core settings).
- FR1.6.4: Super Admins may have oversight capabilities across multiple hostel instances if applicable.

#### 3.1.7 Complaint Management (`/api/complaint`)

- FR1.7.1: Students shall be able to submit new complaints with details (category, description, optional attachment).
- FR1.7.2: Users (Students, Wardens, Admins) shall be able to view complaints based on their role and permissions.
- FR1.7.3: The system shall allow tracking the status of complaints (e.g., Submitted, In Progress, Resolved, Rejected).
- FR1.7.4: Admins/Wardens shall be able to update the status and add comments/resolution notes to complaints.
- FR1.7.5: The system may automatically assign complaints to relevant Wardens based on student block/room.

#### 3.1.8 Lost and Found Management (`/api/lost-and-found`)

- FR1.8.1: Users shall be able to report lost items with descriptions and location details.
- FR1.8.2: Users shall be able to report found items with descriptions and location details (optional image upload).
- FR1.8.3: Wardens/Admins shall be able to manage the inventory of found items.
- FR1.8.4: The system shall provide a mechanism to search/browse reported lost and found items.
- FR1.8.5: Wardens/Admins shall be able to mark items as claimed/returned.

#### 3.1.9 Event Management (`/api/event`)

- FR1.9.1: Admins/Wardens shall be able to create new events with details (name, date, time, location, description).
- FR1.9.2: Students shall be able to view upcoming and past events.
- FR1.9.3: (Optional) The system may allow students to register for events.

#### 3.1.10 Hostel Management (`/api/hostel`)

- FR1.10.1: Admins shall be able to define hostel blocks/buildings.
- FR1.10.2: Admins shall be able to define rooms within blocks (room number, capacity, type).
- FR1.10.3: Admins/Wardens shall manage the allocation of rooms to students.
- FR1.10.4: The system shall maintain the occupancy status of rooms.

#### 3.1.11 Statistics and Reporting (`/api/stats`)

- FR1.11.1: Admins/Super Admins shall be able to view dashboard statistics (e.g., occupancy rates, complaint counts, fee collection status).
- FR1.11.2: The system shall allow generation of reports (e.g., student lists, fee defaulters, complaint summaries).

#### 3.1.12 Feedback Management (`/api/feedback`)

- FR1.12.1: Students shall be able to submit feedback about hostel services or facilities.
- FR1.12.2: Admins/Wardens shall be able to view submitted feedback.
- FR1.12.3: (Optional) Admins may be able to categorize or respond to feedback.

#### 3.1.13 File Upload Management (`/api/upload`)

- FR1.13.1: The system shall allow users to upload files where relevant (e.g., profile pictures, complaint attachments, lost/found item images).
- FR1.13.2: Uploaded files shall be stored securely using Azure Blob Storage.
- FR1.13.3: The system shall handle file size limits and potentially allowed file types.

#### 3.1.14 Visitor Management (`/api/visitor`)

- FR1.14.1: Security personnel shall record visitor details (name, contact, purpose, visiting student, time in).
- FR1.14.2: Security personnel shall record visitor checkout time.
- FR1.14.3: Admins/Security shall be able to view visitor logs.

#### 3.1.15 Notification Management (`/api/notification`)

- FR1.15.1: The system shall generate notifications for relevant events (e.g., new complaint, status update, new event, fee reminder).
- FR1.15.2: Users shall be able to view their notifications within the application.
- FR1.15.3: Notifications should be targeted based on user roles and context (e.g., student receives complaint update, warden receives new complaint in their block).

#### 3.1.16 Disciplinary Committee (DisCo) Management (`/api/disCo`)

- FR1.16.1: Authorized users (Admin/DisCo members) shall be able to record disciplinary incidents involving students.
- FR1.16.2: Authorized users shall be able to view the disciplinary history of students.
- FR1.16.3: The system shall securely store disciplinary records.

#### 3.1.17 Payment Management (`/api/payment`)

- FR1.17.1: The system shall display fee structures and dues to students.
- FR1.17.2: The system shall integrate with Razorpay to facilitate online fee payments.
- FR1.17.3: The system shall securely handle payment transactions and confirmations.
- FR1.17.4: Students shall be able to view their payment history.
- FR1.17.5: Admins shall be able to track payment statuses and manage fee records.

#### 3.1.18 External API Integrations (`/external-api`)

- FR1.18.1: The system shall provide or consume external APIs as defined (details needed - e.g., integration with a central student information system). _[Further details required based on the specific external APIs]_

### 3.2 Non-Functional Requirements

#### 3.2.1 Performance

- NFR1.1: API responses for common read operations should complete within 2 seconds under normal load.
- NFR1.2: User login should complete within 3 seconds.
- NFR1.3: The system should support [Specify Number, e.g., 100] concurrent users without significant degradation in performance.

#### 3.2.2 Security

- NFR2.1: All data transmission between client and server must use HTTPS.
- NFR2.2: Passwords must be securely hashed using bcrypt.
- NFR2.3: JWTs must be used for session management and API authorization, with appropriate expiration times and secure handling.
- NFR2.4: Role-based access control must be strictly enforced for all API endpoints.
- NFR2.5: Input validation must be performed on all user inputs to prevent injection attacks (SQLi, XSS - although NoSQL injection for MongoDB).
- NFR2.6: Dependencies should be kept up-to-date to patch known vulnerabilities.
- NFR2.7: Sensitive configuration data (API keys, database credentials) must be stored securely (e.g., environment variables, secrets management) and not committed to version control. (`.env` file used).
- NFR2.8: File uploads should be scanned for malware if possible and restricted by type/size.

#### 3.2.3 Usability

- NFR3.1: The user interface (developed separately) should be intuitive and easy to navigate for all user roles.
- NFR3.2: Consistent terminology and layout should be used throughout the application.
- NFR3.3: Error messages should be clear and informative.

#### 3.2.4 Reliability

- NFR4.1: The system should aim for high availability (e.g., 99.5% uptime).
- NFR4.2: Regular database backups must be implemented.
- NFR4.3: Proper error handling and logging should be implemented throughout the backend.

#### 3.2.5 Maintainability

- NFR5.1: Code should follow consistent coding standards and be well-documented where necessary.
- NFR5.2: The modular structure (separation of routes, controllers, models) should be maintained.

### 3.3 Interface Requirements

#### 3.3.1 User Interfaces

- A web-based graphical user interface (GUI) will be the primary interface for all users. (Note: The backend provides the API; the UI is a separate component).
- The UI should be responsive and function correctly on common web browsers (Chrome, Firefox, Safari, Edge) and different screen sizes (desktop, tablet, mobile).

#### 3.3.2 Software Interfaces

- **Database:** MongoDB (via Mongoose ODM).
- **Payment Gateway:** Razorpay API for processing payments.
- **File Storage:** Azure Blob Storage API for storing uploaded files.
- **Operating System:** Runs on an OS capable of hosting Node.js applications (e.g., Linux, Windows Server).
- **(Potential) Other External APIs:** As defined in `externalApiRoutes`.

#### 3.3.3 Hardware Interfaces

- No specific hardware interfaces are defined beyond standard web server and client hardware.

#### 3.3.4 Communication Interfaces

- HTTPS protocol for client-server communication.
- API calls follow RESTful principles using JSON.
- CORS is configured to allow requests from specific frontend origins.

### 3.4 Database Requirements

- DBR1: MongoDB will be used as the database management system.
- DBR2: Mongoose ODM will be used for data modeling and interaction.
- DBR3: The database schema must support storing information for users (with roles), hostels, rooms, students, complaints, lost/found items, events, payments, visitors, notifications, feedback, disciplinary actions, and system configurations.
- DBR4: Indexes should be created on frequently queried fields to optimize performance (e.g., user emails, student IDs, complaint status).
- DBR5: Data integrity should be maintained (e.g., ensuring a student belongs to a valid room).
