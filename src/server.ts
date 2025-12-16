import express, { Express, Request, Response } from 'express';
import { config } from './config';
import { telegramService } from './services/telegram';
import telegramRouter from './routes/telegram';
import checkRouter from './routes/check';
import trackingRouter from './routes/tracking';

const app: Express = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, res: Response, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/telegram', telegramRouter);
app.use('/check', checkRouter);
app.use('/tracking', trackingRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
  try {
    // Set webhook
    const webhookUrl = `${config.telegram.publicBaseUrl}/telegram/webhook`;
    console.log(`Setting Telegram webhook to: ${webhookUrl}`);
    await telegramService.setWebhook(webhookUrl);

    // Set bot commands for easier user interaction
    console.log('Setting bot commands...');
    await telegramService.setBotCommands();

    // Start listening
    const port = config.server.port;
    app.listen(port, () => {
      console.log(`\n🚀 Server running on port ${port}`);
      console.log(`📡 Webhook URL: ${webhookUrl}`);
      console.log(`🔍 Health check: http://localhost:${port}/health\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start
startServer();
