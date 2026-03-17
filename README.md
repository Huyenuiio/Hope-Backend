# Hope Platform - Backend API

A robust Node.js backend for the Hope Platform, a professional networking and freelancing hub. Built with scalability, real-time engagement, and security in mind.

## 🚀 Features

- **Authentication & Security**: 
  - JWT-based authentication with role-based access control (RBAC).
  - Google OAuth 2.0 integration.
  - Security middleware: Helmet, Rate Limiting, and custom NoSQL injection/XSS sanitization.
- **Networking**:
  - Direct messaging with real-time updates via Socket.IO.
  - Connection request system (Connect/Disconnect).
  - User blocking functionality.
- **Freelance Ecosystem**:
  - Job posting and application management.
  - Recommended jobs based on user niche.
  - Social interactions: Comments and reactions on job posts.
  - Professional portfolios and review system.
- **Meeting Management**: Integrated scheduling and meeting tracking.
- **Admin Panel**: Dedicated endpoints for platform moderation and management.

## 🛠 Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose ODM)
- **Real-time**: Socket.IO
- **Auth**: Passport.js, JWT
- **Email**: Nodemailer

## 🔧 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd hope-platform-backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory and add the following:
   ```env
   NODE_ENV=development
   PORT=5000
   MONGO_URI=your_mongodb_uri
   JWT_SECRET=your_secret_key
   JWT_EXPIRE=7d
   FRONTEND_URL=http://localhost:5173
   BACKEND_URL=http://localhost:5000
   SESSION_SECRET=your_session_secret
   # Google OAuth
   GOOGLE_CLIENT_ID=your_id
   GOOGLE_CLIENT_SECRET=your_secret
   # Email configuration
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your_email
   EMAIL_PASS=your_app_password
   ```

4. **Run the server**:
   ```bash
   # Development mode (with nodemon)
   npm run dev

   # Production mode
   npm start
   ```

## 📡 API Endpoints (Brief Overview)

- `/api/auth` - Login, Register, Google OAuth, Profile retrieval.
- `/api/users` - Search freelancers, manage connections, blocking.
- `/api/jobs` - Job CRUD, applications, social interactions.
- `/api/messages` - Conversations, messages, notifications.
- `/api/portfolio` - Portfolio item management.
- `/api/reviews` - Freelancer review system.
- `/api/meetings` - Scheduling management.
- `/api/admin` - Admin-specific operations.

## 📄 License

This project is licensed under the ISC License.
