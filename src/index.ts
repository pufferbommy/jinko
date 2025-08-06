import { Hono } from 'hono'
import Airtable from 'airtable'
import * as line from '@line/bot-sdk';
const MessagingApiClient = line.messagingApi.MessagingApiClient;
import { env } from 'hono/adapter'

interface Bindings {
  LINE_CHANNEL_ACCESS_TOKEN: string
  AIR_TABLE_API_TOKEN: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) => c.text('Hello Hono!'))

app.post('/line-webhook', async (c) => {
  const body = await c.req.json()

  const { AIR_TABLE_API_TOKEN, LINE_CHANNEL_ACCESS_TOKEN } = env(c)

  for (const event of body.events) {
    if (event.type === "message") {
      const message: string = event.message.text;

      if (/([\d.]+)?pp/.test(message)) {
        const amount = parseFloat(message.replace(/[^\d.]+/, ''));
        const client = new MessagingApiClient({
          channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN
        });
        const promptpayId = '0942751668';
        const imageUrl = amount
          ? `https://promptpay.io/${promptpayId}/${amount}.png`
          : `https://promptpay.io/${promptpayId}.png`;
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [
            {
              type: "text",
              text: amount ? `PromptPay QR to ${promptpayId} for ฿${amount.toFixed(2)}` : `PromptPay QR to ${promptpayId}`
            },
            {
              type: "image",
              originalContentUrl: imageUrl,
              previewImageUrl: imageUrl
            }
          ]
        });
        return c.text("PromptPay QR sent");
      } else if (/[\d.]+([tfml])$/.test(message)) {
        const category = {
          t: 'transportation',
          f: "food",
          m: 'miscellaneous',
        }[message.slice(-1)];

        const amount = parseFloat(message.replace(/[^\d.]+/, ''));

        const base = new Airtable({ apiKey: AIR_TABLE_API_TOKEN }).base('appX2d3SZLf8Y1tEw');

        const table = base('Table 1')

        try {
          console.log('Recording expense:', { category, amount });

          await table.create({
            Category: category,
            Amount: amount
          });
        } catch (error) {
          console.error('Error creating Airtable record:', error);
          return c.text("Failed to record expense", 500);
        }

        const client = new MessagingApiClient({
            channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN
          });
         await client.replyMessage({
          replyToken: event.replyToken,
          messages: [
            {
              type: "text",
              text: `Expense recorded: ${category} - ฿${amount.toFixed(2)}`
            }
          ]
        });

        return c.text("Expense recorded");
      }
    }
  }

  return c.text("Hello Line Bot!");
})

export default app
