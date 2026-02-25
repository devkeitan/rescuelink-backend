const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');
require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const vehicleRoutes = require('./routes/vehicles');
const userRoutes = require('./routes/users');
const alertRoutes = require('./routes/alerts');
const sosRoutes = require('./routes/sos');
const emergencyContactsRoutes = require('./routes/emergencyContacts');
const crashRoutes = require ('./routes/crash')
const responderRoutes = require ('./routes/responders')
const geolocationRoutes = require('./routes/geolocation');
const allAlertsRouter = require('./routes/allAlerts');
const reportsRouter = require('./routes/reports');

const { initSocket } = require('./socket');
const { setIO } = require('./socketInstance');

const app = express();


const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "https://rescuelink-ui.vercel.app"], // your React dev URL
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  },
})





// Swagger Configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'RescueLink API',
      version: '1.0.0',
      description: 'Emergency Response System API Documentation',
      contact: {
        name: 'RescueLink Team',
        email: 'support@rescuelink.com',
      },
    },
   servers: [
      {
        url: 'https://rescuelink-backend-j0gz.onrender.com',
        description: 'Production server (Render)',
      },
      {
        url: 'http://localhost:5000',
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token',
        },
      },
    },
    security: [{
      bearerAuth: [],
    }],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

// Middleware - CORS (Allow all origins)
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger UI Route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'RescueLink API Docs',
}));

// Request logging (add origin for debugging)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${req.headers.origin || 'no-origin'}`);
  next();
});

// Routes
app.use('/api/v1/auth', authRoutes);

app.use('/api/v1/users', userRoutes);

// ACCIDENT ROUTES
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/sos', sosRoutes);
app.use('/api/v1/crash', crashRoutes);

// ADMIN ROUTES
app.use('/api/v1/vehicles', vehicleRoutes);
app.use('/api/v1/responders', responderRoutes);
app.use('/api/v1/allAlerts', allAlertsRouter);
app.use('/api/v1/reports', reportsRouter);



app.use('/api/v1/emergency-contacts', emergencyContactsRoutes);


app.use('/api/v1/geolocation', geolocationRoutes);
// Root redirect to docs
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'RescueLink API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    documentation: process.env.NODE_ENV === 'production'
      ? 'https://rescuelink-backend-j0gz.onrender.com/api-docs'
      : `http://localhost:${process.env.PORT || 5000}/api-docs`
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  
  // Handle CORS errors specifically
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: 'CORS policy blocked this request' });
  }
  
  res.status(500).json({ message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;
initSocket(io);
setIO(io);
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});