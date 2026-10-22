export interface WooCommerceConfig {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  timeoutMs?: number;
}

export class WooCommerceClient {
  private baseUrl: string;
  private authHeader: string;
  private timeoutMs: number;

  constructor(config: WooCommerceConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    const creds = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
    this.authHeader = `Basic ${creds}`;
    this.timeoutMs = config.timeoutMs || 10000;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/wp-json/wc/v3${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Forwarded-Proto": "https",
      ...(options.headers as Record<string, string> || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg = data && typeof data === "object" && "message" in data 
          ? (data as { message: string }).message 
          : `HTTP error ${response.status} ${response.statusText}`;
        throw new Error(`WooCommerce API Error (${response.status}): ${errorMsg}`);
      }

      return data as T;
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`WooCommerce API request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    }
  }

  // --- Product Methods ---

  async listProducts(params: { page?: number; per_page?: number; search?: string } = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set("page", params.page.toString());
    if (params.per_page) query.set("per_page", params.per_page.toString());
    if (params.search) query.set("search", params.search);

    const qs = query.toString() ? `?${query.toString()}` : "";
    return this.request<any[]>(`/products${qs}`);
  }

  async createProduct(data: { name: string; regular_price: string; description?: string }) {
    return this.request<any>("/products", {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        type: "simple",
        regular_price: data.regular_price,
        description: data.description || "",
        status: "publish",
      }),
    });
  }

  // --- Order Methods ---

  async listOrders(params: { page?: number; per_page?: number; status?: string } = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set("page", params.page.toString());
    if (params.per_page) query.set("per_page", params.per_page.toString());
    if (params.status) query.set("status", params.status);

    const qs = query.toString() ? `?${query.toString()}` : "";
    return this.request<any[]>(`/orders${qs}`);
  }

  async getOrder(id: number) {
    return this.request<any>(`/orders/${id}`);
  }

  async updateOrderStatus(id: number, status: string) {
    return this.request<any>(`/orders/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  }
}
