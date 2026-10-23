import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

interface AnalyticsConfig {
  wordpressUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

export function registerAnalyticsTools(server: McpServer, config: AnalyticsConfig) {
  const getAuthHeader = () => {
    return "Basic " + Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
  };

  const cache = new Map<string, { data: any; expiresAt: number }>();

  const fetchWooCommerce = async (endpoint: string, params: Record<string, string> = {}): Promise<any> => {
    const url = new URL(endpoint, config.wordpressUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    const cacheKey = url.toString();

    const cached = cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: getAuthHeader(),
        Accept: "application/json",
        "X-Forwarded-Proto": "https",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`WooCommerce API error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    cache.set(cacheKey, { data, expiresAt: Date.now() + 10000 }); // 10s cache
    return data;
  };

  // 1. Tool: get_store_metrics
  server.tool(
    "get_store_metrics",
    "Calculate key store business performance metrics including total orders, gross sales, and average order value",
    {},
    async () => {
      try {
        const [orders, products] = await Promise.all([
          fetchWooCommerce("/wp-json/wc/v3/orders", { per_page: "100" }),
          fetchWooCommerce("/wp-json/wc/v3/products", { per_page: "100" }),
        ]);

        const orderList: any[] = Array.isArray(orders) ? orders : [];
        const productList: any[] = Array.isArray(products) ? products : [];

        const totalOrders = orderList.length;
        const completedOrders = orderList.filter((o: any) => o.status === "completed");
        const grossSales = orderList
          .filter((o: any) => o.status === "completed" || o.status === "processing")
          .reduce((sum: number, o: any) => sum + parseFloat(o.total || "0"), 0);

        const avgOrderValue = completedOrders.length > 0 ? (grossSales / completedOrders.length).toFixed(2) : "0.00";

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  store_url: config.wordpressUrl,
                  total_orders: totalOrders,
                  completed_orders: completedOrders.length,
                  processing_orders: orderList.filter((o: any) => o.status === "processing").length,
                  total_products: productList.length,
                  gross_sales: grossSales.toFixed(2),
                  currency: orderList[0]?.currency || "USD",
                  average_order_value: avgOrderValue,
                  timestamp: new Date().toISOString(),
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
          content: [{ type: "text", text: `Failed to calculate store metrics: ${error.message || String(error)}` }],
        };
      }
    }
  );

  // 2. Tool: get_revenue_summary
  server.tool(
    "get_revenue_summary",
    "Retrieve revenue breakdown grouped by order status and order volumes",
    {
      status: z
        .enum(["all", "completed", "processing", "on-hold", "cancelled"])
        .optional()
        .describe("Filter revenue calculations by specific order status (default: 'all')"),
    },
    async (args) => {
      try {
        const queryParams: Record<string, string> = { per_page: "100" };
        if (args.status && args.status !== "all") {
          queryParams.status = args.status;
        }

        const orders = await fetchWooCommerce("/wp-json/wc/v3/orders", queryParams);
        const orderList: any[] = Array.isArray(orders) ? orders : [];

        const breakdown: Record<string, { count: number; total: number }> = {};

        for (const order of orderList) {
          const st = order.status;
          if (!breakdown[st]) {
            breakdown[st] = { count: 0, total: 0 };
          }
          breakdown[st].count += 1;
          breakdown[st].total += parseFloat(order.total || "0");
        }

        const totalRevenue = Object.entries(breakdown)
          .filter(([st]) => st === "completed" || st === "processing")
          .reduce((acc, [, v]) => acc + v.total, 0);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  revenue_by_status: Object.fromEntries(
                    Object.entries(breakdown).map(([k, v]) => [k, { count: v.count, total: v.total.toFixed(2) }])
                  ),
                  recognized_revenue: totalRevenue.toFixed(2),
                  currency: orderList[0]?.currency || "USD",
                  total_orders_analyzed: orderList.length,
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
          content: [{ type: "text", text: `Failed to generate revenue summary: ${error.message || String(error)}` }],
        };
      }
    }
  );

  // 3. Tool: get_inventory_status
  server.tool(
    "get_inventory_status",
    "Inspect catalog stock levels, identify out-of-stock and in-stock product counts",
    {},
    async () => {
      try {
        const products = await fetchWooCommerce("/wp-json/wc/v3/products", { per_page: "100" });
        const productList: any[] = Array.isArray(products) ? products : [];

        const inStock = productList.filter((p: any) => p.stock_status === "instock");
        const outOfStock = productList.filter((p: any) => p.stock_status === "outofstock");
        const onBackorder = productList.filter((p: any) => p.stock_status === "onbackorder");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  total_catalog_items: productList.length,
                  in_stock_count: inStock.length,
                  out_of_stock_count: outOfStock.length,
                  backorder_count: onBackorder.length,
                  items: productList.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    price: p.price,
                    stock_status: p.stock_status,
                    manage_stock: p.manage_stock,
                    stock_quantity: p.stock_quantity,
                  })),
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
          content: [{ type: "text", text: `Failed to get inventory status: ${error.message || String(error)}` }],
        };
      }
    }
  );
}
