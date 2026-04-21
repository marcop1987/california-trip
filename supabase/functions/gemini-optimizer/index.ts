import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Gestione preflight CORS (indispensabile per le chiamate dal browser)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Estraiamo il file dell'itinerario passato dal frontend
    const { tripData } = await req.json()
    
    // Recuperiamo la chiave segreta di Gemini (che salveremo in Supabase, non nel codice HTML)
    const apiKey = Deno.env.get('GEMINI_API_KEY')

    if (!apiKey) {
      throw new Error("Chiave GEMINI_API_KEY mancante nel server.")
    }

    // Costruiamo il Prompt per l'Intelligenza Artificiale
    const prompt = `
Sei un esperto agente di viaggio e logistica, specializzato in on-the-road in California.
Il cliente ti ha inviato il suo itinerario in formato JSON:
${JSON.stringify(tripData)}

Il tuo compito: analizza questo itinerario con occhio critico.
Fornisci UN SINGOLO suggerimento di ottimizzazione molto breve (max 2-3 frasi) e specifico per il suo percorso.
Ad esempio: potresti notare un giorno in cui le ore di guida sono troppe tra Partenza e Arrivo in base a "Cosa Vedere", oppure potresti suggerire una tappa iconica che si trova esattamente lungo la strada in un giorno specifico.
Sii diretto, amichevole, conciso, e parla in italiano. 
Formattazione richiesta: DEVI rispondere rigorosamente in formato JSON con la chiave "suggestion". Niente markdown, niente backtick. Solo questo JSON:
{
  "suggestion": "il tuo fantastico suggerimento qui"
}
`

    // Effettuiamo la chiamata sicura verso Gemini 1.5 Flash
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    })

    const data = await response.json()
    
    // Controlliamo eventuali errori da Google
    if (data.error) {
      throw new Error(data.error.message)
    }

    // Estraiamo il testo della risposta
    const rawText = data.candidates[0].content.parts[0].text
    
    // Estrai il JSON dalla risposta (che potrebbe contenere markdown/backtick)
    const jsonMatch = rawText.match(/{[\s\S]*}/)
    if (!jsonMatch) throw new Error('Risposta AI non valida: JSON non trovato.')
    const jsonResponse = JSON.parse(jsonMatch[0])

    // Rimandiamo il suggerimento al frontend (app.js)
    return new Response(
      JSON.stringify(jsonResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error("Errore Edge Function:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
