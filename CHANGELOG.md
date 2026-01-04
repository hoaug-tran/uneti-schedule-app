# Changelog

All notable changes to this project will be documented in this file.

## [1.4.5] - 2026-01-04

### Added (New Features)
- **Smart Schedule System**:
  - Automatically fetches and parses weekly schedules.
  - **Exam Schedule Support**: Specialized view for exams, distinct from regular classes.
  - **Offline Mode**: Local caching allows viewing schedules without an internet connection.
- **Modern User Interface**:
  - Completely redesigned UI with a minimalist, clean, and comfortable aesthetic.
  - **Dynamic Theming**: Support for Dark Mode / Light Mode with "Auto System Match" capability.
  - **Responsive Design**: Widget-style layout that stays unobtrusive on the desktop.
- **Authentication & Security**:
  - **Secure Storage**: Implemented `keytar` to encrypt and store cookies/credentials in the OS Keychain (Windows Credential Manager).
  - **Auto-Refresh**: Background service to automatically keep sessions alive, preventing "Session Expired" errors.
- **Internationalization (i18n)**:
  - Full bilingual support: **English** and **Vietnamese**.
  - Instant language switching without restarting the app.

### Fixed (Stability & Bugs)
- **Critical Crash Fixes**:
  - Resolved "Loading..." hang caused by initialization race conditions in `renderer.js`.
  - Fixed application crashes during System Sleep/Wake or Network Reconnection events.
  - Fixed renderer crash due to unsafe imports in `preload.mjs`.
  - Fixed "Infinite Recursion" stack overflow in the logging system.
- **Session Stability**:
  - Fixed logic preventing the app from recovering after cookie expiration.
  - Improved "Login Required" detection to verify actual session validity.

### Improved (Refactoring & Technical)
- **Unified Logger**:
  - Replaced inconsistent `console.log` with a centralized `Logger` module.
  - Features: Automatic log rotation, file storage, and Environment-based log levels (Debug in Dev, Info in Prod).
- **Architecture**:
  - **Code Cleanup**: Removed massive amounts of legacy code and unused variables.
  - **Security Hardening**: Enforced **Context Isolation** with a secure `preload.mjs` bridge.
  - **IPC Communication**: Refactored to use safe, asynchronous IPC handlers between Main and Renderer processes.
- **Helper Utilities**:
  - Standardized Date/Time utilities.
  - Enhanced Network monitoring reliability.

## [1.4.3] - Previous
- Initial stable release foundation.
