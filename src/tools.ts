import { z } from 'zod';
import { StripeClient } from './api-client.js';

/**
 * Stripe MCP Tool Definitions
 *
 * 31 tools covering: Balance, Charges, Customers, Disputes,
 * Events, Invoices, Payment Intents, Payouts, Prices, Products,
 * Refunds, Subscriptions
 */

interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  handler: (client: StripeClient, args: any) => Promise<any>;
}

// Reusable pagination params
const paginationParams = {
  limit: z.number().optional().describe('max results (1-100)'),
  starting_after: z.string().optional().describe('cursor: object ID'),
  ending_before: z.string().optional().describe('cursor: object ID'),
};

// Reusable date filter params
const dateFilterParams = {
  created_gte: z.number().optional().describe('created after (unix ts)'),
  created_lte: z.number().optional().describe('created before (unix ts)'),
};

export const tools: ToolDef[] = [
  // --- Balance (3) ---
  {
    name: 'balance_get',
    description: 'Get current account balance',
    inputSchema: z.object({}),
    handler: async (client: StripeClient) => client.getBalance(),
  },
  {
    name: 'balance_transactions_list',
    description: 'List balance transactions',
    inputSchema: z.object({
      ...paginationParams,
      ...dateFilterParams,
      type: z.string().optional().describe('charge, refund, payout, etc.'),
      currency: z.string().optional().describe('3-letter ISO currency'),
      payout: z.string().optional().describe('filter by payout ID'),
      source: z.string().optional().describe('filter by source ID'),
    }),
    handler: async (client: StripeClient, args: any) =>
      client.listBalanceTransactions(args),
  },
  {
    name: 'balance_transaction_get',
    description: 'Get balance transaction by ID',
    inputSchema: z.object({ id: z.string().describe('balance tx ID (txn_xxx)') }),
    handler: async (client: StripeClient, args: { id: string }) =>
      client.getBalanceTransaction(args.id),
  },

  // --- Charges (3) ---
  {
    name: 'charges_list',
    description: 'List charges',
    inputSchema: z.object({
      ...paginationParams,
      ...dateFilterParams,
      customer: z.string().optional().describe('filter by customer ID'),
      payment_intent: z.string().optional().describe('filter by PI ID'),
    }),
    handler: async (client: StripeClient, args: any) =>
      client.listCharges(args),
  },
  {
    name: 'charge_get',
    description: 'Get charge by ID',
    inputSchema: z.object({ id: z.string().describe('charge ID (ch_xxx)') }),
    handler: async (client: StripeClient, args: { id: string }) =>
      client.getCharge(args.id),
  },
  {
    name: 'charges_search',
    description: 'Search charges with query string',
    inputSchema: z.object({
      query: z.string().describe('search query (e.g. amount>999)'),
      limit: z.number().optional().describe('max results (1-100)'),
      page: z.string().optional().describe('pagination cursor'),
    }),
    handler: async (client: StripeClient, args: any) =>
      client.searchCharges(args.query, args.limit, args.page),
  },

  // --- Customers (4) ---
  {
    name: 'customers_list',
    description: 'List customers',
    inputSchema: z.object({
      ...paginationParams,
      ...dateFilterParams,
      email: z.string().optional().describe('filter by email'),
    }),
    handler: async (client: StripeClient, args: any) =>
      client.listCustomers(args),
  },
  {
    name: 'customer_get',
    description: 'Get customer by ID',
    inputSchema: z.object({ id: z.string().describe('customer ID (cus_xxx)') }),
    handler: async (client: StripeClient, args: { id: string }) =>
      client.getCustomer(args.id),
  },
  {
    name: 'customer_create',
    description: 'Create a new customer',
    inputSchema: z.object({
      name: z.string().optional().describe('full name'),
      email: z.string().optional().describe('email address'),
      phone: z.string().optional().describe('phone number'),
      description: z.string().optional().describe('description'),
      metadata: z.string().optional().describe('JSON metadata key-values'),
    }),
    handler: async (client: StripeClient, args: any) => {
      const data: any = { ...args };
      if (args.metadata) data.metadata = JSON.parse(args.metadata);
      return client.createCustomer(data);
    },
  },
  {
    name: 'customers_search',
    description: 'Search customers with query string',
    inputSchema: z.object({
      query: z.string().describe("search query (e.g. name:'Jane')"),
      limit: z.number().optional().describe('max results (1-100)'),
      page: z.string().optional().describe('pagination cursor'),
    }),
    handler: async (client: StripeClient, args: any) =>
      client.searchCustomers(args.query, args.limit, args.page),
  },

  // --- Disputes (2) ---
  {
    name: 'disputes_list',
    description: 'List disputes',
    inputSchema: z.object({
      ...paginationParams,
      ...dateFilterParams,
      charge: z.string().optional().describe('filter by charge ID'),
      payment_intent: z.string().optional().describe('filter by PI ID'),
    }),
    handler: async (client: StripeClient, args: any) =>
      client.listDisputes(args),
  },
  {
    name: 'dispute_get',
    description: 'Get dispute by ID',
    inputSchema: z.object({ id: z.string().describe('dispute ID (dp_xxx)') }),
    handler: async (client: StripeClient, args: { id: string }) =>
      client.getDispute(args.id),
  },

  // --- Events (2) ---
  {
    name: 'events_list',
    description: 'List webhook/audit events',
    inputSchema: z.object({
      ...paginationParams,
      ...dateFilterParams,
      type: z.string().optional().describe('event type filter'),
    }),
    handler: async (client: StripeClient, args: any) =>
      client.listEvents(args),
  },
  {
    name: 'event_get',
    description: 'Get event by ID',
    inputSchema: z.object({ id: z.string().describe('event ID (evt_xxx)') }),
    handler: async (client: StripeClient, args: { id: string }) =>
      client.getEvent(args.id),
  },

  // --- Invoices (5) ---
  {
    name: 'invoices_list',
    description: 'List invoices',
    inputSchema: z.object({
      ...paginationParams,
      ...dateFilterParams,
      customer: z.string().optional().describe('filter by customer ID'),
      subscription: z.string().optional().describe('filter by sub ID'),
      status: z.enum(['draft', 'open', 'paid', 'uncollectible', 'void']).optional().describe('invoice status'),
      collection_method: z.enum(['charge_automatically', 'send_invoice']).optional().describe('collection method'),
    }),
    handler: async (client: StripeClient, args: any) =>
      client.listInvoices(args),
  },
  {
    name: 'invoice_get',
    description: 'Get invoice by ID',
    inputSchema: z.object({ id: z.string().describe('invoice ID (in_xxx)') }),
    handler: async (client: StripeClient, args: { id: string }) =>
      client.getInvoice(args.id),
  },
  {
    name: 'invoice_create',
    description: 'Create a draft invoice',
    inputSchema: z.object({
      customer: z.string().describe('customer ID to bill'),
      collection_method: z.enum(['charge_automatically', 'send_invoice']).optional().describe('collection method'),
      currency: z.string().optional().describe('3-letter ISO currency'),
      description: z.string().optional().describe('invoice description'),
      days_until_due: z.number().optional().describe('days until due'),
      auto_advance: z.boolean().optional().describe('auto-finalize'),
      metadata: z.string().optional().describe('JSON metadata key-values'),
    }),
    handler: async (client: StripeClient, args: any) => {
      const data: any = { ...args };
      if (args.metadata) data.metadata = JSON.parse(args.metadata);
      return client.createInvoice(data);
    },
  },
  {
    name: 'invoice_finalize',
    description: 'Finalize a draft invoice',
    inputSchema: z.object({
      id: z.string().describe('invoice ID (in_xxx)'),
      auto_advance: z.boolean().optional().describe('auto-collect after'),
    }),
    handler: async (client: StripeClient, args: any) =>
      client.finalizeInvoice(args.id, args.auto_advance),
  },
  {
    name: 'invoice_send',
    description: 'Send a finalized invoice by email',
    inputSchema: z.object({ id: z.string().describe('invoice ID (in_xxx)') }),
    handler: async (client: StripeClient, args: { id: string }) =>
      client.sendInvoice(args.id),
  },

  // --- Payment Intents (2) ---
  {
    name: 'payment_intents_list',
    description: 'List payment intents',
    inputSchema: z.object({
      ...paginationParams,
      ...dateFilterParams,
      customer: z.string().optional().describe('filter by customer ID'),
    }),
    handler: async (client: StripeClient, args: any) =>
      client.listPaymentIntents(args),
  },
  {
    name: 'payment_intent_get',
    description: 'Get payment intent by ID',
    inputSchema: z.object({ id: z.string().describe('PI ID (pi_xxx)') }),
    handler: async (client: StripeClient, args: { id: string }) =>
      client.getPaymentIntent(args.id),
  },

  // --- Payouts (2) ---
  {
    name: 'payouts_list',
    description: 'List payouts',
    inputSchema: z.object({
      ...paginationParams,
      ...dateFilterParams,
      status: z.enum(['pending', 'paid', 'failed', 'canceled']).optional().describe('payout status'),
      destination: z.string().optional().describe('external account ID'),
      arrival_date_gte: z.number().optional().describe('arrives after (unix ts)'),
      arrival_date_lte: z.number().optional().describe('arrives before (unix ts)'),
    }),
    handler: async (client: StripeClient, args: any) =>
      client.listPayouts(args),
  },
  {
    name: 'payout_get',
    description: 'Get payout by ID',
    inputSchema: z.object({ id: z.string().describe('payout ID (po_xxx)') }),
    handler: async (client: StripeClient, args: { id: string }) =>
      client.getPayout(args.id),
  },

  // --- Prices (2) ---
  {
    name: 'prices_list',
    description: 'List prices',
    inputSchema: z.object({
      ...paginationParams,
      active: z.boolean().optional().describe('filter active/inactive'),
      currency: z.string().optional().describe('3-letter ISO currency'),
      product: z.string().optional().describe('filter by product ID'),
      type: z.enum(['one_time', 'recurring']).optional().describe('price type'),
    }),
    handler: async (client: StripeClient, args: any) =>
      client.listPrices(args),
  },
  {
    name: 'price_get',
    description: 'Get price by ID',
    inputSchema: z.object({ id: z.string().describe('price ID (price_xxx)') }),
    handler: async (client: StripeClient, args: { id: string }) =>
      client.getPrice(args.id),
  },

  // --- Products (2) ---
  {
    name: 'products_list',
    description: 'List products',
    inputSchema: z.object({
      ...paginationParams,
      ...dateFilterParams,
      active: z.boolean().optional().describe('filter active/inactive'),
    }),
    handler: async (client: StripeClient, args: any) =>
      client.listProducts(args),
  },
  {
    name: 'product_get',
    description: 'Get product by ID',
    inputSchema: z.object({ id: z.string().describe('product ID (prod_xxx)') }),
    handler: async (client: StripeClient, args: { id: string }) =>
      client.getProduct(args.id),
  },

  // --- Refunds (2) ---
  {
    name: 'refunds_list',
    description: 'List refunds',
    inputSchema: z.object({
      ...paginationParams,
      ...dateFilterParams,
      charge: z.string().optional().describe('filter by charge ID'),
      payment_intent: z.string().optional().describe('filter by PI ID'),
    }),
    handler: async (client: StripeClient, args: any) =>
      client.listRefunds(args),
  },
  {
    name: 'refund_get',
    description: 'Get refund by ID',
    inputSchema: z.object({ id: z.string().describe('refund ID (re_xxx)') }),
    handler: async (client: StripeClient, args: { id: string }) =>
      client.getRefund(args.id),
  },

  // --- Subscriptions (2) ---
  {
    name: 'subscriptions_list',
    description: 'List subscriptions',
    inputSchema: z.object({
      ...paginationParams,
      customer: z.string().optional().describe('filter by customer ID'),
      price: z.string().optional().describe('filter by price ID'),
      status: z.enum(['active', 'canceled', 'ended', 'all']).optional().describe('subscription status'),
      collection_method: z.enum(['charge_automatically', 'send_invoice']).optional().describe('collection method'),
    }),
    handler: async (client: StripeClient, args: any) =>
      client.listSubscriptions(args),
  },
  {
    name: 'subscription_get',
    description: 'Get subscription by ID',
    inputSchema: z.object({ id: z.string().describe('sub ID (sub_xxx)') }),
    handler: async (client: StripeClient, args: { id: string }) =>
      client.getSubscription(args.id),
  },
];
