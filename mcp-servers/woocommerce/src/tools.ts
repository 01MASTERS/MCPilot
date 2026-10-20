import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WooCommerceClient } from "./woocommerce-client.js";

export function registerWooCommerceTools(server: McpServer, wcClient: WooCommerceClient) {
  // 1. Tool: list_products
  server.tool(
    "list_products",
    "List products from the WooCommerce store catalog with optional pagination and search filters",
    {
      page: z.number().int().min(1).optional().describe("Page number of the results to retrieve (default: 1)"),
      per_page: z.number().int().min(1).max(100).optional().describe("Number of items to return per page (default: 10, max: 100)"),
      search: z.string().optional().describe("Search keyword to filter products by title or description"),
    },
    async (args) => {
      try {
        const products = await wcClient.listProducts({
          page: args.page,
          per_page: args.per_page,
          search: args.search,
        });

        const formatted = products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          regular_price: p.regular_price,
          status: p.status,
          stock_status: p.stock_status,
          permalink: p.permalink,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(formatted, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to list products: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // 2. Tool: create_product
  server.tool(
    "create_product",
    "Create a new simple product in the WooCommerce catalog",
    {
      name: z.string().min(1).describe("Name / title of the product"),
      regular_price: z.string().describe("Regular selling price for the product (e.g. '29.99')"),
      description: z.string().optional().describe("Detailed description of the product"),
    },
    async (args) => {
      try {
        const product = await wcClient.createProduct({
          name: args.name,
          regular_price: args.regular_price,
          description: args.description,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  status: product.status,
                  permalink: product.permalink,
                  message: `Product '${product.name}' created successfully with ID ${product.id}`,
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
              text: `Failed to create product: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // 3. Tool: list_orders
  server.tool(
    "list_orders",
    "List orders from the WooCommerce store with optional pagination and status filtering",
    {
      page: z.number().int().min(1).optional().describe("Page number of the results to retrieve (default: 1)"),
      per_page: z.number().int().min(1).max(100).optional().describe("Number of items to return per page (default: 10, max: 100)"),
      status: z
        .enum(["any", "pending", "processing", "on-hold", "completed", "cancelled", "refunded", "failed", "trash"])
        .optional()
        .describe("Limit list to orders matching a specific status"),
    },
    async (args) => {
      try {
        const orders = await wcClient.listOrders({
          page: args.page,
          per_page: args.per_page,
          status: args.status === "any" ? undefined : args.status,
        });

        const formatted = orders.map((o) => ({
          id: o.id,
          number: o.number,
          status: o.status,
          total: o.total,
          currency: o.currency,
          payment_method_title: o.payment_method_title,
          customer_id: o.customer_id,
          date_created: o.date_created,
          item_count: o.line_items?.length || 0,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(formatted, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to list orders: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // 4. Tool: get_order
  server.tool(
    "get_order",
    "Get full details of a specific WooCommerce order by ID",
    {
      id: z.number().int().describe("Numeric ID of the order to retrieve"),
    },
    async (args) => {
      try {
        const order = await wcClient.getOrder(args.id);

        const formatted = {
          id: order.id,
          number: order.number,
          status: order.status,
          total: order.total,
          currency: order.currency,
          date_created: order.date_created,
          payment_method_title: order.payment_method_title,
          billing: order.billing,
          shipping: order.shipping,
          line_items: (order.line_items || []).map((item: any) => ({
            id: item.id,
            name: item.name,
            product_id: item.product_id,
            quantity: item.quantity,
            total: item.total,
          })),
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(formatted, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to get order ${args.id}: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // 5. Tool: update_order_status
  server.tool(
    "update_order_status",
    "Update the status of an existing WooCommerce order (e.g. mark processing, completed, or cancelled)",
    {
      id: z.number().int().describe("Numeric ID of the order to update"),
      status: z
        .enum(["pending", "processing", "on-hold", "completed", "cancelled", "refunded", "failed"])
        .describe("New status to apply to the order"),
    },
    async (args) => {
      try {
        const order = await wcClient.updateOrderStatus(args.id, args.status);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  id: order.id,
                  status: order.status,
                  total: order.total,
                  message: `Order #${order.id} status updated to '${order.status}'`,
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
              text: `Failed to update status for order ${args.id}: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );
}
