/**
 * Stripe API Client
 *
 * Base URL: https://api.stripe.com/v1
 * Auth: Bearer token (Authorization: Bearer sk_xxx)
 * Request bodies: application/x-www-form-urlencoded (NOT JSON)
 * Responses: JSON
 * Pagination: cursor-based (starting_after, ending_before, limit)
 * Search pagination: page-based (page, next_page)
 */

const BASE_URL = 'https://api.stripe.com/v1';

export class StripeClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Flatten nested objects to Stripe's form-encoded bracket notation.
   * e.g., { address: { city: 'SF' } } -> 'address[city]=SF'
   */
  private flattenParams(
    data: Record<string, any>,
    params: URLSearchParams,
    prefix?: string
  ): void {
    for (const [key, value] of Object.entries(data)) {
      const fullKey = prefix ? `${prefix}[${key}]` : key;
      if (value === undefined || value === null) continue;
      if (typeof value === 'object' && !Array.isArray(value)) {
        this.flattenParams(value, params, fullKey);
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'object') {
            this.flattenParams(item, params, `${fullKey}[${index}]`);
          } else {
            params.append(`${fullKey}[${index}]`, String(item));
          }
        });
      } else {
        params.append(fullKey, String(value));
      }
    }
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: Record<string, any>;
      params?: Record<string, string | number | boolean | undefined>;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, params } = options;
    const url = new URL(`${BASE_URL}${endpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json',
    };

    let requestBody: string | undefined;
    if (body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const formParams = new URLSearchParams();
      this.flattenParams(body, formParams);
      requestBody = formParams.toString();
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      ...(requestBody ? { body: requestBody } : {}),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Stripe API Error ${response.status}: ${text}`);
    }

    return response.json();
  }

  // --- Balance ---
  async getBalance() {
    return this.request<any>('/balance');
  }

  async listBalanceTransactions(params?: {
    limit?: number; starting_after?: string; ending_before?: string;
    type?: string; currency?: string; payout?: string; source?: string;
    created_gte?: number; created_lte?: number;
  }) {
    const queryParams: Record<string, any> = { ...params };
    if (params?.created_gte) { queryParams['created[gte]'] = params.created_gte; delete queryParams.created_gte; }
    if (params?.created_lte) { queryParams['created[lte]'] = params.created_lte; delete queryParams.created_lte; }
    return this.request<any>('/balance_transactions', { params: queryParams });
  }

  async getBalanceTransaction(id: string) {
    return this.request<any>(`/balance_transactions/${encodeURIComponent(id)}`);
  }

  // --- Charges ---
  async listCharges(params?: {
    limit?: number; starting_after?: string; ending_before?: string;
    customer?: string; payment_intent?: string;
    created_gte?: number; created_lte?: number;
  }) {
    const queryParams: Record<string, any> = { ...params };
    if (params?.created_gte) { queryParams['created[gte]'] = params.created_gte; delete queryParams.created_gte; }
    if (params?.created_lte) { queryParams['created[lte]'] = params.created_lte; delete queryParams.created_lte; }
    return this.request<any>('/charges', { params: queryParams });
  }

  async getCharge(id: string) {
    return this.request<any>(`/charges/${encodeURIComponent(id)}`);
  }

  async searchCharges(query: string, limit?: number, page?: string) {
    return this.request<any>('/charges/search', { params: { query, limit, page } });
  }

  // --- Customers ---
  async listCustomers(params?: {
    limit?: number; starting_after?: string; ending_before?: string;
    email?: string; created_gte?: number; created_lte?: number;
  }) {
    const queryParams: Record<string, any> = { ...params };
    if (params?.created_gte) { queryParams['created[gte]'] = params.created_gte; delete queryParams.created_gte; }
    if (params?.created_lte) { queryParams['created[lte]'] = params.created_lte; delete queryParams.created_lte; }
    return this.request<any>('/customers', { params: queryParams });
  }

  async getCustomer(id: string) {
    return this.request<any>(`/customers/${encodeURIComponent(id)}`);
  }

  async createCustomer(data: {
    name?: string; email?: string; phone?: string;
    description?: string; metadata?: Record<string, string>;
    address?: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string };
  }) {
    return this.request<any>('/customers', { method: 'POST', body: data });
  }

  async searchCustomers(query: string, limit?: number, page?: string) {
    return this.request<any>('/customers/search', { params: { query, limit, page } });
  }

  // --- Disputes ---
  async listDisputes(params?: {
    limit?: number; starting_after?: string; ending_before?: string;
    charge?: string; payment_intent?: string;
    created_gte?: number; created_lte?: number;
  }) {
    const queryParams: Record<string, any> = { ...params };
    if (params?.created_gte) { queryParams['created[gte]'] = params.created_gte; delete queryParams.created_gte; }
    if (params?.created_lte) { queryParams['created[lte]'] = params.created_lte; delete queryParams.created_lte; }
    return this.request<any>('/disputes', { params: queryParams });
  }

  async getDispute(id: string) {
    return this.request<any>(`/disputes/${encodeURIComponent(id)}`);
  }

  // --- Events ---
  async listEvents(params?: {
    limit?: number; starting_after?: string; ending_before?: string;
    type?: string; created_gte?: number; created_lte?: number;
  }) {
    const queryParams: Record<string, any> = { ...params };
    if (params?.created_gte) { queryParams['created[gte]'] = params.created_gte; delete queryParams.created_gte; }
    if (params?.created_lte) { queryParams['created[lte]'] = params.created_lte; delete queryParams.created_lte; }
    return this.request<any>('/events', { params: queryParams });
  }

  async getEvent(id: string) {
    return this.request<any>(`/events/${encodeURIComponent(id)}`);
  }

  // --- Invoices ---
  async listInvoices(params?: {
    limit?: number; starting_after?: string; ending_before?: string;
    customer?: string; subscription?: string; status?: string;
    collection_method?: string; created_gte?: number; created_lte?: number;
  }) {
    const queryParams: Record<string, any> = { ...params };
    if (params?.created_gte) { queryParams['created[gte]'] = params.created_gte; delete queryParams.created_gte; }
    if (params?.created_lte) { queryParams['created[lte]'] = params.created_lte; delete queryParams.created_lte; }
    return this.request<any>('/invoices', { params: queryParams });
  }

  async getInvoice(id: string) {
    return this.request<any>(`/invoices/${encodeURIComponent(id)}`);
  }

  async createInvoice(data: {
    customer: string; collection_method?: string; currency?: string;
    description?: string; due_date?: number; days_until_due?: number;
    auto_advance?: boolean; metadata?: Record<string, string>;
  }) {
    return this.request<any>('/invoices', { method: 'POST', body: data });
  }

  async finalizeInvoice(id: string, autoAdvance?: boolean) {
    const body: Record<string, any> = {};
    if (autoAdvance !== undefined) body.auto_advance = autoAdvance;
    return this.request<any>(`/invoices/${encodeURIComponent(id)}/finalize`, { method: 'POST', body });
  }

  async sendInvoice(id: string) {
    return this.request<any>(`/invoices/${encodeURIComponent(id)}/send`, { method: 'POST', body: {} });
  }

  // --- Payment Intents ---
  async listPaymentIntents(params?: {
    limit?: number; starting_after?: string; ending_before?: string;
    customer?: string; created_gte?: number; created_lte?: number;
  }) {
    const queryParams: Record<string, any> = { ...params };
    if (params?.created_gte) { queryParams['created[gte]'] = params.created_gte; delete queryParams.created_gte; }
    if (params?.created_lte) { queryParams['created[lte]'] = params.created_lte; delete queryParams.created_lte; }
    return this.request<any>('/payment_intents', { params: queryParams });
  }

  async getPaymentIntent(id: string) {
    return this.request<any>(`/payment_intents/${encodeURIComponent(id)}`);
  }

  // --- Payouts ---
  async listPayouts(params?: {
    limit?: number; starting_after?: string; ending_before?: string;
    status?: string; destination?: string;
    arrival_date_gte?: number; arrival_date_lte?: number;
    created_gte?: number; created_lte?: number;
  }) {
    const queryParams: Record<string, any> = { ...params };
    if (params?.created_gte) { queryParams['created[gte]'] = params.created_gte; delete queryParams.created_gte; }
    if (params?.created_lte) { queryParams['created[lte]'] = params.created_lte; delete queryParams.created_lte; }
    if (params?.arrival_date_gte) { queryParams['arrival_date[gte]'] = params.arrival_date_gte; delete queryParams.arrival_date_gte; }
    if (params?.arrival_date_lte) { queryParams['arrival_date[lte]'] = params.arrival_date_lte; delete queryParams.arrival_date_lte; }
    return this.request<any>('/payouts', { params: queryParams });
  }

  async getPayout(id: string) {
    return this.request<any>(`/payouts/${encodeURIComponent(id)}`);
  }

  // --- Prices ---
  async listPrices(params?: {
    limit?: number; starting_after?: string; ending_before?: string;
    active?: boolean; currency?: string; product?: string;
    type?: string;
  }) {
    return this.request<any>('/prices', { params });
  }

  async getPrice(id: string) {
    return this.request<any>(`/prices/${encodeURIComponent(id)}`);
  }

  // --- Products ---
  async listProducts(params?: {
    limit?: number; starting_after?: string; ending_before?: string;
    active?: boolean; created_gte?: number; created_lte?: number;
  }) {
    const queryParams: Record<string, any> = { ...params };
    if (params?.created_gte) { queryParams['created[gte]'] = params.created_gte; delete queryParams.created_gte; }
    if (params?.created_lte) { queryParams['created[lte]'] = params.created_lte; delete queryParams.created_lte; }
    return this.request<any>('/products', { params: queryParams });
  }

  async getProduct(id: string) {
    return this.request<any>(`/products/${encodeURIComponent(id)}`);
  }

  // --- Refunds ---
  async listRefunds(params?: {
    limit?: number; starting_after?: string; ending_before?: string;
    charge?: string; payment_intent?: string;
    created_gte?: number; created_lte?: number;
  }) {
    const queryParams: Record<string, any> = { ...params };
    if (params?.created_gte) { queryParams['created[gte]'] = params.created_gte; delete queryParams.created_gte; }
    if (params?.created_lte) { queryParams['created[lte]'] = params.created_lte; delete queryParams.created_lte; }
    return this.request<any>('/refunds', { params: queryParams });
  }

  async getRefund(id: string) {
    return this.request<any>(`/refunds/${encodeURIComponent(id)}`);
  }

  // --- Subscriptions ---
  async listSubscriptions(params?: {
    limit?: number; starting_after?: string; ending_before?: string;
    customer?: string; price?: string; status?: string;
    collection_method?: string;
  }) {
    return this.request<any>('/subscriptions', { params });
  }

  async getSubscription(id: string) {
    return this.request<any>(`/subscriptions/${encodeURIComponent(id)}`);
  }
}
