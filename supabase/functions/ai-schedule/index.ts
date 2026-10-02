import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
    const {
      task_title,
      task_description,
      estimated_duration_minutes,
      deadline,
      priority,
      events,
    } = body;

    if (!task_title || !estimated_duration_minutes || !deadline) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const deadlineDate = new Date(deadline);
    const next7Days: { start: string; end: string; title: string }[] = [];

    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() + i);
      dayStart.setHours(6, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 0, 0, 0);

      if (dayStart > deadlineDate) break;

      const dayEvents = (events || [])
        .filter((e: any) => {
          const eStart = new Date(e.start_time);
          const eEnd = new Date(e.end_time);
          return eStart >= dayStart && eEnd <= dayEnd;
        })
        .map((e: any) => ({
          start: e.start_time,
          end: e.end_time,
          title: e.title,
        }));

      next7Days.push({
        start: dayStart.toISOString(),
        end: dayEnd.toISOString(),
        title: `Day ${i + 1} (${dayStart.toLocaleDateString("en-US", { weekday: "short" })})`,
        ...dayEvents as any,
      });
    }

    const prompt = `You are a smart scheduling assistant. Find the optimal time slot for a task.

TASK:
- Title: ${task_title}
- Description: ${task_description || "N/A"}
- Estimated duration: ${estimated_duration_minutes} minutes
- Deadline: ${deadline}
- Priority: ${priority}

CURRENT TIME: ${now.toISOString()}

EXISTING EVENTS (next 7 days):
${JSON.stringify(events || [], null, 2)}

RULES:
1. The scheduled slot must be BEFORE the deadline.
2. The scheduled slot must NOT overlap with any existing event.
3. Prefer slots between 8:00 and 22:00.
4. For HIGH priority, schedule as early as possible.
5. For MEDIUM priority, find a balanced slot.
6. For LOW priority, any free slot before deadline is fine.
7. The slot duration must be exactly ${estimated_duration_minutes} minutes.

Return a JSON object with this exact structure:
{
  "scheduled_start_time": "ISO 8601 string",
  "scheduled_end_time": "ISO 8601 string",
  "reasoning": "Brief explanation of why this slot was chosen"
}`;

    let aiResponse;

    if (GROQ_API_KEY) {
      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: "You are a scheduling assistant. Always respond with valid JSON only." },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 500,
          response_format: { type: "json_object" },
        }),
      });

      if (!groqResponse.ok) {
        throw new Error(`Groq API error: ${groqResponse.status}`);
      }

      const groqData = await groqResponse.json();
      aiResponse = JSON.parse(groqData.choices[0].message.content);
    } else {
      // Fallback: simple slot finding algorithm
      const slot = findFreeSlot(events || [], estimated_duration_minutes, deadlineDate, now);
      if (!slot) {
        return new Response(JSON.stringify({ error: "No free slot found in the next 7 days" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      aiResponse = {
        scheduled_start_time: slot.start.toISOString(),
        scheduled_end_time: slot.end.toISOString(),
        reasoning: "Found a free slot in your schedule (fallback algorithm — no AI key configured).",
      };
    }

    return new Response(JSON.stringify(aiResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

function findFreeSlot(
  events: { start_time: string; end_time: string }[],
  durationMinutes: number,
  deadline: Date,
  now: Date
): { start: Date; end: Date } | null {
  const sorted = [...events]
    .map((e) => ({ start: new Date(e.start_time), end: new Date(e.end_time) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  for (let day = 0; day < 7; day++) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() + day);
    dayStart.setHours(8, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setHours(22, 0, 0, 0);

    if (dayStart > deadline) break;

    const dayEvents = sorted.filter(
      (e) => e.start >= dayStart && e.end <= dayEnd
    );

    let cursor = new Date(dayStart);
    if (cursor < now) cursor = new Date(now);

    for (const event of dayEvents) {
      const gap = event.start.getTime() - cursor.getTime();
      if (gap >= durationMinutes * 60000) {
        const slotEnd = new Date(cursor.getTime() + durationMinutes * 60000);
        if (slotEnd <= event.start && slotEnd <= deadline) {
          return { start: cursor, end: slotEnd };
        }
      }
      if (event.end > cursor) cursor = new Date(event.end);
    }

    const gap = dayEnd.getTime() - cursor.getTime();
    if (gap >= durationMinutes * 60000) {
      const slotEnd = new Date(cursor.getTime() + durationMinutes * 60000);
      if (slotEnd <= deadline) {
        return { start: cursor, end: slotEnd };
      }
    }
  }

  return null;
}
