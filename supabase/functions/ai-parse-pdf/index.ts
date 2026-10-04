import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";

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
    const { pdf_base64, filename } = body;

    if (!pdf_base64) {
      return new Response(JSON.stringify({ error: "No PDF data provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decode base64 PDF to extract text
    const pdfBytes = Uint8Array.from(atob(pdf_base64), (c) => c.charCodeAt(0));

    // Extract text from PDF using a simple approach
    // Since we can't use pdf-parse in Deno, we'll send the PDF directly to Gemini
    // which supports PDF file input via its multimodal API

    let extractedText = "";

    if (GEMINI_API_KEY) {
      // Use Gemini's multimodal API to parse the PDF directly
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inline_data: {
                      mime_type: "application/pdf",
                      data: pdf_base64,
                    },
                  },
                  {
                    text: `You are a schedule parser. Extract all class/event information from this university schedule PDF.

For each class found, extract:
- title: The class/course name
- description: Any additional details (instructor, section, etc.)
- location: Room/building if available
- day_of_week: Full day name (Monday, Tuesday, etc.)
- start_time: 24-hour format HH:MM
- end_time: 24-hour format HH:MM
- recurrence_until: End date of the semester/term in YYYY-MM-DD format, or null if not specified

Return a JSON object with this exact structure:
{
  "events": [
    {
      "title": "string",
      "description": "string or empty",
      "location": "string or empty",
      "day_of_week": "Monday",
      "start_time": "08:00",
      "end_time": "09:30",
      "recurrence_until": "2025-12-20"
    }
  ]
}

Only include actual scheduled classes. Ignore notes, headers, or non-schedule content.`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 4000,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        throw new Error(`Gemini API error: ${geminiResponse.status} - ${errText}`);
      }

      const geminiData = await geminiResponse.json();
      const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textContent) {
        throw new Error("No content returned from Gemini");
      }

      const parsed = JSON.parse(textContent);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (GROQ_API_KEY) {
      // Fallback: try to extract raw text and send to Groq
      extractedText = extractTextFromPdf(pdfBytes);

      if (!extractedText.trim()) {
        return new Response(JSON.stringify({ error: "Could not extract text from PDF" }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content: "You are a schedule parser. Always respond with valid JSON only.",
            },
            {
              role: "user",
              content: `Extract all class/event information from this university schedule text:

${extractedText.substring(0, 8000)}

For each class found, extract:
- title: The class/course name
- description: Any additional details
- location: Room/building if available
- day_of_week: Full day name (Monday, Tuesday, etc.)
- start_time: 24-hour format HH:MM
- end_time: 24-hour format HH:MM
- recurrence_until: End date in YYYY-MM-DD format, or null

Return JSON: {"events": [{"title":"...","description":"...","location":"...","day_of_week":"Monday","start_time":"08:00","end_time":"09:30","recurrence_until":"2025-12-20"}]}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 4000,
          response_format: { type: "json_object" },
        }),
      });

      if (!groqResponse.ok) {
        throw new Error(`Groq API error: ${groqResponse.status}`);
      }

      const groqData = await groqResponse.json();
      const parsed = JSON.parse(groqData.choices[0].message.content);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Fallback: try regex extraction on PDF text if no AI key is configured
      extractedText = extractTextFromPdf(pdfBytes);
      const fallbackEvents = parseScheduleFromText(extractedText);

      if (fallbackEvents.length > 0) {
        return new Response(JSON.stringify({ events: fallbackEvents }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          error: "No AI API key configured. Set GEMINI_API_KEY or GROQ_API_KEY in Supabase secrets.",
        }),
        {
          status: 503,
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

// Simple PDF text extraction - extracts text between BT and ET markers
function extractTextFromPdf(bytes: Uint8Array): string {
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);
  const texts: string[] = [];

  // Look for text in parentheses within BT...ET blocks
  const btEtRegex = /BT\s+(.*?)\s+ET/gs;
  let btMatch;
  while ((btMatch = btEtRegex.exec(raw)) !== null) {
    const block = btMatch[1];
    // Extract text from Tj and TJ operators
    const textRegex = /\(([^)]*)\)\s*Tj/g;
    let textMatch;
    while ((textMatch = textRegex.exec(block)) !== null) {
      texts.push(textMatch[1]);
    }
    // Also handle array TJ
    const arrayRegex = /\[([^\]]*)\]\s*TJ/g;
    let arrayMatch;
    while ((arrayMatch = arrayRegex.exec(block)) !== null) {
      const parts = arrayMatch[1].match(/\(([^)]*)\)/g);
      if (parts) {
        texts.push(parts.map((p) => p.slice(1, -1)).join(""));
      }
    }
  }

  return texts.join("\n");
}

function parseScheduleFromText(text: string): any[] {
  const events: any[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const dayMap: Record<string, string> = {
    senin: "Monday", monday: "Monday",
    selasa: "Tuesday", tuesday: "Tuesday",
    rabu: "Wednesday", wednesday: "Wednesday",
    kamis: "Thursday", thursday: "Thursday",
    jumat: "Friday", friday: "Friday",
    sabtu: "Saturday", saturday: "Saturday",
    minggu: "Sunday", sunday: "Sunday",
  };

  let currentDay = "Monday";
  const timeRegex = /(\d{1,2})[:.](\d{2})\s*[-–—s\/d]+\s*(\d{1,2})[:.](\d{2})/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    for (const [key, dayName] of Object.entries(dayMap)) {
      if (lower.includes(key)) {
        currentDay = dayName;
        break;
      }
    }

    const timeMatch = line.match(timeRegex);
    if (timeMatch) {
      const startH = timeMatch[1].padStart(2, "0");
      const startM = timeMatch[2];
      const endH = timeMatch[3].padStart(2, "0");
      const endM = timeMatch[4];

      const title = lines[i - 1] && lines[i - 1].length > 3 ? lines[i - 1] : "Mata Kuliah";
      events.push({
        title,
        description: "Auto-extracted schedule",
        location: "",
        day_of_week: currentDay,
        start_time: `${startH}:${startM}`,
        end_time: `${endH}:${endM}`,
        recurrence_until: null,
      });
    }
  }

  return events;
}
