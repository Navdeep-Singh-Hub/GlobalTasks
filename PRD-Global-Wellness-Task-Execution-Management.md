# Product Requirement Document (PRD)

## Global Wellness - Task & Execution Management System

## 1. Vision

Global Wellness requires a centralized task and execution platform used by all operational levels:

- CEO
- Centre Heads
- Coordinators
- Supervisors
- Executors (Therapists, Doctors, Reception, Marketing, Support Staff including Security)

### Business objectives

- Ensure full task visibility across the organization
- Drive accountability at every reporting level
- Standardize execution through structured SOP-backed tasks
- Eliminate informal and untracked work
- Enable daily reporting and WhatsApp-driven reporting flow

### Core principle

Every unit of work in the organization must be represented and tracked as a task.

## 2. Organizational Hierarchy

### 2.1 Role hierarchy (highest to lowest)

1. CEO
2. Centre Head
3. Coordinator
4. Supervisor
5. Executor

### 2.2 Reporting chain

- Executors report to Supervisors
- Supervisors report to Coordinators
- Coordinators report to Centre Heads
- Centre Heads report to CEO

### 2.3 System visibility rules

- CEO: full organization visibility
- Centre Head: center-level visibility
- Coordinator: department and team visibility
- Supervisor: assigned team visibility
- Executor: own tasks only

### 2.4 Flow principles

- Task assignment flows top-down
- Reporting and status flow bottom-up

## 3. Core System Rules

1. Every work item must be a task.
2. Every task must have a department.
3. Every task must have a function tag.
4. Every task requires structured input configuration.
5. Task completion is blocked until all required inputs are provided.
6. All tasks follow a defined workflow.
7. Daily reporting is mandatory.
8. Delays trigger automatic escalation.

## 4. Product Modules

## Module 1: User Management

### Required fields

- User ID
- Name
- Role (CEO, Centre Head, Coordinator, Supervisor, Executor)
- Department (primary)
- Center (e.g., Ludhiana, Moga, Jalandhar, Faridkot, Malerkotla)
- Reporting Manager

## Module 2: Task Engine (Core)

### Task fields

- Task ID
- Title
- Description
- Assigned To
- Assigned By
- Department (mandatory)
- Function Tag (mandatory)
- Priority (High, Medium, Low)
- Deadline
- Recurring Type (Daily, Weekly, Monthly, Custom)
- Required Inputs (JSON schema)
- Status

## Module 3: Department Configuration

Departments must be configurable and initially include:

- Marketing
- Reception
- Operations
- Clinical
- Admin
- Management

## Module 4: Required Input System (Critical)

Each task must define mandatory completion fields at assignment time.

### Example A: Marketing task - Doctor Visit

Required Inputs:

- Doctor Name
- Clinic Photo
- Area
- Outcome

### Example B: Reception task - New Patient Entry

Required Inputs:

- Patient Name
- Phone Number
- Service
- Source

### Example C: Management task - Audit

Required Inputs:

- Staff Checked
- Issues Found
- Action Taken

### Validation rule

Task completion must fail until all mandatory inputs are filled.

## Module 5: Multi-Department Capability

- A user may perform tasks across multiple departments.
- Example: a Coordinator can do Marketing work, Operations audit, and Clinical review.
- System must track performance by both user and department.

## 5. Dashboard Requirements

## 5.1 User Dashboard

- Today’s Tasks
- Pending Tasks
- Completed Tasks
- Overdue Tasks

## 5.2 Supervisor Dashboard

- Team task status
- Pending approvals
- Delayed tasks

## 5.3 Coordinator Dashboard

- Department performance
- Supervisor performance
- Task completion trends

## 5.4 Centre Head Dashboard

- Center-wise performance
- Department comparison
- Escalation alerts

## 5.5 CEO Dashboard

Must display:

- Total tasks (Completed vs Pending)
- Center-wise performance
- Department-wise performance
- Top performers
- Red flags:
  - Delayed tasks
  - Non-reporting staff

## 6. Reporting System

## 6.1 Individual report

- Tasks completed
- Tasks pending
- Completion percentage
- Issues

## 6.2 Supervisor report

- Team performance
- Task delays
- Key issues

## 6.3 Coordinator report

- Department performance
- Supervisor comparison

## 6.4 Centre Head report

- Full center summary

## 6.5 CEO report

- Global summary
- Center comparison
- Department alerts

## 7. WhatsApp Integration

### Daily reporting workflow (7:30 PM)

1. System sends reminder
2. User submits report through link
3. System generates structured report
4. Distribution:
   - User
   - Supervisor
   - Coordinator
   - Centre Head
   - CEO (summary only)

### Individual report payload

- Departments worked
- Completed tasks
- Pending tasks
- Issues
- Completion percentage

### CEO summary payload

- Total tasks
- Center performance
- Department insights
- Red flags

## 8. Escalation System

- Task overdue: notify Supervisor
- Continued delay: notify Coordinator
- Repeated delay: notify Centre Head
- Critical delay: visible in CEO red flags

## 9. Non-Negotiable Rules

- No task without department
- No task without function tag
- No completion without required inputs
- Daily reporting is mandatory
- Overdue tasks must be visible
- Off-system/manual reporting is disallowed

## 10. Development Roadmap

## Phase 1 (MVP - 10 to 14 days)

- User management
- Task creation
- Task assignment
- Task completion
- Basic dashboard

## Phase 2

- Required input system
- Recurring tasks
- Verification workflow

## Phase 3

- Reporting dashboards
- Department analytics
- Escalation system

## Phase 4

- WhatsApp automation
- CEO summary dashboard

## 11. UI/UX Requirement (Pre-Development Gate)

The following designs must be completed and approved before development:

- Task creation screen
- Task list screen
- Task detail view
- Dashboard views for each role level
- Daily report submission screen

## 12. Success Metrics

- Task tracking coverage >= 95% of operational activities
- Daily report compliance >= 90%
- Overdue task reduction month-over-month
- Center-level execution variance reduced month-over-month
- Leadership review cycle time reduced through dashboard visibility

## 13. Risks and Dependencies

### Dependencies

- Final role-to-permission matrix sign-off
- Department and center master data
- WhatsApp integration provider and API approvals
- SOP mapping to function tags and required input schemas

### Risks

- Incomplete SOP definitions cause inconsistent task templates
- Weak escalation ownership causes delayed follow-up
- Poor adoption if off-system reporting is still tolerated

## 14. Final Product Intent

This system is not only a software tool; it is the organization’s execution backbone, quality control layer, and scaling engine.

When implemented correctly, leadership can run multiple centers with centralized control and measurable accountability.

