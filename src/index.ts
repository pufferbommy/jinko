import { Hono } from 'hono'
import { env } from 'hono/adapter'
import Airtable from 'airtable'
import { messagingApi } from '@line/bot-sdk'

interface Bindings {
  LINE_CHANNEL_ACCESS_TOKEN: string
  AIR_TABLE_API_TOKEN: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.post('/line-webhook', async (c) => {
  const body = await c.req.json()

  const { LINE_CHANNEL_ACCESS_TOKEN, AIR_TABLE_API_TOKEN } = env(c)

  for (const event of body.events) {
    if (event.type === "message") {
      const message: string = event.message.text;

      if (message.match(/[\d.]+([tfml])$/)) {
        const category = {
          t: 'transportation',
          f: "food",
          m: 'miscellaneous',
        }[message.slice(-1)];

        const amount = parseFloat(message.replace(/[^\d.]+/, ''));

        const base = new Airtable({ apiKey: AIR_TABLE_API_TOKEN }).base('appX2d3SZLf8Y1tEw');

        const table = base('Table 1')

        await table.create({
          Category: category,
          Amount: amount
        });

        const body: messagingApi.FlexBox = {
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

        const bubble = createBubble('expense tracking', body, {
          headerColor: '#ffffbb',
        })

        const response = await fetch('https://api.line.me/v2/bot/message/reply', {
          method: "POST",
          headers: {
            'Content-Type': 'application/json',
            "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            replyToken: event.replyToken,
            messages: [bubble]
          })
        })

        console.log(await response.json())

        return c.text("Expense recorded");
      }
    }
  }
})

function createBubble(
  title: string,
  text: string | messagingApi.FlexBox,
  {
    headerBackground = '#353433',
    headerColor = '#d7fc70',
    textSize = 'xl',
    altText = String(text),
  }: {
    headerBackground?: string
    headerColor?: string
    textSize?: messagingApi.FlexText['size']
    altText?: string
    footer?: string | messagingApi.FlexBox
  } = {}
): messagingApi.FlexMessage {
  const data: messagingApi.FlexContainer = {
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
