// Função serverless (Vercel) que recebe o evento do site e manda pro Facebook
// via Conversions API, com o IP e o user-agent capturados no servidor.
//
// Mesma lógica da versão Netlify (netlify/functions/fb-capi.js) — só a
// assinatura da função e a forma de ler headers/corpo/IP mudam, porque a
// Vercel usa o padrão (req, res) do Node em vez do (event) do Netlify.

const crypto = require('crypto');

function hashValue(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

// Telefone precisa ser normalizado (só dígitos, com código do país) antes do hash
function hashPhone(value) {
  if (!value) return undefined;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return undefined;
  return crypto.createHash('sha256').update(digits).digest('hex');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const PIXEL_ID = process.env.FB_PIXEL_ID;
  const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;

  if (!PIXEL_ID || !ACCESS_TOKEN) {
    res.status(500).json({ error: 'FB_PIXEL_ID ou FB_ACCESS_TOKEN não configurados nas variáveis de ambiente.' });
    return;
  }

  try {
    // Na Vercel, req.body já vem parseado quando o Content-Type é application/json.
    // Mantemos o JSON.parse manual como fallback, caso venha como string.
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    // IP real do visitante, capturado pelo servidor (nunca pelo navegador).
    // x-forwarded-for é o header padrão que a Vercel preenche.
    const ip =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      '';

    const userAgent = req.headers['user-agent'] || '';

    const payload = {
      data: [
        {
          event_name: body.event_name,
          event_time: Math.floor(Date.now() / 1000),
          event_id: body.event_id,
          event_source_url: body.event_source_url,
          action_source: 'website',
          user_data: {
            client_ip_address: ip || undefined,
            client_user_agent: userAgent || undefined,
            fbp: body.fbp || undefined,
            fbc: body.fbc || undefined,
            external_id: hashValue(body.external_id),
            em: hashValue(body.em),
            ph: hashPhone(body.ph),
            fn: hashValue(body.fn),
            ln: hashValue(body.ln),
            ct: hashValue(body.ct),
            st: hashValue(body.st),
            zp: hashValue(body.zp),
            country: hashValue(body.country)
          },
          custom_data: body.custom_data || {}
        }
      ]
    };

    const resp = await fetch(
      `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const data = await resp.json();

    res.status(resp.ok ? 200 : 400).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
