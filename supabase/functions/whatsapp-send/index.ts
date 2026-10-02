import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const WHATSAPP_API_URL = Deno.env.get("WHATSAPP_API_URL") || "";
const WHATSAPP_API_TOKEN = Deno.env.get("WHATSAPP_API_TOKEN") || "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { phone_number, message, log_id } = body;

    if (!phone_number || !message) {
      return new Response(JSON.stringify({ error: "Missing phone_number or message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If WhatsApp API is configured, send the message
    if (WHATSAPP_API_URL && WHATSAPP_API_TOKEN) {
      const waResponse = await fetch(`${WHATSAPP_API_URL}/send-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        },
        body: JSON.stringify({
          phone: phone_number,
          message: message,
        }),
      });

      if (!waResponse.ok) {
        const errText = await waResponse.text();
        // Update log as failed
        if (log_id) {
          await supabase
            .from("whatsapp_notification_logs")
            .update({
              status: "FAILED",
              error_message: errText,
              sent_at: new Date().toISOString(),
            })
            .eq("id", log_id);
        }
        throw new Error(`WhatsApp API error: ${waResponse.status}`);
      }

      // Update log as sent
      if (log_id) {
        await supabase
          .from("whatsapp_notification_logs")
          .update({
            status: "SENT",
            sent_at: new Date().toISOString(),
          })
          .eq("id", log_id);
      }

      return new Response(JSON.stringify({ success: true, status: "SENT" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // No WhatsApp API configured — mark as pending with a note
      if (log_id) {
        await supabase
          .from("whatsapp_notification_logs")
          .update({
            status: "PENDING",
            error_message: "WhatsApp API not configured. Set WHATSAPP_API_URL and WHATSAPP_API_TOKEN.",
          })
          .eq("id", log_id);
      }

      return new Response(
        JSON.stringify({
          success: false,
          status: "PENDING",
          message: "WhatsApp API not configured. Set WHATSAPP_API_URL and WHATSAPP_API_TOKEN secrets.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
