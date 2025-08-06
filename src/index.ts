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

        try {
          console.log('Recording expense:', { category, amount });
          const base = new Airtable({ apiKey: AIR_TABLE_API_TOKEN }).base('appX2d3SZLf8Y1tEw');

          const table = base('Table 1')

          await table.create({
            Category: category,
            Amount: amount
          });
        } catch(error) {
          console.error('Error creating Airtable record:', error);
          return c.text("Failed to record expense", 500);
        }

        const base = new Airtable({ apiKey: AIR_TABLE_API_TOKEN }).base('appX2d3SZLf8Y1tEw');

        const table = base('Table 1')

        await table.create({
          Category: category,
          Amount: amount
        });

        const body: line.messagingApi.FlexBox = {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '฿' + amount,
              size: 'xxl',
              weight: 'bold',
            },
            {
              type: 'text',
              text: `${category}\nrecorded`,
              wrap: true,
            },
          ],
        }

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
        }, 0)

        const bubble = createBubble('expense tracking', body, {
          headerColor: '#ffffbb',
          footer: {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: "Today usage",
                color: "#8b8685",
                size: "sm",
                flex: 0
              },
              {
                type: "text",
                text: `฿${todayUsage.toFixed(2)}`,
                color: "#8b8685",
                size: "sm",
                align: "end"
              }
            ]
          }
        })

        const client = new MessagingApiClient({
          channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN
        });
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [bubble]
        });

        return c.text("Expense recorded");
      }
    }
  }

  return c.text("Hello Line Bot!");
})

function createBubble(
  title: string,
  text: string | line.messagingApi.FlexBox,
  {
    headerBackground = '#353433',
    headerColor = '#d7fc70',
    textSize = 'xl',
    altText = String(text),
    footer
  }: {
    headerBackground?: string
    headerColor?: string
    textSize?: line.messagingApi.FlexText['size']
    altText?: string
    footer?: string | line.messagingApi.FlexBox
  } = {}
): line.messagingApi.FlexMessage {
  const data: line.messagingApi.FlexContainer = {
    type: 'bubble',
    styles: {
      header: { backgroundColor: headerBackground },
    },
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: title, color: headerColor, weight: 'bold' },
      ],
    },
    body:
      typeof text === 'string'
        ? {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: text, wrap: true, size: textSize },
          ],
        }
        : text,
  }
  if (footer) {
    data.styles!.footer = { backgroundColor: '#e9e8e7' }
    data.footer =
      typeof footer === 'string'
        ? {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: footer,
              wrap: true,
              size: 'sm',
              color: '#8b8685',
            },
          ],
        }
        : footer
  }
  return {
    type: 'flex',
    altText: truncate(`[${title}] ${altText}`, 400),
    contents: data,
  }
}

function truncate(text: string, maxLength: number) {
  return text.length + 5 > maxLength
    ? text.slice(0, maxLength - 5) + '…'
    : text
}

export default app
