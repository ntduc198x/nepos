# NEPOS System

<div align="center">
  <img src="https://img.shields.io/badge/React-18-blue?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6.0-646CFF?logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/Supabase-Backend-green?logo=supabase" alt="Supabase" />
  <img src="https://img.shields.io/badge/TailwindCSS-Styling-38B2AC?logo=tailwindcss" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License" />
</div>

<br />

## 📖 Introduction

**NEPOS** is a modern, high-performance Point of Sale application engineered for the dynamic needs of the hospitality industry. Built with a robust **Offline-First** architecture, it ensures seamless operations even during network interruptions.

This system integrates table management, inventory tracking, real-time analytics, and role-based security into a unified, intuitive interface. Designed for scalability and speed, it leverages the power of **React 18** and **Supabase**, providing a responsive experience across devices.

## ✨ Key Features

### 🏢 Operations & Management
- **Interactive Floor Plan**: Visual table management with real-time status updates (Occupied, Available, Reserved).
- **Dynamic Menu System**: Easy-to-navigate POS interface for quick order placement.
- **Inventory Management**: Real-time stock tracking with automated deduction logic.
- **Role-Based Access Control (RBAC)**: secure environments with distinct permissions for `Admin` and `Staff` (e.g., locking sensitive inventory actions).

### 🚀 Technical Highlights
- **Offline-First Resilience**: powered by `Dexie.js` (IndexedDB), ensuring data integrity when the connection drops and auto-syncing when online.
- **Global Keyboard Shortcuts**: Enhanced productivity with hotkeys (e.g., `F2` for Floor Plan, `F3` for Menu).
- **Secure Authentication**: Integrated Supabase Auth with persistent sessions.
- **Smart Printing**: Advanced receipt generation and print preview capabilities via `printService`.

### 🎨 User Experience
- **Adaptive Theming**: Fully customizable Dark/Light modes with brightness control.
- **Lock Screen**: Security feature to temporarily lock the terminal without logging out.
- **Responsive Design**: Optimized layout for tablets and desktop touchscreens.

## 🛠️ Architecture

The application follows a **Domain-Driven Design (DDD)** approach with a strong emphasis on Separation of Concerns.

```mermaid
graph TD
    User[User Interface] --> Contexts[React Context Providers]
    Contexts --> Hooks[Custom Hooks]
    Hooks --> Services[Service Layer]
    
    subgraph Data Layer
      Services --> Supabase[Supabase (Cloud DB)]
      Services --> Dexie[Dexie.js (Local DB)]
    end
    
    subgraph Core Features
      Auth[Authentication]
      Theme[Theming Engine]
      Print[Printing System]
    end
```

### Core Technologies
- **Frontend**: React 18, TypeScript, Vite
- **State Management**: React Context + Custom Hooks (`useAuth`, `useTheme`)
- **Database**: Supabase (PostgreSQL) + Dexie.js (IndexedDB wrapper)
- **Styling**: TailwindCSS + Lucide Icons
- **Visualization**: Recharts for Analytics
- **Utilities**: `react-to-print`, `qrcode`

## 🚀 Installation & Setup

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/nepos.git
cd nepos
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
Create a `.env` file in the root directory based on `.env.example`:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Run Locally
Start the development server:
```bash
npm run dev
```

## 📂 Directory Structure

```plaintext
src/
├── components/       # Reusable UI components (Sidebar, Modals, etc.)
├── context/          # Global state (Auth, Theme, Data, Settings)
├── hooks/            # Custom React hooks
├── screens/          # Main application views (Dashboard, Menu, Inventory)
├── services/         # Business logic & API calls (Settings, Print, Audit)
├── types/            # TypeScript type definitions
├── utils/            # Helper functions
├── App.tsx           # Main application entry & Routing logic
└── supabase.ts       # Supabase client configuration
```

## 🤝 Contribution

We welcome contributions! Please follow these steps:

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.   Open a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
