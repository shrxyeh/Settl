import { Router, Request, Response } from 'express';
import prisma from '../db';
import { telegramService } from '../services/telegram';
import { evmService } from '../services/evm';
import { solanaService } from '../services/solana';
import { riskService } from '../services/risk';
import { TelegramUpdate, UserState, Chain } from '../types';
import { config } from '../config';

const router = Router();

// In-memory state storage for interactive flows (add-new tracking)
const userStates = new Map<number, UserState>();

// TTL for user states (15 minutes)
const STATE_TTL = 15 * 60 * 1000;

/**
 * POST /telegram/webhook
 * Handle incoming Telegram updates
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const update: TelegramUpdate = req.body;

    // Handle message
    if (update.message?.text) {
      await handleMessage(update);
    }

    // Handle callback query 
    if (update.callback_query) {
      await handleCallbackQuery(update);
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error('Error handling webhook:', error);
    return res.sendStatus(200); // Always return 200 to Telegram
  }
});

/**
 * Handle text messages and commands
 */
async function handleMessage(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  const userId = message.from.id;

  // Check if user is in an interactive flow
  const userState = userStates.get(userId);
  if (userState) {
    await handleInteractiveFlow(userId, chatId, text, userState);
    return;
  }

  // Handle commands
  if (text.startsWith('/')) {
    const command = text.split(' ')[0].toLowerCase();

    switch (command) {
      case '/start':
        await handleStart(chatId, message.from.first_name);
        break;
      case '/menu':
        await handleMenu(chatId);
        break;
      case '/help':
        await handleHelp(chatId);
        break;
      case '/check':
        await handleCheckCommand(chatId, userId);
        break;
      case '/tracking':
        await handleTracking(chatId);
        break;
      default:
        await telegramService.sendMessage({
          chatId,
          text: 'Unknown command. Use /menu to see available options.',
        });
    }
  }
}

/**
 * Handle callback queries 
 */
async function handleCallbackQuery(update: TelegramUpdate): Promise<void> {
  const query = update.callback_query;
  if (!query || !query.data) return;

  const chatId = query.message?.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (!chatId) return;

  // Answer callback query
  await telegramService.answerCallbackQuery(query.id);

  // Route based on callback data
  if (data === 'menu:main') {
    await handleMenu(chatId);
  } else if (data === 'menu:check') {
    await handleCheckCommand(chatId, userId);
  } else if (data === 'menu:tracking') {
    await handleTracking(chatId);
  } else if (data === 'menu:help') {
    await handleHelp(chatId);
  } else if (data === 'menu:account') {
    await handleMyAccount(chatId, userId);
  } else if (data === 'tracking:view') {
    await handleViewTracked(chatId, userId);
  } else if (data === 'tracking:add-new') {
    await handleAddNewFlow(chatId, userId);
  } else if (data.startsWith('chain:')) {
    await handleChainSelection(chatId, userId, data);
  } else if (data === 'cancel') {
    userStates.delete(userId);
    await telegramService.sendMessage({
      chatId,
      text: '❌ Cancelled',
      replyMarkup: telegramService.createBackKeyboard(),
    });
  }
}

/**
 * /start command
 */
async function handleStart(chatId: number, _firstName: string): Promise<void> {
  const welcomeText = `👋 Welcome to **Settl X**\\n\\n` +
    `I can help you track wallet addresses across multiple blockchains and receive alerts for new transactions.\\n\\n` +
    `**Supported Networks:**\\n` +
    `- Arbitrum (ETH & ERC20 tokens)\\n` +
    `- Optimism (ETH & ERC20 tokens)\\n` +
    `- Blast (ETH & ERC20 tokens)\\n` +
    `- Dogecoin (DOGE)\\n` +
    `- Ink (ETH & ERC20 tokens)\\n` +
    `- Mantle (MNT & ERC20 tokens)\\n` +
    `- Stellar (Lumens & Assets)\\n\\n` +
    `Use /menu to get started!`;

  await telegramService.sendMessage({
    chatId,
    text: welcomeText,
    parseMode: 'Markdown',
    replyMarkup: telegramService.createMainMenuKeyboard(),
  });
}

/**
 * /menu command
 */
async function handleMenu(chatId: number): Promise<void> {
  await telegramService.sendMessage({
    chatId,
    text: '📋 **Main Menu**\n\nWhat would you like to do?',
    parseMode: 'Markdown',
    replyMarkup: telegramService.createMainMenuKeyboard(),
  });
}

/**
 * /help command
 */
async function handleHelp(chatId: number): Promise<void> {
  const helpText = `❓ **Help**\n\n` +
    `**Commands:**\n` +
    `/start - Start the bot\n` +
    `/menu - Show main menu\n` +
    `/check - Check a wallet address\n` +
    `/tracking - Manage tracked wallets\n` +
    `/help - Show this help\n\n` +
    `**Check Feature:**\n` +
    `Analyze any wallet for risk indicators and recent activity. ` +
    `We use heuristic analysis to detect suspicious patterns.\n\n` +
    `**Tracking Feature:**\n` +
    `Add wallets to monitor and receive instant Telegram alerts when new transactions occur above your threshold.\n\n` +
    `**Supported Chains:**\n` +
    `• Ethereum (ETH)\n` +
    `• Base (ETH)\n` +
    `• Avalanche (AVAX)\n` +
    `• Solana (SOL)`;

  await telegramService.sendMessage({
    chatId,
    text: helpText,
    parseMode: 'Markdown',
    replyMarkup: telegramService.createBackKeyboard(),
  });
}

/**
 * /check command
 */
async function handleCheckCommand(chatId: number, userId: number): Promise<void> {
  // Initialize user state for check flow
  userStates.set(userId, {
    action: 'check-wallet',
    step: 'chain',
    data: {},
    timestamp: Date.now(),
  });

  // Clean up old states
  cleanupExpiredStates();

  await telegramService.sendMessage({
    chatId,
    text: '🔍 **Check Wallet**\n\nStep 1/2: Select the blockchain',
    parseMode: 'Markdown',
    replyMarkup: telegramService.createChainSelectionKeyboard(),
  });
}

/**
 * /tracking command
 */
async function handleTracking(chatId: number): Promise<void> {
  await telegramService.sendMessage({
    chatId,
    text: '📊 **Tracking**\n\nManage your tracked wallets:',
    parseMode: 'Markdown',
    replyMarkup: telegramService.createTrackingMenuKeyboard(),
  });
}

/**
 * My account page
 */
async function handleMyAccount(chatId: number, userId: number): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramUserId: String(userId) },
      include: {
        trackedAddresses: {
          where: { isActive: true },
        },
      },
    });

    const trackedCount = user?.trackedAddresses.length || 0;
    const maxAllowed = config.limits.maxTrackedPerUser;

    const text = `👤 **My Account**\n\n` +
      `Telegram ID: \`${userId}\`\n` +
      `Tracked Addresses: ${trackedCount}/${maxAllowed}\n` +
      `Account created: ${user ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}\n\n` +
      `Use /tracking to manage your tracked wallets.`;

    await telegramService.sendMessage({
      chatId,
      text,
      parseMode: 'Markdown',
      replyMarkup: telegramService.createBackKeyboard(),
    });
  } catch (error) {
    console.error('Error loading account:', error);
    await telegramService.sendMessage({
      chatId,
      text: '❌ Error loading account information',
      replyMarkup: telegramService.createBackKeyboard(),
    });
  }
}

/**
 * View tracked addresses
 */
async function handleViewTracked(chatId: number, userId: number): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramUserId: String(userId) },
      include: {
        trackedAddresses: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user || user.trackedAddresses.length === 0) {
      await telegramService.sendMessage({
        chatId,
        text: '📭 You have no tracked addresses yet.\n\nUse "Add New" to start tracking!',
        replyMarkup: telegramService.createTrackingMenuKeyboard(),
      });
      return;
    }

    let text = `👁️ **Your Tracked Addresses** (${user.trackedAddresses.length}/${config.limits.maxTrackedPerUser})\n\n`;

    for (const addr of user.trackedAddresses) {
      const shortAddr = addr.address.length > 20
        ? `${addr.address.slice(0, 10)}...${addr.address.slice(-8)}`
        : addr.address;

      text += `**${addr.label}**\n`;
      text += `Chain: ${addr.chain.toUpperCase()}\n`;
      text += `Address: \`${shortAddr}\`\n`;
      text += `Min Amount: ${addr.minAmount}\n\n`;
    }

    await telegramService.sendMessage({
      chatId,
      text,
      parseMode: 'Markdown',
      replyMarkup: telegramService.createTrackingMenuKeyboard(),
    });
  } catch (error) {
    console.error('Error viewing tracked addresses:', error);
    await telegramService.sendMessage({
      chatId,
      text: '❌ Error loading tracked addresses',
      replyMarkup: telegramService.createTrackingMenuKeyboard(),
    });
  }
}

/**
 * Start add-new tracking flow
 */
async function handleAddNewFlow(chatId: number, userId: number): Promise<void> {
  // Initialize user state
  userStates.set(userId, {
    action: 'add-new',
    step: 'chain',
    data: {},
    timestamp: Date.now(),
  });

  // Clean up old states
  cleanupExpiredStates();

  await telegramService.sendMessage({
    chatId,
    text: '➕ **Add New Tracking**\n\nStep 1/4: Select chain',
    parseMode: 'Markdown',
    replyMarkup: telegramService.createChainSelectionKeyboard(),
  });
}

/**
 * Handle chain selection in add-new or check-wallet flow
 */
async function handleChainSelection(chatId: number, userId: number, callbackData: string): Promise<void> {
  const userState = userStates.get(userId);
  if (!userState || userState.step !== 'chain') {
    await telegramService.sendMessage({
      chatId,
      text: '❌ Session expired. Use /menu to start again.',
    });
    return;
  }

  const chain = callbackData.split(':')[1] as Chain;
  userState.data.chain = chain;
  userState.step = 'address';
  userState.timestamp = Date.now();

  if (userState.action === 'check-wallet') {
    await telegramService.sendMessage({
      chatId,
      text: `✅ Chain: **${chain.toUpperCase()}**\n\nStep 2/2: Send the wallet address to check`,
      parseMode: 'Markdown',
    });
  } else {
    await telegramService.sendMessage({
      chatId,
      text: `✅ Chain: **${chain.toUpperCase()}**\n\nStep 2/4: Send the wallet address to track`,
      parseMode: 'Markdown',
    });
  }
}

/**
 * Handle interactive flow messages
 */
async function handleInteractiveFlow(
  userId: number,
  chatId: number,
  text: string,
  userState: UserState
): Promise<void> {
  // Handle check-wallet flow
  if (userState.action === 'check-wallet' && userState.step === 'address') {
    await handleCheckWalletAddress(userId, chatId, text, userState);
    return;
  }

  // Handle add-new flow
  if (userState.action !== 'add-new') return;

  if (userState.step === 'address') {
    // Validate address
    const chain = userState.data.chain!;
    let isValid = false;

    if (chain === 'sol') {
      isValid = solanaService.isValidAddress(text);
    } else {
      isValid = evmService.isValidAddress(text);
    }

    if (!isValid) {
      await telegramService.sendMessage({
        chatId,
        text: `❌ Invalid ${chain.toUpperCase()} address format. Please try again or use /tracking to cancel.`,
      });
      return;
    }

    userState.data.address = text;
    userState.step = 'label';
    userState.timestamp = Date.now();

    await telegramService.sendMessage({
      chatId,
      text: `✅ Address saved\n\nStep 3/4: Give this address a label (e.g., "Suspicious Wallet")`,
    });
  } else if (userState.step === 'label') {
    userState.data.label = text;
    userState.step = 'min-amount';
    userState.timestamp = Date.now();

    await telegramService.sendMessage({
      chatId,
      text: `✅ Label: **${text}**\n\nStep 4/4: Set minimum amount threshold (e.g., "0.1" or "0" for all transactions)`,
      parseMode: 'Markdown',
    });
  } else if (userState.step === 'min-amount') {
    const minAmount = parseFloat(text);

    if (isNaN(minAmount) || minAmount < 0) {
      await telegramService.sendMessage({
        chatId,
        text: '❌ Invalid amount. Please enter a number >= 0',
      });
      return;
    }

    // Save to database
    try {
      const chain = userState.data.chain!;
      const address = userState.data.address!;
      const label = userState.data.label!;

      // Use tracking API logic
      let user = await prisma.user.findUnique({
        where: { telegramUserId: String(userId) },
        include: { trackedAddresses: { where: { isActive: true } } },
      });

      if (!user) {
        user = await prisma.user.create({
          data: { telegramUserId: String(userId) },
          include: { trackedAddresses: { where: { isActive: true } } },
        });
      }

      // Check limits
      if (user.trackedAddresses.length >= config.limits.maxTrackedPerUser) {
        await telegramService.sendMessage({
          chatId,
          text: `❌ Maximum tracked addresses (${config.limits.maxTrackedPerUser}) reached`,
          replyMarkup: telegramService.createTrackingMenuKeyboard(),
        });
        userStates.delete(userId);
        return;
      }

      // Initialize cursor
      let initialCursor = '';
      if (chain === 'sol') {
        const signatures = await solanaService.getSignaturesForAddress(address, 1);
        initialCursor = signatures[0]?.signature || '';
      } else {
        const latestBlock = await evmService.getLatestBlockNumber(chain);
        initialCursor = latestBlock.toString();
      }

      // Create tracked address
      await prisma.trackedAddress.create({
        data: {
          userId: user.id,
          chain,
          address: chain === 'sol' ? address : evmService.normalizeAddress(address),
          label,
          minAmount,
          lastSeenCursor: initialCursor,
        },
      });

      const shortAddr = address.length > 20
        ? `${address.slice(0, 10)}...${address.slice(-8)}`
        : address;

      await telegramService.sendMessage({
        chatId,
        text: `✅ **Success!**\n\nYour address \`${shortAddr}\` is now being tracked on **${chain.toUpperCase()}** with alert threshold ${minAmount}.\n\nYou will receive alerts for all transactions!`,
        parseMode: 'Markdown',
        replyMarkup: telegramService.createMainMenuKeyboard(),
      });

      // Clear state
      userStates.delete(userId);
    } catch (error) {
      console.error('Error saving tracked address:', error);
      await telegramService.sendMessage({
        chatId,
        text: '❌ Error saving tracked address. Please try again.',
        replyMarkup: telegramService.createTrackingMenuKeyboard(),
      });
      userStates.delete(userId);
    }
  }
}

/**
 * Handle check wallet address submission
 */
async function handleCheckWalletAddress(
  userId: number,
  chatId: number,
  address: string,
  userState: UserState
): Promise<void> {
  const chain = userState.data.chain!;
  
  // Validate address
  let isValid = false;
  if (chain === 'sol') {
    isValid = solanaService.isValidAddress(address);
  } else {
    isValid = evmService.isValidAddress(address);
  }

  if (!isValid) {
    await telegramService.sendMessage({
      chatId,
      text: `❌ Invalid ${chain.toUpperCase()} address format. Please try again or use /menu to cancel.`,
    });
    return;
  }

  // Show processing message
  await telegramService.sendMessage({
    chatId,
    text: '⏳ Analyzing wallet... This may take a few seconds.',
  });

  try {
    // Fetch recent activity
    let recentActivity;
    if (chain === 'sol') {
      recentActivity = await solanaService.getRecentTransactions(address);
    } else {
      recentActivity = await evmService.getRecentTransactions(chain, address);
    }

    // Calculate risk score
    const riskAnalysis = riskService.calculateRiskScore(recentActivity);

    // Build explorer link
    const explorerLink = chain === 'sol'
      ? solanaService.getAddressLink(address)
      : evmService.getAddressLink(chain, address);

    // Format risk level with emoji
    const riskEmoji = {
      low: '✅',
      medium: '⚠️',
      high: '🚨',
      critical: '🔴',
    }[riskAnalysis.riskLevel];

    // Build response message
    const shortAddr = address.length > 20
      ? `${address.slice(0, 10)}...${address.slice(-8)}`
      : address;

    let message = `🔍 **Wallet Check Result**\n\n`;
    message += `Chain: **${chain.toUpperCase()}**\n`;
    message += `Address: \`${shortAddr}\`\n\n`;
    message += `${riskEmoji} **Risk Level: ${riskAnalysis.riskLevel.toUpperCase()}**\n`;
    message += `Risk Score: ${riskAnalysis.riskScore}/100\n\n`;

    if (riskAnalysis.reasons.length > 0) {
      message += `**Risk Indicators:**\n`;
      riskAnalysis.reasons.forEach(reason => {
        message += `• ${reason}\n`;
      });
      message += `\n`;
    }

    // Add recent activity summary
    message += `**Recent Activity:**\n`;
    if (recentActivity.length === 0) {
      message += `No recent transactions found\n`;
    } else {
      const last5 = recentActivity.slice(0, 5);
      last5.forEach(tx => {
        const emoji = tx.direction === 'in' ? '📥' : '📤';
        const date = new Date(tx.timestamp).toLocaleDateString();
        message += `${emoji} ${tx.amount} ${tx.asset} - ${date}\n`;
      });
      
      if (recentActivity.length > 5) {
        message += `\n_...and ${recentActivity.length - 5} more transactions_\n`;
      }
    }

    message += `\n🔗 [View on Explorer](${explorerLink})`;

    await telegramService.sendMessage({
      chatId,
      text: message,
      parseMode: 'Markdown',
      replyMarkup: telegramService.createMainMenuKeyboard(),
    });

    // Clear state
    userStates.delete(userId);
  } catch (error) {
    console.error('Error checking wallet:', error);
    await telegramService.sendMessage({
      chatId,
      text: `❌ Error analyzing wallet: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again or use /menu to return.`,
      replyMarkup: telegramService.createMainMenuKeyboard(),
    });
    userStates.delete(userId);
  }
}

/**
 * Clean up expired user states
 */
function cleanupExpiredStates(): void {
  const now = Date.now();
  for (const [userId, state] of userStates.entries()) {
    if (now - state.timestamp > STATE_TTL) {
      userStates.delete(userId);
    }
  }
}

export default router;
