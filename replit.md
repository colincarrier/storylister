# Overview

Storylister is a Chrome extension designed to enhance Instagram's story viewer functionality with search, filtering, analytics, and snapshot capabilities. The project operates as a client-side browser extension that integrates directly with Instagram's interface to provide enhanced story viewer management tools. The extension aims to maintain platform compliance by avoiding automated data collection and instead focuses on user-driven interactions.

The project includes both a demo web application for showcasing features and the actual Chrome extension implementation. It follows a freemium model with basic search and filtering features available for free, while advanced analytics, data export, and historical tracking are reserved for Pro users.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

**Chrome Extension Structure**: The extension uses Manifest V3 architecture with separate content scripts, background service workers, and popup interfaces. The content script (`content.ts`) injects functionality directly into Instagram pages, while the background script (`background.ts`) handles storage operations and cross-tab communication.

**React-based Demo Application**: The demo site is built with React, TypeScript, and Vite for development tooling. It uses Tailwind CSS for styling with shadcn/ui components for consistent UI elements. The demo showcases extension capabilities without requiring actual Instagram integration.

**Component Architecture**: The extension follows a modular component-based structure with separate managers for different functionalities:
- `StorylistManager` handles the main overlay injection and viewer detection
- `ViewerSearch` manages search and filtering operations
- `AnalyticsDashboard` provides data visualization and insights

## Backend Architecture

**Express.js Server**: A lightweight Express server provides API endpoints for the demo application and handles basic routing. The server is configured for development with Vite integration and includes error handling middleware.

**Client-Side Storage**: The extension primarily uses browser-based storage (IndexedDB via the custom `StorylistStorage` class) for data persistence. This approach maintains user privacy by keeping all data local to the user's browser.

**Memory Storage Interface**: For development and testing, the system includes an in-memory storage implementation (`MemStorage`) that can be easily swapped with database solutions.

## Data Storage Solutions

**IndexedDB Implementation**: The extension uses IndexedDB for local storage with multiple object stores:
- Viewers store for user profiles and metadata
- View events store for tracking story interactions
- Snapshots store for Pro feature data capture
- Settings store for user preferences

**Drizzle ORM Integration**: The project is configured with Drizzle ORM and PostgreSQL for potential server-side data operations, though the current implementation focuses on client-side storage for privacy compliance.

## Authentication and Authorization

**Browser Extension Permissions**: The extension requests minimal permissions (storage, activeTab, scripting) and operates within Instagram's domain restrictions. No separate user authentication system is implemented, relying instead on the user's existing Instagram session.

**Feature Gating**: Pro features are controlled through local settings flags, with the expectation that a future billing system would manage upgrade status.

## Content Injection Strategy

**DOM Manipulation**: The extension detects Instagram's story viewer dialogs through DOM observation and injects custom UI elements without interfering with Instagram's core functionality. It uses MutationObserver to handle Instagram's single-page application navigation.

**Styling Isolation**: Custom CSS ensures the extension's UI elements don't conflict with Instagram's styling, using scoped class names and CSS variables for theming.

# External Dependencies

## UI and Component Libraries

**Radix UI**: Provides accessible, unstyled UI components including dialogs, dropdowns, and form controls. This ensures consistent behavior across different browsers and accessibility compliance.

**Tailwind CSS**: Handles styling with a utility-first approach, configured with custom color schemes and spacing that match modern web design patterns.

**shadcn/ui**: Pre-built component library that combines Radix UI primitives with Tailwind styling for rapid development.

## Development and Build Tools

**TypeScript**: Provides type safety across the entire codebase with shared type definitions between extension and demo application.

**Webpack**: Builds and bundles the Chrome extension files, handling TypeScript compilation and asset copying for distribution.

**Vite**: Powers the development server for the demo application with hot module replacement and optimized build processes.

## Chrome Extension APIs

**Chrome Storage API**: Manages extension settings and user preferences across browser sessions.

**Chrome Runtime API**: Handles message passing between content scripts and background scripts.

**Web Extensions**: The extension is designed to be compatible with multiple browsers using standard web extension APIs.

## Database and Storage

**Neon Database**: Configured as the PostgreSQL provider for potential server-side operations, though currently unused in favor of client-side storage.

**Drizzle Kit**: Database migration and schema management tool for handling database structure changes.

## Analytics and Data Processing

**TanStack React Query**: Manages server state and caching for the demo application, providing optimized data fetching and synchronization.

**Chart.js Integration**: Prepared for data visualization in the analytics dashboard, though specific charting libraries may be added based on feature requirements.

## Privacy and Compliance

The architecture prioritizes user privacy by avoiding server-side data collection and instead processing all information locally within the user's browser. This approach reduces privacy concerns and maintains compliance with Instagram's terms of service by not automating data collection.