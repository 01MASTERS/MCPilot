import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerTimeTools(server: McpServer) {
  // 1. Tool: get_current_time
  server.tool(
    "get_current_time",
    "Retrieve current store server time, UTC offset, and local representation for a given timezone",
    {
      timezone: z
        .string()
        .optional()
        .describe("IANA timezone identifier, e.g. 'UTC', 'America/New_York', 'Europe/London', 'Asia/Kolkata' (default: 'UTC')"),
    },
    async (args) => {
      const tz = args.timezone || "UTC";
      const now = new Date();

      try {
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          dateStyle: "full",
          timeStyle: "long",
        });

        const formatted = formatter.format(now);
        const dayOfWeek = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  timezone: tz,
                  iso: now.toISOString(),
                  formatted: formatted,
                  day_of_week: dayOfWeek,
                  unix_timestamp: Math.floor(now.getTime() / 1000),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Invalid timezone '${tz}': ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // 2. Tool: calculate_delivery_window
  server.tool(
    "calculate_delivery_window",
    "Calculate estimated delivery window and arrival date based on business days, skipping weekends",
    {
      order_date: z
        .string()
        .optional()
        .describe("Order placement date/time in ISO format (e.g. '2026-10-12T14:30:00Z'). Defaults to current time."),
      shipping_days: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe("Estimated shipping business days (default: 3)"),
      express: z
        .boolean()
        .optional()
        .describe("Whether express delivery is selected (express guarantees 1-2 business days)"),
    },
    async (args) => {
      const daysToAdd = args.express ? 1 : args.shipping_days || 3;
      const startDate = args.order_date ? new Date(args.order_date) : new Date();

      if (isNaN(startDate.getTime())) {
        return {
          isError: true,
          content: [{ type: "text", text: `Invalid order_date format: '${args.order_date}'` }],
        };
      }

      // If placed after 15:00 UTC, processing begins next calendar day
      const current = new Date(startDate);
      if (current.getUTCHours() >= 15) {
        current.setUTCDate(current.getUTCDate() + 1);
      }

      let businessDaysCounted = 0;
      while (businessDaysCounted < daysToAdd) {
        current.setUTCDate(current.getUTCDate() + 1);
        const day = current.getUTCDay();
        if (day !== 0 && day !== 6) {
          businessDaysCounted++;
        }
      }

      const totalCalendarDays = Math.ceil((current.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                order_date: startDate.toISOString(),
                estimated_delivery_date: current.toISOString().split("T")[0],
                business_days_transit: daysToAdd,
                calendar_days_total: totalCalendarDays,
                service_tier: args.express ? "Express Priority" : "Standard Shipping",
                guaranteed_by: current.toISOString(),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 3. Tool: check_business_hours
  server.tool(
    "check_business_hours",
    "Check if the store customer support and fulfillment center is currently open",
    {
      timezone: z
        .string()
        .optional()
        .describe("Timezone to evaluate store business hours in (default: 'UTC')"),
    },
    async (args) => {
      const tz = args.timezone || "UTC";
      const now = new Date();

      try {
        const hourStr = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour: "numeric",
          hour12: false,
        }).format(now);
        const dayStr = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          weekday: "short",
        }).format(now);

        const hour = parseInt(hourStr, 10);
        const isWeekend = dayStr === "Sat" || dayStr === "Sun";
        const isOpen = !isWeekend && hour >= 9 && hour < 18;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  timezone: tz,
                  current_day: dayStr,
                  current_hour: hour,
                  is_open: isOpen,
                  support_hours: "Monday - Friday, 09:00 - 18:00 (9 AM - 6 PM)",
                  message: isOpen
                    ? "Customer support and order fulfillment are currently OPEN."
                    : "Store support is currently CLOSED. Inquiries will be addressed on the next business day at 09:00.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error checking business hours: ${error.message || String(error)}` }],
        };
      }
    }
  );
}
