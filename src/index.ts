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

        await fetch('https://api.line.me/v2/bot/message/reply', {
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

        return c.text("Expense recorded");
      } else {
        await fetch('https://api.line.me/v2/bot/message/reply', {
          method: "POST",
          headers: {
            'Content-Type': 'application/json',
            "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            replyToken: event.replyToken,
            messages: [{
              type: "text",
              text: getReply(message),
            }]
          })
        })
      }
    }
  }

  return c.text("Hello Hono!");
})

function getReply(message: string) {
  try {
    return String(eval(message));
  } catch(error) {
    return String(error);
  }
}

function createBubble(
  title: string,
  text: string | messagingApi.FlexBox,
  {
    headerBackground = '#353433',
    headerColor = '#d7fc70',
    textSize = 'xl',
    altText = String(text),
    footer
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
