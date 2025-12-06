# Vernie's Shopping Plaza POS System

A full-stack Point of Sale and Inventory Management system built with React + Vite frontend and Node.js + Express backend with MySQL database.

## Features

### Multi-Role System
- **Cashier**: POS transactions, product search, cart management, daily sales view
- **Branch Admin**: Inventory management, product editing, branch sales overview
- **Owner**: Multi-branch management, user administration, global inventory control

### Core Functionality
- JWT-based authentication
- Role-based access control
- Real-time inventory tracking
- Sales transaction processing
- Multi-branch support
- Activity logging

## Tech Stack

### Frontend
- React 19
- Vite
- React Router
- TailwindCSS
- Axios

### Backend
- Node.js
- Express
- MySQL
- JWT
- bcryptjs
- CORS

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- MySQL server
- pnpm package manager

### Database Setup
1. Make sure MySQL is running with root user and empty password
2. Update database credentials in `backend/.env` if needed

### Backend Setup
```bash
cd backend
pnpm install
pnpm run setup-db  # Creates database and seeds initial data
pnpm dev
```

### Frontend Setup
```bash
cd frontend
pnpm install
pnpm dev
```

## Default Login Credentials

### Owner Account
- Email: owner@vernie.com
- Password: admin123

### Branch Admin Account
- Email: admin1@vernie.com
- Password: admin123

### Cashier Account
- Email: cashier1@vernie.com
- Password: cashier123

## API Endpoints

### Authentication
- `POST /login` - User login
- `POST /register` - Create new user (Owner only)

### Products
- `GET /products` - List products
- `POST /products` - Create product (Owner only)
- `PUT /products/:id` - Update product (Owner only)

### Sales
- `POST /sales` - Create sale
- `GET /sales` - List sales (role-filtered)

### Inventory
- `GET /inventory` - List inventory (role-filtered)
- `POST /inventory` - Update inventory

### Management
- `GET /branches` - List branches
- `GET /users` - List users (Owner only)
- `GET /activity-logs` - Activity logs (Owner only)

## Database Schema

### Tables
- `users` - User accounts with roles
- `branches` - Store locations
- `products` - Product catalog
- `inventory` - Stock levels per branch
- `sales` - Sales transactions
- `sales_items` - Individual sale items
- `activity_logs` - System activity tracking

## Project Structure

```
POS/
├── backend/
│   ├── index.js          # Main server file
│   ├── package.json       # Dependencies
│   └── .env              # Environment variables
└── frontend/
    ├── src/
    │   ├── components/    # Reusable components
    │   ├── contexts/      # React contexts
    │   ├── pages/         # Page components
    │   ├── services/      # API services
    │   └── App.jsx        # Main app component
    ├── package.json       # Dependencies
    └── tailwind.config.js # Tailwind configuration
```

## Development

The application automatically creates sample data on first run:
- 3 branches (Main, North, South)
- Sample users for each role
- 5 sample products
- Initial inventory stock

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Role-based access control
- SQL injection prevention with parameterized queries
- CORS configuration

## Future Enhancements

- Real-time updates with WebSockets
- Barcode scanning support
- Advanced reporting and analytics
- Receipt printing
- Mobile responsive design improvements