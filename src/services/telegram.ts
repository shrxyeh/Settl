import { config } from '../config';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

interface SendMessageOptions {
  chatId: number;
  text: string;
  replyMarkup?: any;
  parseMode?: 'Markdown' | 'HTML';
}

interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

interface TelegramApiResponse {
  ok: boolean;
  result?: any;
  description?: string;
}

export class TelegramService {
  private botToken: string;

  constructor() {
    this.botToken = config.telegram.botToken;
  }

  private getApiUrl(method: string): string {
    return `${TELEGRAM_API_BASE}/bot${this.botToken}/${method}`;
  }

  async sendMessage(options: SendMessageOptions): Promise<any> {
    const payload: any = {
      chat_id: options.chatId,
      text: options.text,
    };

    if (options.replyMarkup) {
      payload.reply_markup = options.replyMarkup;
    }

    if (options.parseMode) {
      payload.parse_mode = options.parseMode;
    }

    try {
      const response = await fetch(this.getApiUrl('sendMessage'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as TelegramApiResponse;
      if (!data.ok) {
        console.error('Telegram sendMessage error:', data);
        throw new Error(`Telegram API error: ${data.description || 'Unknown error'}`);
      }

      return data.result;
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
      throw error;
    }
  }

  async setWebhook(webhookUrl: string): Promise<void> {
    try {
      const response = await fetch(this.getApiUrl('setWebhook'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
        }),
      });

      const data = (await response.json()) as TelegramApiResponse;
      if (!data.ok) {
        console.error('Telegram setWebhook error:', data);
        throw new Error(`Failed to set webhook: ${data.description || 'Unknown error'}`);
      }

      console.log('Webhook set successfully:', webhookUrl);
    } catch (error) {
      console.error('Failed to set webhook:', error);
      throw error;
    }
  }

  async deleteWebhook(): Promise<void> {
    try {
      const response = await fetch(this.getApiUrl('deleteWebhook'), {
        method: 'POST',
      });

      const data = (await response.json()) as TelegramApiResponse;
      if (!data.ok) {
        console.error('Telegram deleteWebhook error:', data);
      }
    } catch (error) {
      console.error('Failed to delete webhook:', error);
    }
  }

  async setBotCommands(): Promise<void> {
    const commands = [
      { command: 'start', description: 'Start the bot' },
      { command: 'menu', description: 'Show main menu' },
      { command: 'check', description: 'Check a wallet address' },
      { command: 'tracking', description: 'Manage tracked wallets' },
      { command: 'help', description: 'Show help information' },
    ];

    try {
      const response = await fetch(this.getApiUrl('setMyCommands'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ commands }),
      });

      const data = (await response.json()) as TelegramApiResponse;
      if (!data.ok) {
        console.error('Telegram setBotCommands error:', data);
      } else {
        console.log('Bot commands set successfully');
      }
    } catch (error) {
      console.error('Failed to set bot commands:', error);
    }
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    try {
      const payload: any = {
        callback_query_id: callbackQueryId,
      };

      if (text) {
        payload.text = text;
      }

      await fetch(this.getApiUrl('answerCallbackQuery'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Failed to answer callback query:', error);
    }
  }

  createInlineKeyboard(buttons: InlineKeyboardButton[][]): any {
    return {
      inline_keyboard: buttons,
    };
  }

  createMainMenuKeyboard(): any {
    return this.createInlineKeyboard([
      [{ text: '🔍 Check', callback_data: 'menu:check' }, { text: '📊 Tracking', callback_data: 'menu:tracking' }],
      [{ text: '👤 My account', callback_data: 'menu:account' }],
      [{ text: '❓ Help', callback_data: 'menu:help' }],
    ]);
  }

  createTrackingMenuKeyboard(): any {
    return this.createInlineKeyboard([
      [{ text: '👁️ View Tracked', callback_data: 'tracking:view' }],
      [{ text: '➕ Add New', callback_data: 'tracking:add-new' }],
      [{ text: '⬅️ Back to Menu', callback_data: 'menu:main' }],
    ]);
  }

  createChainSelectionKeyboard(): any {
    return this.createInlineKeyboard([
      [{ text: 'Ethereum', callback_data: 'chain:eth' }, { text: 'Bsc', callback_data: 'chain:bsc' }, { text: 'Polygon', callback_data: 'chain:polygon' }, { text: 'Avalanche', callback_data: 'chain:avax' }],
      [{ text: 'Base', callback_data: 'chain:base' }, { text: 'Arbitrum', callback_data: 'chain:arbitrum' }, { text: 'Blast', callback_data: 'chain:blast' }, { text: 'Optimism', callback_data: 'chain:optimism' }],
      [{ text: 'Mantle', callback_data: 'chain:mantle' }, { text: 'Ink', callback_data: 'chain:ink' }],
      [{ text: '❌ Cancel', callback_data: 'cancel' }],
    ]);
  }

  createBackKeyboard(): any {
    return this.createInlineKeyboard([
      [{ text: '⬅️ Back to Menu', callback_data: 'menu:main' }],
    ]);
  }

  formatAlert(
    chain: string,
    address: string,
    label: string,
    txHash: string,
    direction: string,
    amount: number,
    asset: string,
    explorerLink: string
  ): string {
    const emoji = direction === 'in' ? '📥' : '📤';
    return `${emoji} **Alert: ${chain.toUpperCase()}**\n\n` +
      `Label: ${label}\n` +
      `Address: \`${address.slice(0, 10)}...${address.slice(-8)}\`\n` +
      `Direction: ${direction.toUpperCase()}\n` +
      `Amount: ${amount} ${asset}\n` +
      `Tx: \`${txHash.slice(0, 10)}...${txHash.slice(-8)}\`\n\n` +
      `🔗 [View on Explorer](${explorerLink})`;
  }
}

export const telegramService = new TelegramService();
