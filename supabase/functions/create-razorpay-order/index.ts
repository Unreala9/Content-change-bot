const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateOrderRequest {
  plan_id: "plan_599" | "plan_799";
}

const PLAN_PRICES: Record<string, { amount: number; name: string }> = {
  plan_599: { amount: 59900, name: "Basic Plan (₹599)" },
  plan_799: { amount: 79900, name: "Pro Plan (₹799)" },
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!keyId || !keySecret) {
      return new Response(
        JSON.stringify({ error: "Razorpay Key ID or Secret is not configured in environment variables." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { plan_id } = (await req.json()) as CreateOrderRequest;

    if (!plan_id || !PLAN_PRICES[plan_id]) {
      return new Response(
        JSON.stringify({ error: "Invalid plan_id specified. Choose 'plan_599' or 'plan_799'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const planInfo = PLAN_PRICES[plan_id];

    // Call Razorpay API to create order
    const authHeader = "Basic " + btoa(`${keyId}:${keySecret}`);
    const razorpayRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: planInfo.amount,
        currency: "INR",
        receipt: `rcpt_${Date.now()}`,
        notes: {
          plan_id: plan_id,
          plan_name: planInfo.name,
        },
      }),
    });

    const razorpayData = await razorpayRes.json();

    if (!razorpayRes.ok) {
      return new Response(
        JSON.stringify({ error: razorpayData.error?.description || "Failed to create order with Razorpay." }),
        { status: razorpayRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        order_id: razorpayData.id,
        amount: razorpayData.amount,
        currency: razorpayData.currency,
        key_id: keyId,
        plan_id: plan_id,
        plan_name: planInfo.name,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
