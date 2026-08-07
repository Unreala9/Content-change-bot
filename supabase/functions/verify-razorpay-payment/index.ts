import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyPaymentRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  plan_id: "plan_599" | "plan_799";
  user_id?: string;
}

const PLAN_NAMES: Record<string, { name: string; price: number }> = {
  plan_599: { name: "Basic Plan (₹599)", price: 599 },
  plan_799: { name: "Pro Plan (₹799)", price: 799 },
};

// Native Web Crypto API HMAC SHA-256 (0 external dependencies)
async function computeHmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    msgData
  );

  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!keySecret) {
      return new Response(
        JSON.stringify({ error: "RAZORPAY_KEY_SECRET is not configured in environment variables." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract Bearer token to identify user
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (supabaseUrl && supabaseServiceKey) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "").trim();
        if (token) {
          try {
            const { data: { user } } = await supabaseAdmin.auth.getUser(token);
            if (user) {
              userId = user.id;
            }
          } catch (e) {
            console.warn("Token verify notice:", e);
          }
        }
      }
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_id, user_id } =
      (await req.json()) as VerifyPaymentRequest;

    const targetUserId = userId || user_id;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(
        JSON.stringify({ error: "Missing required Razorpay payment verification fields." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: "Target User ID could not be resolved from auth token or request body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate HMAC SHA256 signature using native Web Crypto API
    const signatureBody = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = await computeHmacSha256Hex(keySecret, signatureBody);

    const isSignatureValid = expectedSignature === razorpay_signature;

    if (!isSignatureValid) {
      return new Response(
        JSON.stringify({ error: "Invalid Razorpay payment signature! Payment verification failed." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const planInfo = PLAN_NAMES[plan_id] || { name: "Paid Plan", price: 599 };
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

    // Update database subscription record
    if (supabaseUrl && supabaseServiceKey && targetUserId) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const subRecord = {
        user_id: targetUserId,
        plan_id: plan_id,
        plan_name: planInfo.name,
        amount_paid: planInfo.price,
        status: "active",
        razorpay_order_id: razorpay_order_id,
        razorpay_payment_id: razorpay_payment_id,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        updated_at: now.toISOString(),
      };

      const { error: dbError } = await supabaseAdmin
        .from("subscriptions")
        .upsert(subRecord, { onConflict: "user_id" });

      if (dbError) {
        console.error("Database update error:", dbError);
        return new Response(
          JSON.stringify({ error: `Database update failed: ${dbError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `🎉 Payment verified! ${planInfo.name} activated successfully.`,
        subscription: {
          user_id: targetUserId,
          plan_id: plan_id,
          plan_name: planInfo.name,
          amount_paid: planInfo.price,
          status: "active",
          razorpay_order_id: razorpay_order_id,
          razorpay_payment_id: razorpay_payment_id,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
        },
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
