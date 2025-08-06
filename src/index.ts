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

        const client = new MessagingApiClient({
          channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN
        });


        const tableData = await table.select().all()

        const todayUsage = tableData.reduce((acc, record) => {
          const amount = record.get('Amount');

          if (amount) {
            const date = new Date(record.get('Date') as string);
            const today = new Date();
            if (date.getDate() === today.getDate() &&
              date.getMonth() === today.getMonth() &&
              date.getFullYear() === today.getFullYear()) {
              return acc + parseFloat(amount as string);
            }
          }

          return acc;
        }, 0) + amount;

        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{
            type: "flex",
            altText: "Expense Tracking",
            contents: {
              "type": "bubble",
              "header": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                  {
                    "type": "text",
                    "text": "Expense Tracking",
                    "color": "#FFFFFF"
                  }
                ],
                "backgroundColor": "#000000"
              },
              "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                  {
                    "type": "text",
                    "text": `฿${amount.toFixed(2)}`,
                    "weight": "bold",
                    "size": "xl"
                  },
                  {
                    "type": "text",
                    "text": "Food"
                  },
                  {
                    "type": "text",
                    "text": "Recorded"
                  }
                ]
              },
              "footer": {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                  {
                    "type": "text",
                    "text": "Today Usage",
                    "color": "#FFFFFF"
                  },
                  {
                    "type": "text",
                    "text": `฿${todayUsage.toFixed(2)}`,
                    "color": "#FFFFFF",
                    "align": "end"
                  }
                ],
                "backgroundColor": "#000000"
              }
            },
          }
          ]
        });

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



        return c.text("Expense recorded");
      }
    }
  }

  return c.text("Hello Line Bot!");
})

export default app
