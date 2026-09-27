// Dedicated Stripe agent key; do not share the checkout/payment processing key.
export function stripeMcpConfigured(){return Boolean(process.env.STRIPE_AGENT_API_KEY);}
export function stripeMcpTools(){return stripeMcpConfigured()?[{type:'mcp',server_label:'unite_stripe',transport:{type:'http',server_url:'https://mcp.stripe.com',authorization:'Bearer '+process.env.STRIPE_AGENT_API_KEY},allowed_tools:['stripe_api_search','stripe_api_details','stripe_api_read','get_stripe_account_info'],required:false}]:[];}
